import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluationArtifact} from '../workflow-controller/evaluation.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reportPath=(changeId,stage)=>`reports/semantic-quality/${changeId}/${stage}.json`;

export async function inspectSemanticGate(root,state,stage){
 if(!stage)return {status:'not-applicable',current:false};
 const relative=reportPath(state.changeId,stage),file=path.join(root,relative);
 let report;
 try{report=JSON.parse(await fs.readFile(file,'utf8'));}
 catch(error){if(error.code==='ENOENT')return {status:'missing',current:false,path:relative};throw error;}
 if(!report||report.schemaVersion!==1||typeof report.fingerprint!=='string'||!['PASS','WARN','BLOCK'].includes(report.status))throw Error('Invalid semantic quality report');
 const artifact=await evaluationArtifact(root,state,stage),currentFingerprint=digest(artifact.text);
 if(report.fingerprint!==currentFingerprint)return {status:'stale',current:false,path:relative,reportStatus:report.status};
 return {status:report.status,current:true,path:relative,reportStatus:report.status,fingerprint:report.fingerprint,score:report.score??null};
}

export function assertSemanticNotBlocked(gate,label='workflow action'){
 if(gate?.status==='BLOCK')throw Error(`Semantic quality gate is BLOCK for ${label}; correct the artifact and re-evaluate before continuing`);
}
