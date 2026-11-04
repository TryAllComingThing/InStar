import {createHash} from 'node:crypto';
import {readProjectFile} from './project-baseline.mjs';

const indexFile='docs/project-baseline/capabilities/index.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'&&value.trim();
const DEFAULT_CANDIDATE_LIMIT=24,MAX_CANDIDATE_LIMIT=30;
function queryTerms(query){
 return [...new Set(String(query||'').toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}|[\u4e00-\u9fff]{2,}/g)||[])].slice(0,32);
}
function rankCandidates(capabilities,query='',limit=DEFAULT_CANDIDATE_LIMIT){
 const boundedLimit=Number.isInteger(limit)?Math.max(1,Math.min(MAX_CANDIDATE_LIMIT,limit)):DEFAULT_CANDIDATE_LIMIT;
 const terms=queryTerms(query);
 const scored=capabilities.map(capability=>{
  const name=capability.name.toLowerCase(),summary=capability.summary.toLowerCase(),id=capability.id.toLowerCase(),entry=(capability.entry||'').toLowerCase(),owner=String(capability.owner||'').toLowerCase();
  let score=0;const reasons=[];
  for(const term of terms){
   if(name.includes(term)){score+=8;reasons.push(`name:${term}`);}
   if(summary.includes(term)){score+=5;reasons.push(`summary:${term}`);}
   if(id.includes(term)){score+=3;reasons.push(`id:${term}`);}
   if(entry.includes(term)||owner.includes(term)){score+=2;reasons.push(`scope:${term}`);}
  }
  if(capability.fresh)score+=6;else score-=6;
  if(capability.status==='active')score+=3;else if(capability.status==='deprecated')score-=3;
  if(capability.visibility==='public')score+=2;else if(capability.visibility==='unknown')score-=2;
  if(!terms.length)reasons.push('no-query-stable-priority');
  return {id:capability.id,name:capability.name,summary:capability.summary,entry:capability.entry,visibility:capability.visibility,status:capability.status,fresh:capability.fresh,owner:capability.owner||null,score,reasons:[...new Set(reasons)].slice(0,12),contractFiles:capability.contractFiles||[],consumers:capability.consumers||[],tests:capability.tests||[]};
 }).sort((left,right)=>right.score-left.score||left.id.localeCompare(right.id));
 return {limit:boundedLimit,terms,items:scored.slice(0,boundedLimit),total:scored.length,truncated:scored.length>boundedLimit};
}
export async function reuseContext(root,{query='',limit=DEFAULT_CANDIDATE_LIMIT}={}){
 let raw;try{raw=await readProjectFile(root,indexFile);}catch(e){if(e.code==='ENOENT')return {enabled:false,state:'missing',capabilities:[],fingerprint:null};throw e;}
 const index=JSON.parse(raw);
 if(index.schemaVersion!==1||typeof index.enabled!=='boolean'||!Array.isArray(index.capabilities)||index.capabilities.length>500)throw Error('Invalid capability index');
 const ids=new Set(),capabilities=[];
 for(const c of index.capabilities){
  if(!/^CAP-[A-Z0-9-]+$/.test(c.id)||ids.has(c.id)||!text(c.name)||!text(c.entry)||!text(c.summary)||!['public','internal','unknown'].includes(c.visibility)||!['active','deprecated','missing'].includes(c.status)||!text(c.sourceHash))throw Error('Invalid capability');
  ids.add(c.id);
  if(!Array.isArray(c.sourceFiles||[])||!Array.isArray(c.contractFiles||[]))throw Error('Invalid capability source files');
  const dependencies=[...(c.sourceFiles||[]),...(c.contractFiles||[])];
  if(dependencies.length>64||dependencies.some(p=>!text(p)))throw Error('Invalid capability source files');
  const currentSources={};for(const file of new Set([c.entry,...dependencies])){try{currentSources[file]=hash(await readProjectFile(root,file));}catch(e){if(e.code!=='ENOENT')throw e;currentSources[file]=null;}}
  const currentHash=currentSources[c.entry];
  const dependenciesFresh=dependencies.every(file=>currentSources[file]!==null&&c.sourceHashes?.[file]===currentSources[file]);
  capabilities.push({...c,currentHash,currentSources,fresh:currentHash===c.sourceHash&&dependenciesFresh});
 }
 const inventoryFingerprint=hash(JSON.stringify({raw,sources:capabilities.map(c=>[c.id,c.currentSources])}));
 const ranked=rankCandidates(capabilities,query,limit);
 return {enabled:index.enabled,state:index.enabled?'enabled':'disabled',capabilities,inventoryFingerprint,fingerprint:index.enabled?inventoryFingerprint:null,candidates:ranked.items,candidateLimit:ranked.limit,candidateTerms:ranked.terms,candidateTotal:ranked.total,candidatesTruncated:ranked.truncated,rankingPolicy:'query-metadata-plus-freshness-before-source-reading'};
}
export function validateReuseDecisions(context,decisions){
 if(!Array.isArray(decisions)||!decisions.length)throw Error(`Reuse decisions required; capability inventory is ${context.state||(context.enabled?'enabled':'missing')}. Record the bounded search and choose reuse, adapt, extend, local-new, extract-shared or defer.`);
 for(const d of decisions){
  if(!text(d.need)||!Array.isArray(d.searched)||!d.searched.length||d.searched.some(p=>!text(p))||!text(d.reason)||!text(d.verification)||!Array.isArray(d.candidates)||!['reuse','adapt','extend','local-new','extract-shared','defer'].includes(d.decision))throw Error('Invalid reuse decision');
  if(!context.enabled){
   if(!['local-new','defer'].includes(d.decision)||d.selected||d.candidates.length)throw Error(`Reuse decision requires an enabled capability inventory: ${context.state||'missing'}`);
   continue;
  }
  for(const id of d.candidates)if(!context.capabilities.some(c=>c.id===id))throw Error('Unknown reuse candidate');
  if(['reuse','adapt','extend'].includes(d.decision)){
   const selected=context.capabilities.find(c=>c.id===d.selected);
   if(!selected||!d.candidates.includes(d.selected)||!selected.fresh||selected.status!=='active'||d.sourceHash!==selected.currentHash)throw Error('Selected capability missing, stale or unavailable');
   if(selected.visibility!=='public'&&!text(d.boundaryEvidence))throw Error('Internal/unknown capability requires boundary evidence');
   if(Array.isArray(selected.contractFiles)&&selected.contractFiles.length&&!text(d.contractEvidence))throw Error('Selected capability declares contractFiles; record contractEvidence after checking compatibility');
   if(Array.isArray(selected.consumers)&&selected.consumers.length&&!text(d.callerEvidence))throw Error('Selected capability declares consumers; record callerEvidence after checking affected callers');
  }
  if(d.decision==='extract-shared'&&(!text(d.owner)||!text(d.consumers)||!text(d.publicContract)))throw Error('Shared extraction requires owner, consumers and contract');
 }
}
export function validateReuseReview(context,review,{required=false}={}){
 if(!context.enabled&&!required&&!text(review?.changeId))return;
 if(!review||typeof review!=='object'||Array.isArray(review))throw Error(`Reuse review required; capability inventory is ${context.state||(context.enabled?'enabled':'missing')}`);
 if(context.enabled&&review.fingerprint!==context.fingerprint)throw Error('Reuse review is stale');
 if(!context.enabled&&!['local-new','defer'].includes(review.decisions?.[0]?.decision))throw Error('A missing or disabled capability inventory requires local-new or defer reuse decisions');
 validateReuseDecisions(context,review.decisions);
 for(const id of ['reuse-existing','duplicate-implementation','shared-capability-design']){
  const item=review.checks?.filter(c=>c.id===id);
  if(item?.length!==1||!['PASS','WARN','NA'].includes(item[0].status)||!text(item[0].evidence))throw Error(`Reuse review missing or blocked: ${id}`);
 }
}
export const reusePlanHash=decisions=>hash(JSON.stringify(decisions));
export async function validateReusePlan(root,context,review,{required=false}={}){
 if(!context.enabled&&!required&&!text(review?.changeId))return;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(review?.changeId||''))throw Error('Reuse review requires workflow changeId');
 const state=JSON.parse(await readProjectFile(root,`planning/workflows/${review.changeId}.json`));
 if(!state.approvals?.implementation||review.planHash!==reusePlanHash(state.reuseDecisions||[]))throw Error('Reuse review plan missing or stale');
 const identity=d=>JSON.stringify([d.need,d.decision,d.selected||null,d.candidates,d.owner||null,d.consumers||null,d.publicContract||null]);
 if(JSON.stringify((state.reuseDecisions||[]).map(identity))!==JSON.stringify((review.decisions||[]).map(identity)))throw Error('Reuse decisions differ from approved design; reopen design');
}
