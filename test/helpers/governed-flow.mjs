import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Same scenario runs against source-built and relocated release runtimes.
export async function governedFlow(project,run,reuseApi){
 const dir=path.join(project,'docs/project-baseline');await mkdir(path.join(dir,'capabilities'),{recursive:true});
 await writeFile(path.join(dir,'coding.md'),'# Coding\nCODE-001: Keep contracts explicit.');
 await writeFile(path.join(dir,'rules.json'),JSON.stringify({schemaVersion:1,rules:[{id:'CODE-001',statement:'Keep contracts explicit',status:'observed',scope:['**/*.js'],document:'docs/project-baseline/coding.md'}]}));
 let baseline=await run({action:'baseline-context',project});
 await run({action:'baseline-adopt',project,confirm:true,by:'test maintainer',reason:'Fixture policy',fingerprint:baseline.fingerprint,ids:['CODE-001']});
 const source='export const value=1;',entry='service.js';await writeFile(path.join(project,entry),source);
 const sourceHash=createHash('sha256').update(source).digest('hex');
 const cap={id:'CAP-SERVICE',name:'Service',summary:'Service value',entry,sourceHash,visibility:'public',status:'active'};
 await writeFile(path.join(dir,'capabilities/index.json'),JSON.stringify({schemaVersion:1,enabled:true,capabilities:[cap]}));
 const changeId='governed-extension';let state;
 const call=async(action,extra={})=>{const result=await run({action,project,changeId,expectedVersion:state?.version,...extra});if(result.version)state=result;return result;};
 const approve=()=>call('approve',{reviewHash:state.pendingReview.hash,confirmation:{text:'Approved fixture',source:'fixture'}});
 await call('start',{document:'# PRD\nExtend service.',affectedPaths:[entry]});await call('submit-prd');await approve();
 const ruleReferences=[{id:'CODE-001',status:'PASS',evidence:'Explicit public value contract'}];
 let context=await call('context');await call('create-spec',{contextHash:context.contextHash,ruleReferences,proposal:'## Why\nExtend service.\n## What Changes\nValue changes.\n## Capabilities\nservice\n## Impact\nLocal consumers.',specs:{service:'## Purpose\nExpose a service value so consumers can use a stable observable contract.\n\n## ADDED Requirements\n### Requirement: Value\nThe service SHALL expose its value.\n\n#### Scenario: Read\n- **WHEN** a consumer reads\n- **THEN** the service returns the value\n'}});
 await call('submit-spec',{report:{summary:'Reviewed',source:'fixture',issues:[],unverified:[]}});await approve();context=await call('context');
 const decisions=[{need:'Extend value',searched:[entry],candidates:[cap.id],selected:cap.id,decision:'extend',sourceHash,reason:'Same responsibility',verification:'Consumer contract check'}];
 const document=['Context','Goals / Non-Goals','Decisions','Project Constraints','Architecture','File Change Plan','Risks / Trade-offs','Migration Plan'].map(h=>`## ${h}\nExtend service public value; CODE-001.`).join('\n');
 await call('write-design',{contextHash:context.contextHash,document,ruleReferences,reuseDecisions:decisions});context=await call('context');
 await call('write-tasks',{contextHash:context.contextHash,document:'- [ ] 1.1 Extend service; acceptance: consumer contract is verified.'});await approve();
 const updated='export const value=2;';await writeFile(path.join(project,entry),updated);cap.sourceHash=createHash('sha256').update(updated).digest('hex');await writeFile(path.join(dir,'capabilities/index.json'),JSON.stringify({schemaVersion:1,enabled:true,capabilities:[cap]}));
 await call('complete-task',{taskId:'1.1',evidence:'Fixture consumer contract evidence'});await call('submit-implementation');
 const reuse=await reuseApi.reuseContext(project);
 return {call,ruleReferences,reuseReview:{changeId,planHash:reuseApi.reusePlanHash(decisions),fingerprint:reuse.fingerprint,decisions:[{...decisions[0],sourceHash:cap.sourceHash}],checks:['reuse-existing','duplicate-implementation','shared-capability-design'].map(id=>({id,status:'PASS',evidence:'Fixture inspected public contract and consumer'}))}};
}
