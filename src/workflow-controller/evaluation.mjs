import {readdir} from 'node:fs/promises';
import {appendJsonl,atomic,exists,hash,now,read,requireText,safe} from './files.mjs';
import {changeDir} from './documents.mjs';

export const qualityRubrics={
 prd:['problem-outcome','scope-boundaries','user-journey-states','measurable-acceptance','risks-dependencies'],
 spec:['prd-traceability','normative-requirements','behavior-scenarios','baseline-delta','architecture-impact'],
 design:['constraints-and-sources','decisions-and-tradeoffs','architecture-and-dataflow','interfaces-and-state','file-plan-and-risks'],
 tasks:['spec-design-traceability','dependency-order','task-sized-delivery','task-acceptance-evidence','verification-coverage']
};

async function artifact(root,state,stage){
 if(stage==='prd')return {path:state.prdPath,text:await read(root,state.prdPath)};
 const dir=changeDir(root,state.changeId);
 if(stage==='spec'){
  const proposal=await read(dir,'proposal.md');
  const specsRoot=safe(dir,'specs');let docs='';
  for(const capability of await readdir(specsRoot)){
   const full=safe(specsRoot,capability,'spec.md');if(await exists(full))docs+=`\n\n<!-- ${capability} -->\n${await read(full)}`;
  }
  return {path:`planning/changes/${state.changeId}/(proposal.md + specs/*/spec.md)`,text:proposal+docs};
 }
 if(stage==='design'){
  const path=await exists(safe(dir,'technical-design.md'))?'technical-design.md':'design.md';return {path:`planning/changes/${state.changeId}/${path}`,text:await read(dir,path)};
 }
 if(stage==='tasks')return {path:`planning/changes/${state.changeId}/tasks.md`,text:await read(dir,'tasks.md')};
 throw Error('stage must be prd, spec, design or tasks');
}

export async function evaluate(root,state,input){
 const stage=input.stage;if(!Object.hasOwn(qualityRubrics,stage))throw Error('Unsupported evaluation stage');
 const evaluator=requireText(input.evaluator,'evaluator');
 if(!Array.isArray(input.criteria))throw Error('criteria must be an array');
 const expected=qualityRubrics[stage];const ids=input.criteria.map(x=>x?.id);
 if(ids.length!==expected.length||new Set(ids).size!==expected.length||expected.some(id=>!ids.includes(id)))throw Error(`criteria must cover rubric: ${expected.join(', ')}`);
 const doc=await artifact(root,state,stage),fingerprint=hash(doc.text),criteria=[];
 for(const item of input.criteria){
  if(!['PASS','WARN','BLOCK','NA'].includes(item.status))throw Error(`Invalid status for ${item.id}`);
  requireText(item.reason,`${item.id}.reason`);
  if(!Array.isArray(item.evidence))throw Error(`${item.id}.evidence must be an array`);
  for(const quote of item.evidence){
   requireText(quote,`${item.id}.evidence item`);
   if(!doc.text.includes(quote)){
    const hint=quote.split(/\s+/).filter(Boolean).slice(0,8).join(' ');
    throw Error(`Evidence for ${item.id} is not present in ${doc.path}. Check the full task line or use an exact excerpt; nearest search hint: ${hint}`);
   }
  }
  if(item.status==='PASS'&&!item.evidence.length)throw Error(`PASS requires artifact evidence: ${item.id}`);
  if(['WARN','BLOCK'].includes(item.status)&&!item.evidence.length)throw Error(`${item.status} requires artifact evidence: ${item.id}`);
  criteria.push({id:item.id,status:item.status,reason:item.reason,evidence:item.evidence});
 }
 const status=criteria.some(x=>x.status==='BLOCK')?'BLOCK':criteria.some(x=>['WARN','NA'].includes(x.status))?'WARN':'PASS';
 const applicable=criteria.filter(x=>x.status!=='NA'),score=applicable.length?Math.round(applicable.reduce((sum,x)=>sum+(x.status==='PASS'?1:x.status==='WARN'?0.5:0),0)/applicable.length*100):null;
 const report={schemaVersion:1,changeId:state.changeId,stage,evaluator,artifact:doc.path,fingerprint,score,criteria,status,at:now(),limitations:'AI-assisted semantic assessment; evidence excerpts and artifact fingerprint are mechanically checked, evaluator judgment is not independently proven.'};
 const relative=`reports/semantic-quality/${state.changeId}/${stage}.json`;
 await atomic(root,relative,JSON.stringify(report,null,2)+'\n');
 await appendJsonl(root,'.workflow/traces.jsonl',{type:'quality-evaluation',changeId:state.changeId,stage,artifactFingerprint:fingerprint,status,at:report.at});
 return report;
}
