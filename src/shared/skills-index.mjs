import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest=value=>createHash('sha256').update(value).digest('hex');
export const defaultPluginRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const stages=new Set(['prd','spec','design','tasks','implementation','verification','acceptance']);
const referenceKinds=new Set(['contract','method','checklist','stack','protocol','archive']);
const referenceAuthorities=new Set(['canonical','supporting','archive']);
const referenceRisks=new Set(['low','medium','high']);

function text(value,label,max=300){
 if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value)>max)throw Error(`${label} must be non-empty text up to ${max} bytes`);
 return value.trim();
}
function list(value,label,max=12){
 if(!Array.isArray(value)||!value.length||value.length>max||value.some(item=>typeof item!=='string'||!item.trim()||Buffer.byteLength(item)>160))throw Error(`${label} must be a non-empty bounded list of short strings`);
 return [...new Set(value.map(item=>item.trim()))];
}
function safePluginPath(pluginRoot,relative,label){
 const normalized=text(relative,label,300).replaceAll('\\','/');
 if(path.isAbsolute(normalized)||normalized.split('/').includes('..'))throw Error(`${label} must be plugin-relative`);
 const root=path.resolve(pluginRoot),file=path.resolve(root,normalized);
 if(file!==root&&!file.startsWith(root+path.sep))throw Error(`${label} escapes the plugin root`);
 return file;
}
async function regularFileSize(file,label){
 const stat=await fs.lstat(file);
 if(stat.isSymbolicLink()||!stat.isFile())throw Error(`${label} must be a regular file`);
 return stat.size;
}
function referenceStages(value,label,fallback){
 if(value===undefined)return fallback;
 const result=list(value,label,8);
 if(result.some(stage=>!stages.has(stage)))throw Error(`${label} contains an unknown stage`);
 return result;
}
async function validateReference(reference,index,pluginRoot){
 const label=`skills.references[${index}]`;
 if(!reference||typeof reference!=='object'||Array.isArray(reference))throw Error(`${label} must be an object`);
 const referencePath=text(reference.path,`${label}.path`,300).replaceAll('\\','/');
 if(!referencePath.startsWith('skills/'))throw Error(`${label}.path must stay under skills/`);
 const kind=text(reference.kind,`${label}.kind`,40);
 if(!referenceKinds.has(kind))throw Error(`${label}.kind is invalid`);
 const authority=text(reference.authority,`${label}.authority`,40);
 if(!referenceAuthorities.has(authority))throw Error(`${label}.authority is invalid`);
 const risk=text(reference.risk,`${label}.risk`,20);
 if(!referenceRisks.has(risk))throw Error(`${label}.risk is invalid`);
 return {
  path:referencePath,
  kind,
  stages:referenceStages(reference.stages,`${label}.stages`,null),
  summary:text(reference.summary,`${label}.summary`,400),
  loadWhen:text(reference.loadWhen,`${label}.loadWhen`,400),
  authority,
  risk,
  supersedes:reference.supersedes===undefined?null:text(reference.supersedes,`${label}.supersedes`,300).replaceAll('\\','/'),
  bytes:await regularFileSize(safePluginPath(pluginRoot,referencePath,`${label}.path`),`${label}.path`),
 };
}
async function loadReferenceIndex(pluginRoot){
 const file=path.join(pluginRoot,'skills/references.json');
 let parsed;
 try{parsed=JSON.parse(await fs.readFile(file,'utf8'));}
 catch(error){throw Error(`Unable to read skills/references.json: ${error.message}`);}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.schemaVersion!==1)throw Error('skills/references.json must use schemaVersion 1');
 if(!Array.isArray(parsed.references)||!parsed.references.length||parsed.references.length>200)throw Error('skills/references.json references must contain 1-200 items');
 const references=new Map();
 for(const [index,value] of parsed.references.entries()){
  const reference=await validateReference(value,index,pluginRoot);
  if(references.has(reference.path))throw Error(`Duplicate reference path: ${reference.path}`);
  references.set(reference.path,reference);
 }
 return {schemaVersion:1,policy:typeof parsed.policy==='string'?parsed.policy:'Reference details stay deferred until loadWhen applies.',references};
}
function validateRoute(route,index,referenceIndex){
 if(!route||typeof route!=='object'||Array.isArray(route))throw Error(`skills.routes[${index}] must be an object`);
 const name=text(route.name,`skills.routes[${index}].name`,120);
 if(!/^[a-z][a-z0-9-]*$/.test(name))throw Error(`Invalid Skill route name: ${name}`);
 const routeStages=list(route.stages,`${name}.stages`,8);
 if(routeStages.some(stage=>!stages.has(stage)))throw Error(`${name}.stages contains an unknown stage`);
 const priority=route.priority===undefined?50:route.priority;
 if(!Number.isInteger(priority)||priority<0||priority>1000)throw Error(`${name}.priority must be an integer from 0 to 1000`);
 const references=route.references===undefined?[]:list(route.references,`${name}.references`,12);
 const referenceDetails=references.map(reference=>{
  const detail=referenceIndex.references.get(reference);
  if(!detail)throw Error(`${name}.references is missing metadata for ${reference}`);
  return detail;
 });
 return {
  name,
  path:text(route.path,`${name}.path`,300).replaceAll('\\','/'),
  stages:routeStages,
  triggers:list(route.triggers,`${name}.triggers`,20),
  inputs:list(route.inputs,`${name}.inputs`,8),
  outputs:list(route.outputs,`${name}.outputs`,8),
  priority,
  references,
  referenceDetails,
 };
}

export async function loadSkillsIndex({pluginRoot=defaultPluginRoot}={}){
 const file=path.join(pluginRoot,'skills/index.json');
 let parsed;
 try{parsed=JSON.parse(await fs.readFile(file,'utf8'));}
 catch(error){throw Error(`Unable to read skills/index.json: ${error.message}`);}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.schemaVersion!==1)throw Error('skills/index.json must use schemaVersion 1');
 if(!Array.isArray(parsed.routes)||!parsed.routes.length||parsed.routes.length>100)throw Error('skills/index.json routes must contain 1-100 items');
 const referenceIndex=await loadReferenceIndex(pluginRoot);
 const maxSelected=parsed.maxSelected??4,minTriggerHits=parsed.minTriggerHits??1;
 if(!Number.isInteger(maxSelected)||maxSelected<1||maxSelected>10)throw Error('skills/index.json maxSelected must be an integer from 1 to 10');
 if(!Number.isInteger(minTriggerHits)||minTriggerHits<0||minTriggerHits>5)throw Error('skills/index.json minTriggerHits must be an integer from 0 to 5');
 const routes=[],names=new Set();
 for(const [index,value] of parsed.routes.entries()){
  const route=validateRoute(value,index,referenceIndex);
  if(names.has(route.name))throw Error(`Duplicate Skill route: ${route.name}`);
  if(!route.path.startsWith('skills/')||!route.path.endsWith('/SKILL.md'))throw Error(`${route.name}.path must point to skills/<name>/SKILL.md`);
  if(route.references.some(reference=>!reference.startsWith('skills/')))throw Error(`${route.name}.references must stay under skills/`);
  await regularFileSize(safePluginPath(pluginRoot,route.path,`${route.name}.path`),`${route.name}.path`);
  for(const reference of route.referenceDetails)await regularFileSize(safePluginPath(pluginRoot,reference.path,`${route.name}.reference`),`${route.name}.reference`);
  names.add(route.name);routes.push(route);
 }
 return {schemaVersion:1,policy:typeof parsed.policy==='string'?parsed.policy:'load a full Skill only after routing',maxSelected,minTriggerHits,referencePolicy:referenceIndex.policy,routes};
}

function triggerMatches(trigger,content){
 if(!/^[\x00-\x7f]+$/.test(trigger))return content.includes(trigger);
 const escaped=trigger.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`,'i').test(content);
}
function scoreRoute(route,content,stage){
 let score=100-route.priority,hits=0;
 if(stage&&route.stages.includes(stage))score+=40;
 for(const trigger of route.triggers)if(triggerMatches(trigger,content))hits++;
 score+=Math.min(hits,5)*8;
 return {route,score,triggerHits:hits};
}
async function routeSize(pluginRoot,route){
 const entryBytes=await regularFileSize(safePluginPath(pluginRoot,route.path,`${route.name}.path`),`${route.name}.path`);
 let referenceBytes=0;
 for(const reference of route.referenceDetails)referenceBytes+=reference.bytes;
 return {entryBytes,referenceBytes};
}

export async function selectSkills({pluginRoot=defaultPluginRoot,context='',stage=null}={}){
 if(typeof context!=='string'||Buffer.byteLength(context)>64*1024)throw Error('context must be text up to 64 KiB');
 if(stage!==null&&!stages.has(stage))throw Error('stage must be prd, spec, design, tasks, implementation, verification or acceptance');
 const index=await loadSkillsIndex({pluginRoot}),content=context.toLowerCase();
 const ranked=index.routes.map(route=>scoreRoute(route,content,stage)).sort((left,right)=>right.score-left.score||left.route.priority-right.route.priority||left.route.name.localeCompare(right.route.name));
 const stageEligible=stage===null?ranked:ranked.filter(item=>item.route.stages.includes(stage));
 const positive=stageEligible.filter(item=>item.triggerHits>=index.minTriggerHits);
 const hasContext=Boolean(content.trim());
 const candidates=hasContext&&positive.length?positive:stageEligible;
 const lowConfidence=hasContext&&positive.length===0;
 const selected=[],omitted=[];
 for(const item of ranked){
  if(!candidates.includes(item)){
   omitted.push({name:item.route.name,reason:stage!==null&&!item.route.stages.includes(stage)?`stage ${stage} does not apply`:`insufficient trigger hits (${item.triggerHits}/${index.minTriggerHits})`});
  }
 }
 for(const item of candidates){
  if(selected.length>=index.maxSelected){omitted.push({name:item.route.name,reason:`maxSelected ${index.maxSelected}`});continue;}
  const sizes=await routeSize(pluginRoot,item.route);
  const applicable=item.route.referenceDetails.filter(reference=>(stage===null||(reference.stages??item.route.stages).includes(stage))&&reference.authority!=='archive');
  const omittedReferences=item.route.referenceDetails.filter(reference=>!applicable.includes(reference)).map(reference=>({path:reference.path,kind:reference.kind,stages:reference.stages??item.route.stages,authority:reference.authority,risk:reference.risk,loadWhen:reference.loadWhen,reason:reference.authority==='archive'?'archive reference; open only with explicit need':`stage ${stage} does not apply`}));
  const referenceBytes=applicable.reduce((total,reference)=>total+reference.bytes,0);
  const referenceDetails=applicable.map(reference=>({path:reference.path,kind:reference.kind,stages:reference.stages??item.route.stages,summary:reference.summary,loadWhen:reference.loadWhen,authority:reference.authority,risk:reference.risk,...(reference.supersedes?{supersedes:reference.supersedes}:{}),bytes:reference.bytes,deferred:true}));
  selected.push({name:item.route.name,path:item.route.path,stages:item.route.stages,triggers:item.route.triggers,inputs:item.route.inputs,outputs:item.route.outputs,priority:item.route.priority,triggerHits:item.triggerHits,stageMatched:stage!==null&&item.route.stages.includes(stage),references:applicable.map(reference=>reference.path),referenceDetails,referenceOmitted:omittedReferences,entryBytes:sizes.entryBytes,referenceBytes,referenceIndexBytes:Buffer.byteLength(JSON.stringify(referenceDetails)),detailLoaded:false});
 }
 const payload={schemaVersion:1,stage,confidence:lowConfidence?'low':'high',policy:index.policy,referencePolicy:index.referencePolicy,maxSelected:index.maxSelected,minTriggerHits:index.minTriggerHits,selected,omitted:omitted.slice(0,40),budget:{entryBytes:selected.reduce((total,item)=>total+item.entryBytes,0),referenceBytes:selected.reduce((total,item)=>total+item.referenceBytes,0),referenceIndexBytes:selected.reduce((total,item)=>total+item.referenceIndexBytes,0),detailBytesLoaded:0,contextBytes:Buffer.byteLength(context)}};
 payload.fingerprint=digest(JSON.stringify(payload.selected));
 return payload;
}
