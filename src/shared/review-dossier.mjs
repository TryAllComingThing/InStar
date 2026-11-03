import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const REVIEW_DOSSIER_PATH='reports/review-dossier.json';
const digest=value=>createHash('sha256').update(value).digest('hex');

function checksHash(checks){return digest(JSON.stringify(Array.isArray(checks)?checks:[]));}
function safeReference(value,label){
 if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value)>600)throw Error(`${label} must be a bounded reference string`);
 const file=value.split('#')[0];
 if(!file||path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))throw Error(`${label} must stay inside the workspace`);
 return value;
}
function evidenceReference(check){
 const evidence=check?.evidence;
 if(evidence&&typeof evidence==='object'&&!Array.isArray(evidence)&&typeof evidence.path==='string'&&evidence.path.trim()){
  const start=Number.isInteger(evidence.startLine)?evidence.startLine:Number.isInteger(evidence.line)?evidence.line:null;
  const end=Number.isInteger(evidence.endLine)?evidence.endLine:start;
  if(start)return safeReference(`${evidence.path}#${start===end?`L${start}`:`L${start}-L${end}`}`,`evidence.${check.id}`);
 }
 return `reports/quality-gate.json#/review/checks/${encodeURIComponent(check?.id||'unknown')}`;
}

export function buildReviewDossier({snapshotFingerprint,profiles={},reviewReport=null,reviewSummary=null}={}){
 if(typeof snapshotFingerprint!=='string'||!snapshotFingerprint)throw Error('snapshotFingerprint is required for the review dossier');
 const verificationProfiles={};
 for(const [profile,value] of Object.entries(profiles||{})){
  const checks=Array.isArray(value?.checks)?value.checks:[];
  verificationProfiles[profile]={
   status:value?.status||'UNKNOWN',
   riskLevel:value?.riskLevel||'L1',
   reportId:value?.verificationReportId||null,
   checksHash:checksHash(checks),
   evidenceRefs:[...new Set(checks.map(check=>safeReference(check.evidencePath?`${check.evidencePath}#/checks/${encodeURIComponent(check.id)}`:`reports/unified-quality.json#/profiles/${encodeURIComponent(profile)}/checks/${encodeURIComponent(check.id)}`,`${profile}.${check.id}`)))],
  };
 }
 const checklist=reviewReport?.review||null;
 const reviewId=reviewSummary?.reviewReportId||reviewReport?.id||null;
 const reviewFingerprint=checklist?.fingerprint||reviewSummary?.snapshot?.fingerprint||snapshotFingerprint;
 const reviewChecks=Array.isArray(checklist?.checks)?checklist.checks:[];
 const toolChecks=Array.isArray(reviewReport?.checks)?reviewReport.checks:[];
 const review={
  reportId:reviewId,
  status:reviewSummary?.status||reviewReport?.status||'NOT_RUN',
  riskLevel:reviewSummary?.riskLevel||reviewReport?.riskLevel||'L1',
  fingerprint:reviewFingerprint,
  checklist:{checksHash:checksHash(reviewChecks),evidenceRefs:[...new Set(reviewChecks.map(evidenceReference))]},
  toolChecks:{checksHash:checksHash(toolChecks),evidencePath:toolChecks.some(check=>check.evidencePath)?toolChecks.find(check=>check.evidencePath)?.evidencePath||null:null},
 };
 const body={schemaVersion:1,snapshotFingerprint,verification:{profiles:verificationProfiles},review};
 const fingerprint=digest(JSON.stringify(body));
 return {...body,dossierId:`dossier-${fingerprint.slice(0,24)}`,fingerprint,path:REVIEW_DOSSIER_PATH,policy:'Reference index only. Validate the snapshot and source report hashes before treating referenced evidence as current.'};
}

export function dossierRef(dossier){
 return {path:REVIEW_DOSSIER_PATH,dossierId:dossier.dossierId,fingerprint:dossier.fingerprint};
}

async function readDossier(root){
 const desired=path.resolve(root,REVIEW_DOSSIER_PATH),stat=await fs.lstat(desired);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1024*1024)throw Error('Review dossier must be a regular file up to 1 MiB');
 return JSON.parse(await fs.readFile(desired,'utf8'));
}

export async function validateReviewDossier(root,reference,{snapshotFingerprint,profiles={},reviewReport=null,reviewSummary=null}={}){
 if(!reference||typeof reference!=='object'||Array.isArray(reference)||reference.path!==REVIEW_DOSSIER_PATH)throw Error('Review dossier reference is missing or invalid');
 if(typeof reference.dossierId!=='string'||typeof reference.fingerprint!=='string')throw Error('Review dossier identity is incomplete');
 const dossier=await readDossier(root);
 if(dossier?.schemaVersion!==1||dossier.path!==REVIEW_DOSSIER_PATH||dossier.dossierId!==reference.dossierId||dossier.fingerprint!==reference.fingerprint)throw Error('Review dossier identity mismatch');
 const body={schemaVersion:dossier.schemaVersion,snapshotFingerprint:dossier.snapshotFingerprint,verification:dossier.verification,review:dossier.review};
 const fingerprint=digest(JSON.stringify(body));
 if(fingerprint!==dossier.fingerprint||dossier.dossierId!==`dossier-${fingerprint.slice(0,24)}`)throw Error('Review dossier content hash mismatch');
 if(dossier.snapshotFingerprint!==snapshotFingerprint)throw Error('Review dossier snapshot is stale');
 for(const profile of Object.keys(profiles)){
  const recorded=dossier.verification?.profiles?.[profile],expected=profiles[profile];
  if(!recorded||recorded.reportId!==(expected?.verificationReportId||null)||recorded.checksHash!==checksHash(expected?.checks||[]))throw Error(`Review dossier verification reference mismatch: ${profile}`);
 }
 const checklist=reviewReport?.review||null;
 const recordedReview=dossier.review||{};
 const expectedReviewId=reviewSummary?.reviewReportId||reviewReport?.id||null;
 const expectedReviewChecks=Array.isArray(checklist?.checks)?checklist.checks:[];
 if(expectedReviewId&&recordedReview.reportId!==expectedReviewId)throw Error('Review dossier review reference mismatch');
 if(expectedReviewId&&recordedReview.checklist?.checksHash!==checksHash(expectedReviewChecks))throw Error('Review dossier checklist hash mismatch');
 for(const value of [recordedReview.checklist?.evidenceRefs,Object.values(dossier.verification?.profiles||{}).flatMap(profile=>profile.evidenceRefs||[])])for(const item of value||[])safeReference(item,'review dossier evidence reference');
 return dossier;
}
