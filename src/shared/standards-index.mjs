import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {expandAffectedPaths} from './affected-paths.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
export const defaultPluginRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));

function text(value,label,max=500){
  if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value)>max)throw Error(`${label} must be non-empty text up to ${max} bytes`);
  return value.trim();
}
function stringList(value,label,max=20){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max||value.some(item=>typeof item!=='string'||!item.trim()||Buffer.byteLength(item)>200))throw Error(`${label} must be a bounded list of short strings`);
  return [...new Set(value.map(item=>item.trim()))];
}
function validateEntry(entry,index){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error(`standards.entries[${index}] must be an object`);
  const id=text(entry.id,`standards.entries[${index}].id`,160);
  if(!/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/.test(id))throw Error(`Invalid standards entry id: ${id}`);
  const relative=text(entry.path,`${id}.path`,300).replaceAll('\\','/');
  if(!relative.startsWith('standards/')||path.isAbsolute(relative)||relative.split('/').includes('..'))throw Error(`Invalid standards path for ${id}`);
  if(!Number.isInteger(entry.priority)||entry.priority<0||entry.priority>1000)throw Error(`${id}.priority must be an integer from 0 to 1000`);
  const summary=text(entry.summary,`${id}.summary`,500);
  const keyRules=entry.keyRules===undefined?[summary]:stringList(entry.keyRules,`${id}.keyRules`,4);
  if(!keyRules.length)throw Error(`${id}.keyRules must not be empty`);
  return {
    id,
    path:relative,
    title:text(entry.title,`${id}.title`,160),
    scope:text(entry.scope,`${id}.scope`,80),
    priority:entry.priority,
    always:entry.always===true,
    design:entry.design===true,
    appliesTo:stringList(entry.appliesTo,`${id}.appliesTo`,30),
    triggers:stringList(entry.triggers,`${id}.triggers`,30),
    summary,
    keyRules,
  };
}

export async function loadStandardsIndex({pluginRoot=defaultPluginRoot}={}){
  const file=path.join(pluginRoot,'standards/index.json');
  let parsed;
  try{parsed=JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){throw Error(`Unable to read standards/index.json: ${error.message}`);}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.schemaVersion!==1)throw Error('standards/index.json must use schemaVersion 1');
  if(!Array.isArray(parsed.entries)||!parsed.entries.length||parsed.entries.length>200)throw Error('standards/index.json entries must contain 1-200 items');
  const maxSelected=parsed.maxSelected??6,maxInlineBytes=parsed.maxInlineBytes??4096;
  if(!Number.isInteger(maxSelected)||maxSelected<1||maxSelected>20)throw Error('standards/index.json maxSelected must be an integer from 1 to 20');
  if(!Number.isInteger(maxInlineBytes)||maxInlineBytes<1024||maxInlineBytes>32768)throw Error('standards/index.json maxInlineBytes must be an integer from 1024 to 32768');
  const entries=parsed.entries.map(validateEntry);
  const ids=new Set(),paths=new Set();
  for(const entry of entries){
    if(ids.has(entry.id))throw Error(`Duplicate standards entry id: ${entry.id}`);
    if(paths.has(entry.path))throw Error(`Duplicate standards path: ${entry.path}`);
    ids.add(entry.id);paths.add(entry.path);
  }
  return {
    schemaVersion:1,
    precedence:typeof parsed.precedence==='string'?parsed.precedence:'recommendation; user requirements and project-owned instructions take precedence',
    maxSelected,
    maxInlineBytes,
    entries,
  };
}

function globRegex(pattern){
  let source='';
  for(let index=0;index<pattern.length;index++){
    const char=pattern[index],next=pattern[index+1];
    if(char==='*'&&next==='*'&&pattern[index+2]==='/'){source+='(?:.*/)?';index+=2;continue;}
    if(char==='*'&&next==='*'){source+='.*';index++;continue;}
    if(char==='*'){source+='[^/]*';continue;}
    if(char==='?'){source+='[^/]';continue;}
    source+=/[\^$+?.()|{}[\]\\]/.test(char)?`\\${char}`:char;
  }
  return new RegExp(`^${source}$`,'i');
}
function pathMatches(pattern,relative){
  const normalized=relative.replaceAll('\\','/').replace(/^\.\//,'');
  return (pattern.includes('/')?globRegex(pattern):globRegex(`**/${pattern}`)).test(normalized);
}
function applicabilityFor(entry,resolved){
  if(!resolved.inputs.length||!entry.appliesTo.length)return {status:'applicable',matchedPaths:[],unknownInputs:[]};
  if(!resolved.paths.length)return {status:'unknown',reason:'coarse affected path could not be expanded',matchedPaths:[],unknownInputs:resolved.unknownInputs};
  const matchedPaths=resolved.paths.filter(relative=>entry.appliesTo.some(pattern=>pathMatches(pattern,relative)));
  if(matchedPaths.length)return {status:'applicable',matchedPaths,unknownInputs:[]};
  if(resolved.unknownInputs.length)return {status:'unknown',reason:'some affected paths could not be expanded',matchedPaths:[],unknownInputs:resolved.unknownInputs};
  return {status:'not-applicable',matchedPaths:[],unknownInputs:[]};
}
function triggerMatches(trigger,content){
  if(!/^[\x00-\x7f]+$/.test(trigger))return content.includes(trigger);
  const escaped=trigger.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`,'i').test(content);
}
function groupFor(entry){
  if(entry.id.startsWith('language.'))return 'language';
  return entry.scope;
}
function scoreEntry(entry,{affectedPaths,content,stage}){
  let score=100-entry.priority,hits=0,pathHits=0;
  if(entry.always)score+=24;
  if(stage==='design'&&entry.design)score+=6;
  for(const relative of affectedPaths){
    if(entry.appliesTo.some(pattern=>pathMatches(pattern,relative)))pathHits++;
  }
  if(pathHits)score+=30+Math.min(pathHits-1,2)*4;
  for(const trigger of entry.triggers)if(triggerMatches(trigger,content))hits++;
  score+=Math.min(hits,4)*6;
  return {entry,score,pathHits,triggerHits:hits};
}
function sectionAnchor(heading,index){
 const slug=heading.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'');
 return slug||`section-${index+1}`;
}

export function parseStandardSections(document){
 const lines=String(document).replace(/\r\n/g,'\n').split('\n'),headings=[];
 let fenced=false;
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(/^\s*(```|~~~)/.test(line)){fenced=!fenced;continue;}
  if(fenced)continue;
  const match=line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if(!match)continue;
  const heading=match[2].replace(/`/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').trim();
  if(heading)headings.push({level:match[1].length,heading,startLine:index+1});
 }
 if(!headings.length)headings.push({level:1,heading:'Document',startLine:1});
 const substantive=headings.some(item=>item.level>=2)?headings.filter(item=>item.level>=2):headings;
 return substantive.map((item,index)=>{
  const next=substantive.slice(index+1).find(candidate=>candidate.level<=item.level);
  const endLine=(next?next.startLine:lines.length+1)-1;
  const body=lines.slice(item.startLine-1,endLine).join('\n');
  return {
   anchor:sectionAnchor(item.heading,index),
   heading:item.heading,
   level:item.level,
   startLine:item.startLine,
   endLine,
   bytes:Buffer.byteLength(body),
   hash:digest(body),
  };
 });
}

function sectionScore(section,content,keyRules){
 const raw=section.heading.toLowerCase(),words=raw.split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>=2);
 let score=section.level<=2?2:0;
 for(const word of words)if(content.includes(word))score+=Math.min(word.length,8);
 for(const rule of keyRules){const normalized=rule.toLowerCase();for(const word of words)if(normalized.includes(word))score+=4;}
 return score;
}

function relevantSections(entry,document,context,limit=4){
 const sections=parseStandardSections(document),normalized=String(context||'').toLowerCase();
 const ranked=sections.map((section,index)=>({section,index,score:sectionScore(section,normalized,entry.keyRules)})).sort((left,right)=>right.score-left.score||left.index-right.index);
 return {sections:ranked.slice(0,limit).sort((left,right)=>left.index-right.index).map(item=>item.section),total:sections.length};
}

function ruleRefs(entry,sections){
 return entry.keyRules.map(rule=>{
  const normalized=rule.toLowerCase();
  const ranked=sections.map(section=>{
   const words=section.heading.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>=2);
   return {section,score:words.reduce((score,word)=>score+(normalized.includes(word)?word.length:0),0)};
  }).sort((left,right)=>right.score-left.score||left.section.startLine-right.section.startLine);
  const selected=ranked[0]?.section||sections[0];
  return `${entry.id}#${selected.anchor}`;
 });
}

function compactEntry(entry,documentHash,body,context,{mandatory=false}={}){
 const {sections,total}=relevantSections(entry,body,context);
  return {
    id:entry.id,
    path:entry.path,
    title:entry.title,
    scope:entry.scope,
    priority:entry.priority,
    summary:entry.summary,
    keyRules:entry.keyRules,
    ruleRefs:ruleRefs(entry,sections),
    sections:sections.map(section=>({...section,ref:`${entry.id}#${section.anchor}`})),
    sectionCount:total,
    sectionsOmitted:Math.max(0,total-sections.length),
    appliesTo:entry.appliesTo,
    documentHash,
    mandatory,
    detailLoaded:false,
  };
}

export async function selectStandards({pluginRoot=defaultPluginRoot,affectedPaths=[],context='',projectTree='',stage='spec'}={}){
  const resolved=expandAffectedPaths({affectedPaths,projectTree});
  const index=await loadStandardsIndex({pluginRoot});
  const content=`${typeof context==='string'?context:JSON.stringify(context)}\n${projectTree}`.toLowerCase();
  const evaluated=index.entries.map(entry=>({entry,applicability:applicabilityFor(entry,resolved)}));
  const ranked=evaluated.filter(item=>item.applicability.status==='applicable').map(item=>scoreEntry(item.entry,{affectedPaths:resolved.paths,content,stage})).sort((left,right)=>right.score-left.score||left.entry.priority-right.entry.priority||left.entry.id.localeCompare(right.entry.id));
  const selected=[],omitted=[],unknowns=[],groupCounts=new Map();
  const mandatoryGroups=new Set(resolved.paths.length?['architecture','testing']:['architecture']);
  const mandatoryIds=new Set(ranked.filter(item=>item.entry.always||mandatoryGroups.has(groupFor(item.entry))).map(item=>item.entry.id));
  for(const item of evaluated){
    if(item.applicability.status==='not-applicable')omitted.push({id:item.entry.id,reason:'path not applicable'});
    else if(item.applicability.status==='unknown')unknowns.push({id:item.entry.id,reason:item.applicability.reason,inputs:item.applicability.unknownInputs.slice(0,10)});
  }
  const consider=item=>{
    const group=groupFor(item.entry),limit=group==='language'?3:1;
    if((groupCounts.get(group)||0)>=limit){omitted.push({id:item.entry.id,reason:`group ${group} already represented`});return false;}
    selected.push(item);groupCounts.set(group,(groupCounts.get(group)||0)+1);return true;
  };
  const mandatoryOmitted=[];
  for(const item of ranked.filter(candidate=>mandatoryIds.has(candidate.entry.id))){
    if(selected.length>=index.maxSelected){omitted.push({id:item.entry.id,reason:`maxSelected ${index.maxSelected} (mandatory)`});mandatoryOmitted.push(item.entry.id);continue;}
    consider(item);
  }
  for(const item of ranked){
    if(selected.length>=index.maxSelected)break;
    if(selected.includes(item))continue;
    consider(item);
  }
  for(const item of ranked)if(!selected.includes(item)&&!omitted.some(entry=>entry.id===item.entry.id))omitted.push({id:item.entry.id,reason:`maxSelected ${index.maxSelected}`});

  const selectedEntries=[];
  for(const item of selected){
    const file=path.resolve(pluginRoot,item.entry.path);
    if(!file.startsWith(path.resolve(pluginRoot)+path.sep))throw Error(`Invalid standards path: ${item.entry.path}`);
    let body;
    try{body=await fs.readFile(file,'utf8');}
    catch(error){throw Error(`Referenced standard is unavailable: ${item.entry.path} (${error.code||error.message})`);}
    selectedEntries.push(compactEntry(item.entry,digest(body),body,content,{mandatory:mandatoryIds.has(item.entry.id)}));
  }
  selectedEntries.sort((left,right)=>left.priority-right.priority||left.id.localeCompare(right.id));
  let budgetExceeded=false;
  while(selectedEntries.length&&Buffer.byteLength(JSON.stringify(selectedEntries))>index.maxInlineBytes){
    const removeIndex=selectedEntries.findLastIndex(entry=>!entry.mandatory);
    if(removeIndex<0){budgetExceeded=true;break;}
    const [removed]=selectedEntries.splice(removeIndex,1);
    omitted.push({id:removed.id,reason:`maxInlineBytes ${index.maxInlineBytes}`});
  }
  const payload={
    schemaVersion:1,
    precedence:index.precedence,
    policy:'These are compact applicable rule cards. Read the referenced file only when a selected rule is ambiguous or the task requires its full detail.',
    selected:selectedEntries,
    omitted:omitted.slice(0,80),
    unknowns:unknowns.slice(0,80),
    mandatory:selectedEntries.filter(entry=>entry.mandatory).map(entry=>entry.id),
    applicability:resolved,
    budget:{maxSelected:index.maxSelected,maxInlineBytes:index.maxInlineBytes,inlineBytes:Buffer.byteLength(JSON.stringify(selectedEntries)),sectionRefs:selectedEntries.reduce((total,entry)=>total+entry.sections.length,0),mandatoryCount:selectedEntries.filter(entry=>entry.mandatory).length,mandatoryOmitted,exceeded:budgetExceeded||mandatoryOmitted.length>0},
  };
  payload.complete=unknowns.length===0&&!payload.budget.exceeded;
  payload.fingerprint=digest(JSON.stringify({schemaVersion:1,stage,inputs:resolved.inputs,selected:selectedEntries.map(entry=>({id:entry.id,path:entry.path,documentHash:entry.documentHash})),omitted,unknowns,mandatoryOmitted}));
  return payload;
}
