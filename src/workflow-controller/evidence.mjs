import {safe,exists,read,hash,sourceSnapshot} from './files.mjs';
import {canonicalHash,contentHash} from '../shared/canonical.mjs';
import {readBoundedVerified} from '../shared/bounded-input.mjs';
import {readBufferVerified} from '../shared/path-safety.mjs';
import {assertProfileName,normalizeProfileName,verificationReportVariants,MAX_REPORT_BYTES,MAX_ARTIFACT_BYTES} from '../shared/profile-contract.mjs';
import {loadQualityConfig,snapshot as qualitySnapshot,validateQualityGateReport} from '../quality-controller/index.mjs';
import {validateUiArtifact} from '../shared/ui-evidence.mjs';
import {requiredVerificationLayers,riskFor} from '../shared/risk-policy.mjs';
import {layerCheckIds,layerReportKind,layerReportPath} from '../shared/verification-layers.mjs';

const evidencePath = value => typeof value==='string' && value.startsWith('reports/') && !value.split(/[\\/]/).includes('..');
const evidenceSourceHash = record => record?.sourceHash || (record?.sourceSnapshot ? hash(record.sourceSnapshot) : null);

async function boundedReport(root,relative){
 return readBoundedVerified(root,relative,MAX_REPORT_BYTES);
}

function validateArtifactSemantics(text,artifact,kind,spec){validateUiArtifact(text,kind,artifact,spec);}

async function boundArtifact(root,artifact,kind=null,spec=null){
 if(!evidencePath(artifact))throw Error(`check.artifact must be a reports/ path: ${artifact}`);
 const content=await readBufferVerified(root,artifact);
 if(!content.length)throw Error(`check.artifact is empty: ${artifact}`);
 if(content.length>MAX_ARTIFACT_BYTES)throw Error(`Artifact exceeds ${MAX_ARTIFACT_BYTES} byte limit`);
 if(kind)validateArtifactSemantics(content.toString('utf8'),artifact,kind,spec);
 return {artifact,artifactHash:contentHash(content),artifactBytes:content.length};
}

function inferKind(id){
 const value=String(id).toLowerCase();
 for(const kind of ['accessibility','keyboard','browser','security','format','lint','typecheck','test','build','dependencies']){
  if(value===kind||value.startsWith(`${kind}-`)||value.endsWith(`-${kind}`)||value.includes(`-${kind}-`))return kind;
 }
 return 'other';
}

function configuredKind(config,id){return config?.tools?.checks?.[id]?.kind||inferKind(id);}

async function strictEvidence(root,state,input,config,requiredKinds,profileName){
 assertProfileName(profileName);
 profileName=normalizeProfileName(profileName);
 const configuredName=config?.verification?.profiles?.[profileName]!==undefined?profileName:profileName==='preflight'&&config?.verification?.profiles?.commit!==undefined?'commit':null;
 const profile=configuredName?config.verification.profiles[configuredName]:null;
 if(!Array.isArray(profile)||!profile.length)throw Error(`Strict verification requires .instar-quality.json verification.profiles.${profileName} (legacy alias: commit)`);
 const variants=verificationReportVariants(profileName);let reportPath=null;
 for(const variant of variants){const candidate=`reports/${variant.kind}.json`;if(await exists(safe(root,candidate))){reportPath=candidate;break;}}
 if(!reportPath)throw Error(`Strict verification requires a fresh ${profileName} verification report`);
 const reportText=await boundedReport(root,reportPath);let report;
 try{report=JSON.parse(reportText);}catch{throw Error(`Invalid ${profileName} verification report`);}
 if(!report||typeof report.id!=='string'||!report.id.trim())throw Error('Strict verification report requires a non-empty report id');
 const expected=variants.find(variant=>report.kind===variant.kind&&report.profile===variant.profile);
 if(!expected)throw Error(`Verification report must use the ${profileName} profile and its canonical or legacy report kind`);
 if(report.stable!==true||!['PASS','PASS_WITH_WAIVERS'].includes(report.status))throw Error('Strict verification report must be stable and passing');
 if(report.cache&&report.cache.enabled!==false)throw Error(`Strict verification ${profileName} report was cached; frozen full verification must be rerun uncached`);
 if(typeof report.at!=='string'||!Number.isFinite(Date.parse(report.at)))throw Error('Strict verification report requires a valid timestamp');
 const current=await qualitySnapshot(root),configHash=canonicalHash(config);
 if(report.snapshot?.fingerprint!==current.fingerprint)throw Error(`Strict verification ${profileName} report is stale; rerun it against the current source and configuration`);
 if(report.configHash!==configHash)throw Error(`Strict verification ${profileName} report was produced with a different quality configuration; rerun it`);
 if(!report.checkDefinitions||typeof report.checkDefinitions!=='object'||Array.isArray(report.checkDefinitions))throw Error(`Strict verification ${profileName} report is missing check definition hashes`);
 for(const id of profile)if(report.checkDefinitions[id]!==canonicalHash(config.tools.checks[id]))throw Error(`Verification check definition changed after the report was produced: ${id}`);
 const seen=new Set(),reported=new Map(),reportArtifacts=new Set();
 for(const check of report.checks||[]){
  if(typeof check?.id!=='string'||!check.id.trim())throw Error('Verification report contains a check without an id');
  if(seen.has(check.id))throw Error(`Verification report contains duplicate check: ${check.id}`);
  seen.add(check.id);reported.set(check.id,check);
 }
 const missing=profile.filter(id=>reported.get(id)?.status!=='PASS');
 if(missing.length)throw Error(`Verification report has missing or failed configured checks: ${missing.join(', ')}`);
 for(const id of profile){
  const check=reported.get(id);
  if(!evidencePath(check.artifact)||check.artifact===reportPath)throw Error(`Verification report check ${id} requires a reports/ artifact separate from the report`);
  if(reportArtifacts.has(check.artifact))throw Error(`Verification report reuses artifact: ${check.artifact}`);
  if(typeof check.artifactHash!=='string'||!/^[a-f0-9]{64}$/.test(check.artifactHash))throw Error(`Verification report check ${id} is missing a valid artifact hash`);
  reportArtifacts.add(check.artifact);
 }
 if(!Array.isArray(input.checks)||!input.checks.length)throw Error('Verification checks required');
 const checks=[],seenChecks=new Set();
 for(const check of input.checks){
  const checkId=check.checkId||check.id;
  if(!checkId||!profile.includes(checkId))throw Error(`Verification check is not configured in ${profileName} profile: ${checkId||'(missing checkId)'}`);
  if(seenChecks.has(checkId))throw Error(`Verification check submitted more than once: ${checkId}`);
  seenChecks.add(checkId);
  if(check.reportId!==report.id)throw Error(`Verification check ${checkId} must reference report ${report.id}`);
  if(check.kind!==configuredKind(config,checkId))throw Error(`Verification check ${checkId} kind must match configured kind ${configuredKind(config,checkId)}`);
  if(check.outcome!=='passed')throw Error(`Verification check did not pass: ${checkId}`);
  if(typeof check.artifact!=='string'||!check.artifact.trim())throw Error(`check.artifact required: ${checkId}`);
  if(check.artifact!==reported.get(checkId).artifact)throw Error(`Verification check ${checkId} artifact must match the generated report`);
  const artifact=await boundArtifact(root,check.artifact,check.kind,config.tools.checks[checkId]);
  if(artifact.artifactHash!==reported.get(checkId).artifactHash)throw Error(`Verification check ${checkId} artifact changed after the report was produced`);
  checks.push({...check,checkId,source:'project-command',reportPath,reportId:report.id,...artifact});
 }
 for(const id of profile){
  if(!checks.some(check=>check.checkId===id))throw Error(`Verification evidence is missing configured check: ${id}`);
 }
 for(const kind of requiredKinds){
  const configuredIds=profile.filter(id=>configuredKind(config,id)===kind);
  if(!configuredIds.length)throw Error(`Quality configuration ${profileName} profile has no ${kind} check; configure tools.checks kind and add it to verification.profiles.${profileName}`);
  if(!checks.some(check=>check.kind===kind&&configuredIds.includes(check.checkId)))throw Error(`Verification evidence is missing required ${kind} check`);
 }
 return {mode:'strict',checks,reportPath,reportId:report.id,reportAt:report.at||null,reportHash:hash(reportText),snapshot:report.snapshot||null,sourceHash:current.fingerprint,configHash};
}

async function strictLayerReport(root,config,current,configHash,layer){
 const ids=layerCheckIds(config,layer),relative=layerReportPath(layer);
 if(!await exists(safe(root,relative)))throw Error(`Layered verification requires a fresh ${layer} report`);
 const text=await boundedReport(root,relative);let report;
 try{report=JSON.parse(text);}catch{throw Error(`Invalid ${layer} verification report`);}
 if(!report||typeof report.id!=='string'||!report.id.trim())throw Error(`${layer} verification report requires a non-empty report id`);
 if(report.kind!==layerReportKind(layer)||report.layer!==layer||report.profile!=='implementation')throw Error(`${layer} verification report must use kind ${layerReportKind(layer)}, profile implementation and layer ${layer}`);
 if(report.stable!==true||!['PASS','PASS_WITH_WAIVERS'].includes(report.status))throw Error(`${layer} verification report must be stable and passing`);
 if(typeof report.at!=='string'||!Number.isFinite(Date.parse(report.at)))throw Error(`${layer} verification report requires a valid timestamp`);
 if(report.snapshot?.fingerprint!==current.fingerprint)throw Error(`${layer} verification report is stale; rerun it against the current source and configuration`);
 if(report.configHash!==configHash)throw Error(`${layer} verification report was produced with a different quality configuration; rerun it`);
 if(!report.checkDefinitions||typeof report.checkDefinitions!=='object'||Array.isArray(report.checkDefinitions))throw Error(`${layer} verification report is missing check definition hashes`);
 for(const id of ids)if(report.checkDefinitions[id]!==canonicalHash(config.tools.checks[id]))throw Error(`${layer} check definition changed after the report was produced: ${id}`);
 const reported=new Map(),reportArtifacts=new Set();
 for(const check of report.checks||[]){
  if(typeof check?.id!=='string'||!check.id.trim())throw Error(`${layer} verification report contains a check without an id`);
  if(reported.has(check.id))throw Error(`${layer} verification report contains duplicate check: ${check.id}`);
  reported.set(check.id,check);
 }
 const missing=ids.filter(id=>reported.get(id)?.status!=='PASS');
 if(missing.length)throw Error(`${layer} verification report has missing or failed configured checks: ${missing.join(', ')}`);
 const checks=[];
 for(const id of ids){
  const check=reported.get(id);
  if(!evidencePath(check.artifact)||check.artifact===relative)throw Error(`${layer} check ${id} requires a reports/ artifact separate from the report`);
  if(reportArtifacts.has(check.artifact))throw Error(`${layer} verification report reuses artifact: ${check.artifact}`);
  if(typeof check.artifactHash!=='string'||!/^[a-f0-9]{64}$/.test(check.artifactHash))throw Error(`${layer} check ${id} is missing a valid artifact hash`);
  const artifact=await boundArtifact(root,check.artifact,configuredKind(config,id),config.tools.checks[id]);
  if(artifact.artifactHash!==check.artifactHash)throw Error(`${layer} check ${id} artifact changed after the report was produced`);
  reportArtifacts.add(check.artifact);
  checks.push({...check,checkId:id,source:'project-command',layer,reportPath:relative,reportId:report.id,...artifact});
 }
 return {layer,reportPath:relative,reportId:report.id,reportHash:hash(text),reportAt:report.at,snapshot:report.snapshot,checks};
}

async function strictLayeredEvidence(root,state,config,requiredKinds){
 const risk=riskFor(state),plan=requiredVerificationLayers(risk);
 const current=await qualitySnapshot(root),configHash=canonicalHash(config),reports=[],checks=[],seen=new Set(),artifacts=new Set();
 for(const layer of plan.layers.filter(item=>item!=='L3')){
  const validated=await strictLayerReport(root,config,current,configHash,layer);
  reports.push({layer,reportPath:validated.reportPath,reportId:validated.reportId,reportHash:validated.reportHash,reportAt:validated.reportAt});
  for(const check of validated.checks){
   if(seen.has(check.checkId))throw Error(`Layered verification repeats check ${check.checkId}; L1 and L2 must have distinct evidence scopes`);
   if(artifacts.has(check.artifact))throw Error(`Layered verification reuses artifact across reports: ${check.artifact}`);
   artifacts.add(check.artifact);
   seen.add(check.checkId);checks.push(check);
  }
 }
 for(const kind of requiredKinds){
  if(!checks.some(check=>check.kind===kind||configuredKind(config,check.checkId)===kind))throw Error(`Layered verification is missing required ${kind} evidence across L1 and L2`);
 }
 if(plan.requireSecurityEvidence&&!checks.some(check=>configuredKind(config,check.checkId)==='security'))throw Error('Governed risk requires security evidence in L1 or L2 before implementation approval');
 return {mode:'strict-layered',checks,reports,reportAt:reports.length?reports.map(item=>item.reportAt).filter(Boolean).sort().at(-1)||null:null,snapshot:current,sourceHash:current.fingerprint,configHash};
}

async function manualEvidence(root,input){
 if(!Array.isArray(input.checks)||!input.checks.length)throw Error('Verification checks required');
 const checks=[],seenChecks=new Set(),artifactPaths=new Set();
 for(const check of input.checks){
  const checkId=check.checkId||check.id||check.name||check.kind;
  if(seenChecks.has(checkId))throw Error(`Verification check submitted more than once: ${checkId}`);
  seenChecks.add(checkId);
  if(check.source!=='manual'||typeof check.manualReason!=='string'||!check.manualReason.trim())throw Error(`Verification check ${check.name||check.kind||'(unnamed)'} must be marked source: manual with manualReason when no quality configuration is present`);
  if(typeof check.artifact!=='string'||!check.artifact.trim())throw Error(`check.artifact required: ${check.name||check.kind}`);
  if(artifactPaths.has(check.artifact))throw Error(`Manual evidence reuses artifact: ${check.artifact}`);
  const artifact=await boundArtifact(root,check.artifact,check.kind);
  artifactPaths.add(check.artifact);
  checks.push({...check,source:'manual',...artifact});
 }
 return {mode:'manual',checks,reportPath:null,reportId:null,reportHash:null,reportAt:new Date().toISOString(),snapshot:null,configHash:null};
}

export async function collectVerificationEvidence(root,state,input,requiredKinds,profileName='full'){
 const configPath='.instar-quality.json';
 const config=await exists(safe(root,configPath))?await loadQualityConfig(root):null;
 if(!config&&state.evidencePolicy?.mode==='strict')throw Error('Quality configuration was removed after the workflow started; restore the validated .instar-quality.json and rerun checks');
 if(config&&state.evidencePolicy?.mode==='strict'&&config.schemaVersion<3)throw Error('Quality configuration was downgraded after the workflow started; schemaVersion 3 or newer is required for strict evidence');
 if(config?.schemaVersion>=3&&profileName==='implementation'&&config.verification?.layers)return strictLayeredEvidence(root,state,config,requiredKinds);
 return config?.schemaVersion>=3?strictEvidence(root,state,input,config,requiredKinds,profileName):manualEvidence(root,input);
}

export async function evidencePolicyFor(root){
 if(!await exists(safe(root,'.instar-quality.json')))return {mode:'manual'};
 const config=await loadQualityConfig(root);
 return {mode:config.schemaVersion>=3?'strict':'manual'};
}

export async function assertQualityGateEvidence(root){
 const relative='reports/quality-gate.json';
 if(!await exists(safe(root,'.instar-quality.json')))throw Error('Implementation approval requires .instar-quality.json and fresh quality-gate evidence');
 if(!await exists(safe(root,relative)))throw Error('Fresh quality-gate evidence is required before implementation approval');
 const text=await boundedReport(root,relative);let report;
 try{report=JSON.parse(text);}catch{throw Error('Invalid quality-gate report');}
 const {snapshot:current}=await validateQualityGateReport(root,report);
 return {reportPath:relative,reportId:report.id,reportHash:hash(text),sourceHash:current.fingerprint,configHash:report.configHash};
}

async function assertArtifacts(root,checks,label){
 for(const check of checks||[]){
  if(typeof check.artifact!=='string'||!check.artifact.trim()||typeof check.artifactHash!=='string')throw Error(`${label} evidence is missing a bound artifact: ${check.checkId||check.name||check.kind||'(unnamed)'}`);
  const artifact=await boundArtifact(root,check.artifact,check.kind);
  if(artifact.artifactHash!==check.artifactHash)throw Error(`${label} artifact changed after evidence was recorded: ${check.artifact}`);
 }
}

function reportBindings(record){
 if(record.evidence?.mode==='strict')return [record.evidence];
 if(record.evidence?.mode==='strict-layered')return Array.isArray(record.evidence.reports)?record.evidence.reports:[];
 return [];
}

async function assertBoundReport(root,record,label){
 const bindings=reportBindings(record);
 if(record.evidence?.mode==='strict-layered'&&!bindings.length)throw Error(`${label} layered evidence is missing its report bindings`);
 for(const binding of bindings){
  const relative=binding.reportPath;
  if(typeof relative!=='string'||typeof binding.reportHash!=='string')throw Error(`${label} evidence is missing a report binding`);
  if(!await exists(safe(root,relative)))throw Error(`${label} verification report is missing: ${relative}`);
  const text=await boundedReport(root,relative);
  if(hash(text)!==binding.reportHash)throw Error(`${label} verification report changed after evidence was recorded: ${relative}`);
  let report;try{report=JSON.parse(text);}catch{throw Error(`${label} verification report is invalid: ${relative}`);}
  if(report.id!==binding.reportId)throw Error(`${label} verification report id changed after evidence was recorded: ${relative}`);
 }
}

async function boundReportFresh(root,record,label){
 if(!record)return {status:'missing',reasons:[`${label} evidence is missing`]};
 const reasons=[];
 const bindings=reportBindings(record);
 if(record.evidence?.mode==='strict-layered'&&!bindings.length)reasons.push(`${label} layered report bindings are missing`);
 for(const binding of bindings){
  const relative=binding.reportPath,tag=binding.layer?`${label} ${binding.layer}`:label;
  if(typeof relative!=='string'||typeof binding.reportHash!=='string')reasons.push(`${tag} report binding is incomplete`);
  else if(!await exists(safe(root,relative)))reasons.push(`${tag} report is missing: ${relative}`);
  else{
   const text=await boundedReport(root,relative);
   if(hash(text)!==binding.reportHash)reasons.push(`${tag} report hash changed`);
   try{if(JSON.parse(text).id!==binding.reportId)reasons.push(`${tag} report id changed`);}catch{reasons.push(`${tag} report is invalid JSON`);}
  }
 }
 for(const check of record.checks||[]){
  try{
   const artifact=await boundArtifact(root,check.artifact,check.kind);
   if(artifact.artifactHash!==check.artifactHash)reasons.push(`${label} artifact changed: ${check.artifact}`);
  }catch(error){reasons.push(error.message);}
 }
 return {status:reasons.length?'stale':'current',reasons};
}

export async function inspectEvidenceFreshness(root,state){
 let snapshot;
 try{snapshot=await sourceSnapshot(root);}catch(error){
  const unavailable={status:'unknown',reasons:[`Source freshness unavailable: ${error.message}`]};
  return {sourceHash:null,implementation:unavailable,verification:unavailable,qualityGate:state.evidencePolicy?.mode==='strict'?unavailable:null};
 }
 const result={sourceHash:snapshot.treeHash,implementation:null,verification:null,qualityGate:null};
 for(const [key,label] of [['implementationReview','Implementation'],['verification','Verification']]){
  const record=state[key];
  if(!record){result[key==='implementationReview'?'implementation':'verification']={status:'missing',reasons:[`${label} evidence is missing`]};continue;}
  const bound=await boundReportFresh(root,record,label),sourceHash=evidenceSourceHash(record);
  const reasons=[...bound.reasons];
  if(sourceHash!==snapshot.treeHash)reasons.push(`${label} evidence was produced for a different source snapshot`);
  result[key==='implementationReview'?'implementation':'verification']={status:reasons.length?'stale':bound.status,sourceHash,reasons};
 }
 if(state.evidencePolicy?.mode==='strict'){
  const gate=state.implementationReview?.qualityGate;
  if(!gate)result.qualityGate={status:'missing',reasons:['Quality-gate evidence is missing']};
  else if(!await exists(safe(root,gate.reportPath)))result.qualityGate={status:'stale',reasons:[`Quality-gate report is missing: ${gate.reportPath}`]};
  else if(hash(await boundedReport(root,gate.reportPath))!==gate.reportHash)result.qualityGate={status:'stale',reasons:['Quality-gate report hash changed']};
  else result.qualityGate={status:'current',reasons:[]};
 }
 return result;
}

export async function assertEvidenceIntegrity(root,state){
 for(const [label,record] of [['Implementation',state.implementationReview],['Verification',state.verification]]){
  if(!record)continue;
  await assertBoundReport(root,record,label);
  await assertArtifacts(root,record.checks,label);
 }
 if(state.evidencePolicy?.mode==='strict'){
  const gate=state.implementationReview?.qualityGate;
  if(!gate)throw Error('Implementation approval is missing its quality-gate evidence binding');
  if(!await exists(safe(root,gate.reportPath)))throw Error(`Quality-gate report is missing: ${gate.reportPath}`);
  if(hash(await boundedReport(root,gate.reportPath))!==gate.reportHash)throw Error('Quality-gate report changed after implementation approval');
 }
}
