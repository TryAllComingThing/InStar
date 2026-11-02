import {createHash} from 'node:crypto';
import {readProjectFile} from './project-baseline.mjs';

const indexFile='docs/project-baseline/capabilities/index.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'&&value.trim();
export async function reuseContext(root){
 let raw;try{raw=await readProjectFile(root,indexFile);}catch(e){if(e.code==='ENOENT')return {enabled:false,capabilities:[],fingerprint:null};throw e;}
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
 return {enabled:index.enabled,capabilities,inventoryFingerprint,fingerprint:index.enabled?inventoryFingerprint:null};
}
export function validateReuseDecisions(context,decisions){
 if(!context.enabled)return;
 if(!Array.isArray(decisions)||!decisions.length)throw Error('Reuse decisions required');
 for(const d of decisions){
  if(!text(d.need)||!Array.isArray(d.searched)||!d.searched.length||d.searched.some(p=>!text(p))||!text(d.reason)||!text(d.verification)||!Array.isArray(d.candidates)||!['reuse','adapt','extend','local-new','extract-shared','defer'].includes(d.decision))throw Error('Invalid reuse decision');
  for(const id of d.candidates)if(!context.capabilities.some(c=>c.id===id))throw Error('Unknown reuse candidate');
  if(['reuse','adapt','extend'].includes(d.decision)){
   const selected=context.capabilities.find(c=>c.id===d.selected);
   if(!selected||!d.candidates.includes(d.selected)||!selected.fresh||selected.status!=='active'||d.sourceHash!==selected.currentHash)throw Error('Selected capability missing, stale or unavailable');
   if(selected.visibility!=='public'&&!text(d.boundaryEvidence))throw Error('Internal/unknown capability requires boundary evidence');
  }
  if(d.decision==='extract-shared'&&(!text(d.owner)||!text(d.consumers)||!text(d.publicContract)))throw Error('Shared extraction requires owner, consumers and contract');
 }
}
export function validateReuseReview(context,review){
 if(!context.enabled)return;
 if(review?.fingerprint!==context.fingerprint)throw Error('Reuse review is stale');
 validateReuseDecisions(context,review.decisions);
 for(const id of ['reuse-existing','duplicate-implementation','shared-capability-design']){
  const item=review.checks?.filter(c=>c.id===id);
  if(item?.length!==1||!['PASS','WARN','NA'].includes(item[0].status)||!text(item[0].evidence))throw Error(`Reuse review missing or blocked: ${id}`);
 }
}
export const reusePlanHash=decisions=>hash(JSON.stringify(decisions));
export async function validateReusePlan(root,context,review){
 if(!context.enabled)return;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(review?.changeId||''))throw Error('Reuse review requires workflow changeId');
 const state=JSON.parse(await readProjectFile(root,`planning/workflows/${review.changeId}.json`));
 if(!state.approvals?.implementation||review.planHash!==reusePlanHash(state.reuseDecisions||[]))throw Error('Reuse review plan missing or stale');
 const identity=d=>JSON.stringify([d.need,d.decision,d.selected||null,d.candidates,d.owner||null,d.consumers||null,d.publicContract||null]);
 if(JSON.stringify((state.reuseDecisions||[]).map(identity))!==JSON.stringify((review.decisions||[]).map(identity)))throw Error('Reuse decisions differ from approved design; reopen design');
}
