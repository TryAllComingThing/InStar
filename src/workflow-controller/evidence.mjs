import {safe,exists,read,hash} from './files.mjs';
import {canonicalHash,contentHash} from '../shared/canonical.mjs';
import {readBoundedVerified} from '../shared/bounded-input.mjs';
import {readBufferVerified} from '../shared/path-safety.mjs';
import {assertProfileName,verificationReportKind,MAX_REPORT_BYTES,MAX_ARTIFACT_BYTES} from '../shared/profile-contract.mjs';
import {loadQualityConfig,snapshot as qualitySnapshot,validateQualityGateReport} from '../quality-controller/index.mjs';

const reportPathFor=profile=>`reports/${verificationReportKind(profile)}.json`;
const evidencePath = value => typeof value==='string' && value.startsWith('reports/') && !value.split(/[\\/]/).includes('..');

async function boundedReport(root,relative){
 return readBoundedVerified(root,relative,MAX_REPORT_BYTES);
}

function validateArtifactSemantics(text,artifact,kind){
 if(!['browser','accessibility','keyboard'].includes(kind))return;
 let report;
 try{report=JSON.parse(text);}catch{throw Error(`${kind} artifact must be JSON with tool evidence: ${artifact}`);}
 if(report?.kind!==kind)throw Error(`${kind} artifact must declare kind ${kind}: ${artifact}`);
 if(report.status!=='PASS')throw Error(`${kind} artifact must be PASS: ${artifact}`);
 if(kind==='accessibility'){
  if(report.tool!=='playwright-axe'||!Number.isInteger(report.routesScanned)||report.routesScanned<1||!Array.isArray(report.violations)||report.violations.length||!Array.isArray(report.incomplete)||report.incomplete.length||!Array.isArray(report.results)||report.results.length<report.routesScanned||report.results.some(result=>!result||typeof result.route!=='string'||!result.route.trim()||!Array.isArray(result.violations)||result.violations.length||!Array.isArray(result.incomplete)||result.incomplete.length))throw Error(`accessibility artifact must contain a passing playwright-axe scan with no violations or incomplete results: ${artifact}`);
 }
 if(kind==='browser'){
  if(report.tool!=='playwright'||report.headless!==true||!Array.isArray(report.journeys)||!report.journeys.length||report.journeys.some(journey=>!journey||typeof journey.route!=='string'||!journey.route.trim()||journey.status!=='PASS'))throw Error(`browser artifact must contain passing headless Playwright journeys: ${artifact}`);
 }
 if(kind==='keyboard'){
  if(!Array.isArray(report.journeys)||!report.journeys.length||report.journeys.some(journey=>!journey||typeof journey.route!=='string'||!journey.route.trim()||!Array.isArray(journey.steps)||!journey.steps.length||journey.steps.some(step=>typeof step!=='string'||!step.trim())||typeof journey.expectedFocus!=='string'||!journey.expectedFocus.trim()||journey.actualFocus!==journey.expectedFocus))throw Error(`keyboard artifact must contain passing route, steps, expectedFocus and actualFocus journeys: ${artifact}`);
 }
}

async function boundArtifact(root,artifact,kind=null){
 if(!evidencePath(artifact))throw Error(`check.artifact must be a reports/ path: ${artifact}`);
 const content=await readBufferVerified(root,artifact);
 if(!content.length)throw Error(`check.artifact is empty: ${artifact}`);
 if(content.length>MAX_ARTIFACT_BYTES)throw Error(`Artifact exceeds ${MAX_ARTIFACT_BYTES} byte limit`);
 if(kind)validateArtifactSemantics(content.toString('utf8'),artifact,kind);
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
 const profile=config?.verification?.profiles?.[profileName];
 if(!Array.isArray(profile)||!profile.length)throw Error(`Strict verification requires .instar-quality.json verification.profiles.${profileName}`);
 const reportPath=reportPathFor(profileName);
 if(!await exists(safe(root,reportPath)))throw Error(`Strict verification requires a fresh ${profileName} verification report`);
 const reportText=await boundedReport(root,reportPath);let report;
 try{report=JSON.parse(reportText);}catch{throw Error(`Invalid ${profileName} verification report`);}
 if(!report||typeof report.id!=='string'||!report.id.trim())throw Error('Strict verification report requires a non-empty report id');
 if(report.kind!==verificationReportKind(profileName)||report.profile!==profileName)throw Error(`Verification report must be ${verificationReportKind(profileName)} for profile ${profileName}`);
 if(report.stable!==true||!['PASS','PASS_WITH_WAIVERS'].includes(report.status))throw Error('Strict verification report must be stable and passing');
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
  const artifact=await boundArtifact(root,check.artifact,check.kind);
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

async function assertBoundReport(root,record,label){
 if(record.evidence?.mode!=='strict')return;
 const relative=record.evidence.reportPath;
 if(typeof relative!=='string'||typeof record.evidence.reportHash!=='string')throw Error(`${label} strict evidence is missing its report binding`);
 if(!await exists(safe(root,relative)))throw Error(`${label} verification report is missing: ${relative}`);
 const text=await boundedReport(root,relative);
 if(hash(text)!==record.evidence.reportHash)throw Error(`${label} verification report changed after evidence was recorded: ${relative}`);
 let report;try{report=JSON.parse(text);}catch{throw Error(`${label} verification report is invalid: ${relative}`);}
 if(report.id!==record.evidence.reportId)throw Error(`${label} verification report id changed after evidence was recorded`);
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
  if(hash(await read(root,gate.reportPath))!==gate.reportHash)throw Error('Quality-gate report changed after implementation approval');
 }
}
