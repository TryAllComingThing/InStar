import {promises as fs} from 'node:fs';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolveTokenSources} from '../shared/token-sources.mjs';
import {parseProjectAgentConfig} from '../shared/agent-config.mjs';
import {redactData,boundedText} from '../shared/redaction.mjs';
import {readCodexSessionUsage} from '../shared/usage-telemetry.mjs';
import {canonicalHash} from '../shared/canonical.mjs';
import {assertProfileName,isProfileName,normalizeProfileName,verificationReportKind,verificationReportVariants,MAX_ARTIFACT_BYTES} from '../shared/profile-contract.mjs';
import {acquireFileLock,releaseFileLock} from '../shared/file-lock.mjs';
import {safePath as safe} from '../shared/path-safety.mjs';
import {openVerified,readHandleVerified,readTextVerified,readBufferVerified,readDirectoryVerified,renameVerified,unlinkVerified,removeFileVerified,pathExistsVerified,ensureDirectoryVerified,lstatVerified} from '../shared/path-safety.mjs';
import {runCommand} from '../shared/run-command.mjs';
import {safeEnvironment} from '../shared/env-safety.mjs';
import {scanSourceInventory,validateInventoryInclude} from '../shared/source-inventory.mjs';
import {evaluateQualityPolicy,validateQualityPolicy} from './policy.mjs';
import {validateUiArtifact,uiArtifactMetadata} from '../shared/ui-evidence.mjs';
import {hasUnresolvedFindings,validateReviewFinding} from '../shared/review-findings.mjs';
import {validatePreviewRuntime,startPreviewRuntime,commandIsAllowed} from '../shared/preview-runtime.mjs';
import {applyUsageBudget} from '../shared/usage-budget.mjs';
import {
 assertCacheableCheck, buildOutputHash, cacheComponents, cacheKey, cachePath,
 expandLayerArgs, layerCheckIds, lockfileHash, normalizeLayerFiles, normalizeVerificationLayer,
 validateVerificationLayers, layerReportKind, assertFrozenFullProfile, validateUiCheckContract
} from '../shared/verification-layers.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
export const reviewItems=['correctness','maintainability','architecture','security','performance','naming','types','component-boundaries','design','accessibility'];
const vueReviewItems=['watch-cleanup','v-for-key','reactive-destructure','props','computed-purity','unmount-cleanup','async-component','lazy-route'];
const backendReviewItems=['api-contract','input-validation','authorization','error-handling','data-consistency','transactions','concurrency','observability'];
export function reviewItemsFor(c={}){
 const language=(c.review?.language||'').toLowerCase(),framework=(c.review?.framework||'').toLowerCase();
 if(!language && !framework) return reviewItems;
 const vue=framework==='vue', backend=['python','java','go'].includes(language);
 return [...new Set([...reviewItems,...(vue?vueReviewItems:[]),...(backend?backendReviewItems:[]),...(c.review?.extraChecks||[])])];
}
const qualityTools = ['vue-doctor','vue-ai-sanitizer','ai-code-gate','design-lint'];
const verifyProfiles = {preflight:['lint','typecheck','dependencies'],implementation:['lint','typecheck','test','build'],full:['lint','typecheck','test','build','dependencies','vite-build']};
function configuredProfileName(c,profile){
 const normalized=normalizeProfileName(profile),profiles=c.verification?.profiles;
 if(!profiles)return null;
 if(profiles[normalized]!==undefined)return normalized;
 if(normalized==='preflight'&&profiles.commit!==undefined)return 'commit';
 return null;
}
function checksForProfile(c,profile){
 const normalized=normalizeProfileName(profile);
 if(c.verification){const configured=configuredProfileName(c,normalized);if(!configured)throw Error(`Verification profile is not configured: ${normalized}${normalized==='preflight'?' (legacy alias: commit)':''}`);return c.verification.profiles[configured];}
 const base=[...verifyProfiles[normalized],...(normalized==='full'&&c.tools?.security?['security-scan']:[]),...(normalized==='full'&&c.scripts?.e2e?['e2e']:[]),...(normalized==='full'&&c.scripts?.visual?['visual']:[])];
 return base;
}
const generated = name => /(^|\/)(reports|logs|node_modules|dist|coverage|\.git|\.workflow|planning)(\/|$)/.test(name) || /^docs\/prd\//.test(name) || /^\.instar\/session\//.test(name) || /^\.context\/(PROJECT_STATE|LESSONS)\.md$/.test(name);
const sensitive = name => /(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);
const evidencePath = value => typeof value==='string' && value.startsWith('reports/') && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..') && !sensitive(value);
function checkIsAllowed(id){
 const configured=process.env.INSTAR_HOOK_ALLOWED_CHECKS;
 if(configured===undefined)return true;
 return new Set(configured.split(',').map(value=>value.trim()).filter(Boolean)).has(id);
}
async function read(root, name) { return readTextVerified(root, name); }
async function json(root, name) { return JSON.parse(await read(root, name)); }
async function exists(root, name) { return pathExistsVerified(root, name); }
async function write(root, name, text, exclusive = false) {
  const parent=path.posix.dirname(name);
  await ensureDirectoryVerified(root,'.',{mode:0o700});
  if(parent!=='.')await ensureDirectoryVerified(root,parent,{mode:0o700});
  const tempRelative=`${name}.${randomUUID()}.tmp`,relative=exclusive?name:tempRelative;
  let stat;
  try {
   const flags=fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL;
   const handle=await openVerified(root,relative,flags,0o600);
   try{await handle.writeFile(text,'utf8');stat=await handle.stat();}finally{await handle.close();}
   if(!exclusive){await renameVerified(root,tempRelative,name,stat);stat=null;}
  }
  finally { if(!exclusive&&stat)await unlinkVerified(root,tempRelative,stat).catch(()=>{}); }
}
function validateConfiguredCheck(c,id){
 const spec=c.tools?.checks?.[id];
 if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(id)||!spec||typeof spec!=='object'||Array.isArray(spec))throw Error(`Invalid tools.checks.${id}`);
 const argBytes=Array.isArray(spec.args)?spec.args.reduce((sum,arg)=>sum+(typeof arg==='string'?Buffer.byteLength(arg):0),0):Infinity;
 const command=spec.command;
 const relativeCommand=typeof command==='string'&&/^[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*$/.test(command)&&!command.split(/[\\/]/).includes('..');
 const safeCommand=typeof command==='string'&&command.length<=256&&!command.includes('\0')&&(relativeCommand||(path.isAbsolute(command)&&command===process.execPath));
 const safeCwd=spec.cwd===undefined||(typeof spec.cwd==='string'&&!path.isAbsolute(spec.cwd)&&!spec.cwd.split(/[\\/]/).includes('..'));
 const safeArgs=Array.isArray(spec.args)&&spec.args.length<=128&&argBytes<=16384&&spec.args.every(arg=>typeof arg==='string'&&!arg.includes('\0')&&Buffer.byteLength(arg)<=2048);
 const safeTimeout=spec.timeoutMs===undefined||(Number.isInteger(spec.timeoutMs)&&spec.timeoutMs>=1&&spec.timeoutMs<=600000);
 if(!safeCommand||!safeArgs||!safeCwd||!safeTimeout||!['lint','format','typecheck','test','build','security','browser','accessibility','keyboard','dependencies'].includes(spec.kind))throw Error(`Invalid tools.checks.${id}`);
 if(spec.incremental!==undefined&&typeof spec.incremental!=='boolean')throw Error(`Invalid tools.checks.${id}.incremental`);
 if(spec.toolVersion!==undefined&&(typeof spec.toolVersion!=='string'||!spec.toolVersion.trim()||spec.toolVersion.length>160))throw Error(`Invalid tools.checks.${id}.toolVersion`);
 if(spec.artifact!==undefined&&!evidencePath(spec.artifact))throw Error(`Invalid tools.checks.${id}.artifact`);
 validateUiCheckContract(c,id);
}
async function config(root) {
  const c = await json(root, '.instar-quality.json');
  if (![1,2,3].includes(c.schemaVersion) || (c.packageManager !== undefined && c.packageManager !== 'npm')) throw Error('Invalid quality configuration');
  if (c.schemaVersion < 3 && c.packageManager !== 'npm') throw Error('Legacy quality configuration requires packageManager: npm');
  if(c.schemaVersion===3&&!c.verification)throw Error('schemaVersion 3 requires verification profiles and tools.checks');
  if (c.verification !== undefined) {
    if (c.schemaVersion < 3 || !c.verification.profiles || typeof c.verification.profiles !== 'object' || Array.isArray(c.verification.profiles) || !c.tools?.checks || typeof c.tools.checks !== 'object' || Array.isArray(c.tools.checks)) throw Error('Custom verification requires schemaVersion 3, verification.profiles and tools.checks');
    if(c.verification.inputs!==undefined&&(!Array.isArray(c.verification.inputs)||c.verification.inputs.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))||new Set(c.verification.inputs).size!==c.verification.inputs.length))throw Error('verification.inputs must be unique workspace-relative file or directory paths');
    for(const value of c.verification.inputs||[])validateInventoryInclude(value,'verification.inputs');
    const allowedProfiles=new Set(['preflight','commit','implementation','full']);
    for(const profile of Object.keys(c.verification.profiles))if(!allowedProfiles.has(profile))throw Error(`Unsupported verification profile: ${profile}`);
    if(c.verification.profiles.preflight===undefined&&c.verification.profiles.commit===undefined)throw Error('verification.profiles.preflight required (legacy alias: commit)');
    if(c.verification.profiles.full===undefined)throw Error('verification.profiles.full required');
    for (const profile of ['preflight','commit','implementation','full']) {
      if(c.verification.profiles[profile]===undefined)continue;
      const ids=c.verification.profiles[profile];
      if (!Array.isArray(ids) || !ids.length || ids.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(id)) || new Set(ids).size!==ids.length) throw Error(`verification.profiles.${profile} must be a non-empty list of unique check ids`);
      for(const id of ids)validateConfiguredCheck(c,id);
    }
    for(const layer of ['L1','L2'])for(const id of c.verification.layers?.[layer]||[])validateConfiguredCheck(c,id);
    validateVerificationLayers(c);
    c.verification.runtime=validatePreviewRuntime(c.verification.runtime);
  }
  if(c.schemaVersion===3&&([...qualityTools,'architecture','security','dependencies','vite-build'].some(key=>c.tools?.[key]!==undefined)||c.scripts!==undefined))throw Error('schemaVersion 3 uses tools.checks and verification.profiles; legacy npm script adapters are not supported');
  if (c.tools?.architecture !== undefined && (typeof c.tools.architecture !== 'string' || !/^[\w:-]+$/.test(c.tools.architecture))) throw Error('tools.architecture must name a package.json script');
  if (c.tools?.security !== undefined && (typeof c.tools.security !== 'string' || !/^[\w:-]+$/.test(c.tools.security))) throw Error('tools.security must name a package.json script');
  if (c.timeoutMs !== undefined && (!Number.isInteger(c.timeoutMs) || c.timeoutMs < 1 || c.timeoutMs > 600000)) throw Error('timeoutMs must be between 1 and 600000');
  if(c.context!==undefined){if(!c.context||typeof c.context!=='object'||Array.isArray(c.context))throw Error('context must be an object');for(const key of ['architecture','design','designSystem','sessionState','lessons'])if(c.context[key]!==undefined&&c.context[key]!==null){const value=c.context[key];if(typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))throw Error(`context.${key} must be a workspace-relative path or null`);if(['architecture','design','designSystem'].includes(key)&&(!/\.md$/i.test(value)||sensitive(value)||generated(value)))throw Error(`context.${key} must be a non-sensitive, non-generated Markdown path`);if(['sessionState','lessons'].includes(key)&&(!/^\.instar\/session\/[^/]+\.md$/i.test(value)||sensitive(value)))throw Error(`context.${key} must stay under .instar/session/ and be a Markdown file`);}if(c.context.tokens!==undefined&&c.context.tokens!==null){const files=Array.isArray(c.context.tokens)?c.context.tokens:[c.context.tokens];if(!files.length||files.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..')||sensitive(value)||generated(value)))throw Error('context.tokens must be a workspace-relative, non-sensitive, non-generated path, a non-empty path array, or null');}}
  if(c.qualityPolicy!==undefined)validateQualityPolicy(c.qualityPolicy);
  if(c.review!==undefined){
   const token=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(value);
   if(!c.review||typeof c.review!=='object'||Array.isArray(c.review))throw Error('Invalid review configuration');
   if(c.review.requireIndependentReview!==undefined||c.review.allowMainAgentFallback!==undefined)throw Error('review.requireIndependentReview and review.allowMainAgentFallback are not supported; configure reviewerPolicy.allowMainAgentFallback on workflow start instead');
   if((c.review.framework!==undefined&&!token(c.review.framework))||(c.review.language!==undefined&&!token(c.review.language))||(c.review.extraChecks!==undefined&&(!Array.isArray(c.review.extraChecks)||c.review.extraChecks.some(x=>!token(x)))))throw Error('Invalid review configuration');
  }
  return c;
}
export async function loadQualityConfig(root){return config(root);}
async function projectContextFiles(root,c={}){
  const result={architecture:c.context?.architecture??null,design:c.context?.design??null,designSystem:c.context?.designSystem??null};
  for(const key of ['architecture','design','designSystem']){
    if(result[key])continue;
    const candidates=key==='architecture'?['ARCHITECTURE.md','docs/engineering/ARCHITECTURE.md','docs/architecture/ARCHITECTURE.md','docs/architecture.md','.context/ARCHITECTURE.md']:key==='design'?['DESIGN.md','docs/engineering/DESIGN.md','docs/design/DESIGN.md','docs/design.md','.context/DESIGN.md']:['design-system/DESIGN.md','design-system/README.md','design-system/index.md','docs/design-system/DESIGN.md','docs/design-system/README.md','docs/design-system/index.md','frontend/design-system/DESIGN.md','frontend/design-system/README.md','frontend/design-system/index.md','frontend/src/design-system/DESIGN.md','frontend/src/design-system/README.md','frontend/src/design-system/index.md','src/design-system/DESIGN.md','src/design-system/README.md','src/design-system/index.md'];
    for(const candidate of candidates)if(await exists(root,candidate)){result[key]=candidate;break;}
  }
  result.designSystemDirectory=null;
  for(const dir of ['design-system','docs/design-system','frontend/design-system','frontend/src/design-system','src/design-system']){
    try{const stat=await lstatVerified(root,dir);if(stat.isDirectory()){result.designSystemDirectory=dir;break;}}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  result.tokenResolution=await resolveTokenSources(root,c.context?.tokens);
  result.tokens=result.tokenResolution.sources;
  return result;
}
async function guidanceFingerprint(root) {
  const c=await config(root),context=await projectContextFiles(root,c);
  const names=new Set(['AGENTS.md','.context/AGENTS.md',...(context.architecture?[context.architecture]:[]),...(context.design?[context.design]:[]),...(context.designSystem?[context.designSystem]:[]),...context.tokens]);
  let scanned=0;
  async function walk(relative,depth){
    if(depth>16||scanned>=20000)throw Error('Project policy scan limit reached; reduce nested policy directories before quality checks');
    let entries;
    try{entries=await readDirectoryVerified(root,relative||'.',{maxEntries:10000,label:`project policy directory: ${relative||'.'}`});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      if(['.git','node_modules','dist','build','coverage','.workflow','.next','.nuxt','vendor'].includes(entry.name))continue;
      const file=relative?`${relative}/${entry.name}`:entry.name;scanned++;
      if(entry.isSymbolicLink()){if(entry.name==='AGENTS.md'||file==='standards')throw Error(`Symlink policy source is not allowed: ${file}`);continue;}
      if(entry.name==='AGENTS.md'||(file.startsWith('standards/')&&entry.isFile()&&/\.(md|mdx|json|ya?ml)$/i.test(entry.name)))names.add(file);
      if(entry.isDirectory()&&(!entry.name.startsWith('.')||entry.name==='.context'))await walk(file,depth+1);
      if(scanned>=20000)throw Error('Project policy scan limit reached; reduce nested policy directories before quality checks');
    }
  }
  await walk('',0);
  const result=[];
  for(const name of [...names].sort()){
    try{const handle=await openVerified(root,name,fsConstants.O_RDONLY);try{const stat=await handle.stat();if(!stat.isFile())continue;result.push([name,digest(await readHandleVerified(root,name,handle))]);}finally{await handle.close();}}
    catch(error){if(error.code!=='ENOENT')throw error;result.push([name,'missing']);}
  }
  return result;
}
export async function snapshot(root) {
  const c = await config(root);
  const context=await projectContextFiles(root,c);
  if(context.tokenResolution.problems.length)throw Error(`Invalid project Token source: ${context.tokenResolution.problems.map(item=>`${item.path} (${item.status})`).join(', ')}`);
  const inventory=await scanSourceInventory(root,{include:c.verification?.inputs||[],label:'quality source snapshot'});
  const guidance=await guidanceFingerprint(root);
  return {
    tree:inventory.fingerprint,
    treeHash:inventory.fingerprint,
    fingerprint:digest(JSON.stringify({treeHash:inventory.fingerprint,guidance})),
    files:inventory.files,
    bytes:inventory.bytes,
    ignorePolicy:inventory.ignorePolicy,
    mode:'workspace-scan',
    guidance,
    trust:inventory.trust
  };
}
async function save(root, kind, data, id=randomUUID()) {
  const report = {schemaVersion:1,kind,id,at:now(),...redactData(data)};
  const text = JSON.stringify(report,null,2)+'\n';
  await write(root, `reports/${kind}-${report.id}.json`, text, true);
  await write(root, `logs/${kind}-${report.id}.md`, `# ${kind}\n\nTime: ${report.at}\nStatus: ${report.status}\nReport: reports/${kind}-${report.id}.json\nFingerprint: ${report.snapshot?.fingerprint || 'not applicable'}\n`, true);
  await write(root, `reports/${kind}.json`, text);
  return report;
}
async function runScript(root, c, script) {
  const pkg = await json(root, 'package.json').catch(()=>({scripts:{}}));
  if (typeof script !== 'string' || !/^[\w:-]+$/.test(script) || !pkg.scripts?.[script]) return {script:script || null,status:'BLOCK',reason:'Required package script missing'};
  if(!checkIsAllowed(script))return {script,status:'BLOCK',error:'ECHECKNOTALLOWED',reason:'Package script is not allowed by INSTAR_HOOK_ALLOWED_CHECKS'};
  if(!commandIsAllowed(c.packageManager))return {script,status:'BLOCK',error:'ECOMMANDNOTALLOWED',reason:'Package manager is not allowed by INSTAR_HOOK_ALLOWED_COMMANDS'};
  const start = Date.now();
  // Scripts are project-owned and must run under the caller's sandbox. Offline flags
  // prevent package fetching, but are NOT an OS network isolation boundary.
  const timeoutMs=c.timeoutMs||120000;
  const env=safeEnvironment();
  const r = await runCommand(c.packageManager, ['run',script], {cwd:root, timeoutMs,
    env:{...env,CI:'true',npm_config_offline:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'}});
  return {script,status:r.status === 0 && !r.error ? 'PASS':'BLOCK',exitCode:r.status,signal:r.signal,error:r.error?.code || null,durationMs:Date.now()-start,outputHash:digest((r.stdout||'')+(r.stderr||'')),reason:r.status === 0 ? 'Completed' : 'Command failed; rerun this script locally for diagnostics (raw output is not persisted)'};
}
async function readArtifactBinding(root,artifact,kind,spec={},binding={}){
 const content=await readBufferVerified(root,artifact,{maxBytes:MAX_ARTIFACT_BYTES});
 if(!content.length)throw Error(`Check artifact is empty: ${artifact}`);
 const ui=validateUiArtifact(content.toString('utf8'),kind,artifact,{...spec,...binding});
 return {artifact,artifactHash:digest(content),artifactBytes:content.length,...uiArtifactMetadata(ui,kind)};
}

async function bindCheckArtifact(root,check,profile,reportId,id,spec,execution={}){
 const artifact=spec.artifact||`reports/evidence/${profile}/${reportId}/${id}.json`;
 if(!spec.artifact)await write(root,artifact,JSON.stringify({schemaVersion:1,profile,reportId,checkId:id,kind:spec.kind,snapshotFingerprint:execution.snapshotFingerprint||null,status:check.status,exitCode:check.exitCode,durationMs:check.durationMs,outputHash:check.outputHash,at:now()},null,2)+'\n',true);
 return readArtifactBinding(root,artifact,spec.kind,spec,{reportId,checkId:id,profile,snapshotFingerprint:execution.snapshotFingerprint,requireRunBinding:true});
}

async function runConfiguredCheck(root,c,profile,reportId,id,spec,runtimeEnv=null,execution={}){
 const start=Date.now(),timeoutMs=spec.timeoutMs||c.timeoutMs||120000;
 if(!checkIsAllowed(id))return {id,command:spec.command,status:'BLOCK',error:'ECHECKNOTALLOWED',durationMs:0,reason:'Configured check is not allowed by INSTAR_HOOK_ALLOWED_CHECKS'};
 if(!commandIsAllowed(spec.command))return {id,command:spec.command,status:'BLOCK',error:'ECOMMANDNOTALLOWED',durationMs:0,reason:'Configured command is not allowed by INSTAR_HOOK_ALLOWED_COMMANDS'};
 const env={...safeEnvironment(),...(runtimeEnv||{}),...(execution.env||{}),INSTAR_REPORT_ID:reportId,INSTAR_CHECK_ID:id,INSTAR_PROFILE:profile,INSTAR_SNAPSHOT_FINGERPRINT:execution.snapshotFingerprint||''};
 const cwd=spec.cwd?await safe(root,spec.cwd):root;if(cwd!==root&&!cwd.startsWith(root+path.sep))return {id,status:'BLOCK',reason:'Check working directory escapes project'};
 if(spec.artifact){
  try{
   await removeFileVerified(root,spec.artifact);
   if(await pathExistsVerified(root,spec.artifact))return {id,command:spec.command,kind:spec.kind,status:'BLOCK',error:'EARTIFACTCLEANUP',durationMs:0,reason:`Existing check artifact could not be removed safely: ${spec.artifact}`};
  }catch(error){return {id,command:spec.command,kind:spec.kind,status:'BLOCK',error:'EARTIFACTCLEANUP',durationMs:0,reason:`Existing check artifact could not be removed safely: ${error.message}`};}
 }
 let r;try{r=await runCommand(spec.command,execution.args||spec.args,{cwd,timeoutMs,env:{...env,CI:'true',npm_config_offline:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'}});}catch(error){return {id,command:spec.command,kind:spec.kind,status:'BLOCK',error:error.code||'SPAWN_ERROR',durationMs:Date.now()-start,reason:'Configured command could not be started'};}
 const result={id,command:spec.command,kind:spec.kind,status:r.status===0&&!r.error?'PASS':'BLOCK',exitCode:r.status,signal:r.signal,error:r.error?.code||null,durationMs:Date.now()-start,outputHash:digest((r.stdout||'')+(r.stderr||''))};
 if(result.status==='PASS'){
  try{Object.assign(result,await bindCheckArtifact(root,result,profile,reportId,id,spec,execution));}
  catch(error){return {...result,status:'BLOCK',reason:`Check artifact evidence is invalid: ${error.message}`};}
 }
 return {...result,reason:result.status==='PASS'?'Completed':'Command failed; rerun locally for diagnostics (raw output is not persisted)'};
}

async function readCachedCheck(root,relative,key,layer,id,spec,snapshotFingerprint){
 let record;
 try{record=await json(root,relative);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(!record||record.schemaVersion!==2||record.type!=='verification-check-cache'||record.key!==key||record.layer!==layer||record.check?.id!==id||record.check?.kind!==spec.kind||record.check?.status!=='PASS')return null;
 const payload={schemaVersion:record.schemaVersion,type:record.type,layer:record.layer,key:record.key,components:record.components,check:record.check,at:record.at};
 if(record.recordHash!==canonicalHash(payload))return null;
 let binding;
 try{binding=await readArtifactBinding(root,record.check.artifact,spec.kind,spec,{snapshotFingerprint});}catch{return null;}
 if(binding.artifactHash!==record.check.artifactHash)return null;
 return {...record.check,status:'PASS',durationMs:0,cacheHit:true,cachedAt:record.at,...binding,reason:'Reused a passing intermediate check for the same evidence key'};
}

async function cachedCheckLookup(root,c,id,spec,execution,cacheContext){
 assertCacheableCheck(c,id,spec);
 let sourceUnitHash=null;
 if(execution.files.length){
  sourceUnitHash=canonicalHash(await Promise.all(execution.files.map(async file=>[file,digest(await readBufferVerified(root,file))])));
 }
 const components=cacheComponents(c,cacheContext.snapshot,{...cacheContext.hashes,sourceUnitHash},id,spec,execution.files);
 const key=cacheKey(components),relative=cachePath(execution.layer,key);
 const cached=await readCachedCheck(root,relative,key,execution.layer,id,spec,cacheContext.snapshot.fingerprint);
 return {cached,key,relative,components};
}

async function saveCachedCheck(root,entry,check,execution){
 if(check.status!=='PASS')return;
 const payload={schemaVersion:2,type:'verification-check-cache',layer:execution.layer,key:entry.key,components:entry.components,check:redactData(check),at:now()};
 await write(root,entry.relative,JSON.stringify({...payload,recordHash:canonicalHash(payload)},null,2)+'\n');
}
async function saveUnifiedQualityReport(root,{profile,verification,policy,review}) {
  const file='reports/unified-quality.json';
  let previous={};try{previous=await json(root,file);}catch(error){if(error.code!=='ENOENT')throw error;}
  const current=verification?.snapshot?.fingerprint||review?.snapshot?.fingerprint||null;
  const existing=previous.snapshotFingerprint===current?previous:{};
  const profiles={...(existing.profiles||{})};
  if(profile)profiles[profile]={status:verification.status,checks:verification.checks,mandatory:policy?.mandatory||[],waivers:policy?.waivers||[],verificationReportId:verification.id};
  const reviewResult=review?{status:review.status,checks:review.checks,reviewReportId:review.id}:existing.review||null;
  const statuses=[...Object.values(profiles).map(p=>p.status),reviewResult?.status].filter(Boolean);
  const status=statuses.includes('FAIL')?'FAIL':statuses.includes('BLOCK')||statuses.includes('BLOCKED')?'BLOCK':statuses.includes('PASS_WITH_WAIVERS')?'PASS_WITH_WAIVERS':statuses.length&&statuses.every(x=>x==='PASS'||x==='WARN')?'PASS':'BLOCK';
  const report={schemaVersion:1,kind:'unified-quality',generatedAt:now(),snapshotFingerprint:current,profiles,review:reviewResult,status,releaseReady:!!reviewResult&&!!profiles.full&&['PASS','PASS_WITH_WAIVERS'].includes(profiles.full.status)&&['PASS','WARN'].includes(reviewResult.status)};
  await write(root,file,JSON.stringify(report,null,2)+'\n');
  const lines=['# InStar Unified Quality Report','',`Status: ${report.status}`,`Release ready: ${report.releaseReady}`,`Snapshot: ${current}`,'','## Verification profiles'];
  for(const [name,data] of Object.entries(profiles)){lines.push(`### ${name} — ${data.status}`);for(const item of data.mandatory)lines.push(`- ${item.category} / ${item.checkId}: ${item.status} (raw: ${item.rawStatus||item.status})`);for(const w of data.waivers)lines.push(`- WAIVER ${w.category}: ${w.reason}; approved by ${w.approvedBy}; expires ${w.expiresAt}`);}
  lines.push('','## Review',reviewResult?`Status: ${reviewResult.status}`:'NOT_RUN','');
  await write(root,'reports/unified-quality.md',lines.join('\n'));
  return report;
}
async function verify(root, profile='full', options={}) {
  const layer=options.layer===undefined?null:normalizeVerificationLayer(options.layer);
  if(layer==='L3')profile='full';
  else if(layer)profile='implementation';
  assertProfileName(profile);
  profile=normalizeProfileName(profile);
  const c = await config(root),configured=configuredProfileName(c,profile);if(c.schemaVersion>=3&&(layer==='L3'||profile==='full'))assertFrozenFullProfile(c);
  const before = await snapshot(root), checks = [], reportId=randomUUID();
  const intermediate=layer==='L1'||layer==='L2';
  if(intermediate&&!c.verification?.layers)throw Error(`verification layer ${layer} requires verification.layers in .instar-quality.json`);
  const ids=intermediate?layerCheckIds(c,layer):checksForProfile(c,profile);
  const files=intermediate?normalizeLayerFiles(options.files,before.changed):[];
  const cacheEnabled=intermediate&&c.verification?.cache?.enabled!==false&&options.cache!==false;
  const cacheContext=cacheEnabled?{snapshot:before,hashes:{lockfileHash:await lockfileHash(root),buildHash:await buildOutputHash(root,c)}}:null;
  const cache={enabled:cacheEnabled,scope:intermediate?'intermediate':'frozen-full',hits:0,misses:0};
  let preview=null;
  try {
    for (const id of ids) {
      if(configured){
        const spec=c.tools.checks[id];
        const needsPreview=['browser','accessibility','keyboard'].includes(spec.kind);
        const execution={layer:layer||'L3',files,args:intermediate?expandLayerArgs(spec,files):spec.args,snapshotFingerprint:before.fingerprint,env:intermediate?{INSTAR_VERIFICATION_LAYER:layer,INSTAR_CHANGED_FILES:files.join('\n')}:{}};
        let cacheEntry=null,cached=null;
        if(cacheEnabled){cacheEntry=await cachedCheckLookup(root,c,id,spec,execution,cacheContext);cached=cacheEntry.cached;}
        if(cached){cache.hits++;checks.push(cached);continue;}
        if(cacheEnabled)cache.misses++;
        if(needsPreview&&c.verification.runtime&&!preview)preview=await startPreviewRuntime(root,c.verification.runtime,safeEnvironment());
        const runtimeEnv=needsPreview&&preview?{INSTAR_BASE_URL:preview.baseUrl,PLAYWRIGHT_BASE_URL:preview.baseUrl,A11Y_BASE_URL:preview.baseUrl,KEYBOARD_BASE_URL:preview.baseUrl}:null;
        const check=await runConfiguredCheck(root,c,profile,reportId,id,spec,runtimeEnv,execution);checks.push(check);
        if(cacheEnabled&&check.status==='PASS')await saveCachedCheck(root,cacheEntry,check,execution);
        if(check.status!=='PASS')break;continue;
      }
      const script=id==='security-scan'?c.tools.security:c.scripts?.[id] || (['dependencies','vite-build'].includes(id) ? c.tools?.[id] : id);
      const check = {id,...await runScript(root,c,script)}; checks.push(check);
      if (check.status !== 'PASS') break;
    }
  } finally {
    if(preview)await preview.stop();
  }
  const buildChecks=profile==='full'?checks.filter(check=>check.kind==='build'&&check.status==='PASS'):[];
  let fullBuildOutputHash=null;
  if(buildChecks.length){
    fullBuildOutputHash=await buildOutputHash(root,c);
    for(const check of buildChecks)check.buildOutputHash=fullBuildOutputHash;
  }
  const after = await snapshot(root), stable = before.fingerprint === after.fingerprint;
  const kind=configured?(intermediate?layerReportKind(layer):verificationReportKind(profile)):`frontend-verify-${profile}`;
  const policy=c.qualityPolicy&&profile!=='implementation'?evaluateQualityPolicy(c.qualityPolicy,profile,[...checks,{id:'evidence-report',status:stable?'PASS':'BLOCK'}],before):null;
  const status=!stable||checks.some(check=>check.status!=='PASS')||policy?.status==='FAIL'?'BLOCK':(profile==='implementation'||c.schemaVersion>=3)?(policy?.status||'PASS'):policy?.status||'BLOCK';
  const result=await save(root,kind,{profile,layer,snapshot:before,configHash:canonicalHash(c),checkDefinitions:configured?Object.fromEntries(ids.map(id=>[id,canonicalHash(c.tools.checks[id])])):null,status,checks,stable,cache,files:intermediate?files:null,...(fullBuildOutputHash?{buildOutputHash:fullBuildOutputHash}:{}),qualityPolicy:policy||{status:'NOT_CONFIGURED',note:c.schemaVersion>=3?'Configured profile is authoritative; qualityPolicy is optional':'Mandatory policy required; legacy verification cannot pass'},coverage:{basis:configured?'project-configured-checks':'mandatory-policy',profile,layer,checkIds:ids,note:configured?'Configured checks passed for this profile; the selected check set does not independently prove coverage of all risks.':undefined}},reportId);
  await saveUnifiedQualityReport(root,{profile:intermediate?layer:profile,verification:result,policy,review:null});
  return result;
}
async function validateReview(root,review,items=reviewItems) {
  if (!review || typeof review.reviewer !== 'string' || !review.reviewer.trim() || typeof review.fingerprint !== 'string') throw Error('Review requires reviewer and snapshot fingerprint');
  if (review.schemaVersion !== undefined && ![1,2].includes(review.schemaVersion)) throw Error('Review schemaVersion must be 1 or 2');
  if (review.schemaVersion === 2 && !['subagent','main-agent-fallback'].includes(review.executionMode)) throw Error('Review schemaVersion 2 requires executionMode subagent or main-agent-fallback');
  if (!Array.isArray(review.checks) || review.checks.length !== items.length || new Set(review.checks.map(c=>c.id)).size !== items.length) throw Error('Review checklist incomplete or duplicated');
  for (const id of items) {
    const item = review.checks.find(c=>c.id===id);
    if (!item || !['PASS','BLOCK','WARN','INFO','NA'].includes(item.status) || typeof item.evidence !== 'string' || !item.evidence.trim()) throw Error(`Missing review evidence: ${id}`);
    if (review.schemaVersion === 2 && item.status !== 'NA') {
      if (!Array.isArray(item.references) || !item.references.length) throw Error(`Review references required for code-level evidence: ${id}`);
      for (const reference of item.references) {
        if (!reference || typeof reference.path !== 'string' || !reference.path.trim()) throw Error(`Invalid review reference path: ${id}`);
        if (path.isAbsolute(reference.path)) throw Error(`Review reference path must be project-relative: ${id}`);
        if (reference.line !== undefined && (!Number.isInteger(reference.line) || reference.line < 1)) throw Error(`Invalid review reference line: ${id}`);
        let content;
        try{content=await readBufferVerified(root,reference.path,{maxBytes:MAX_ARTIFACT_BYTES});}
        catch(error){if(error.code==='ENOENT')throw Error(`Review reference does not exist: ${reference.path}`);throw error;}
        if(content.includes(0))throw Error(`Review reference must be text: ${reference.path}`);
        const contentHash=digest(content);
        if(reference.contentHash!==undefined&&reference.contentHash!==contentHash)throw Error(`Review reference content changed: ${reference.path}`);
        const lineCount=content.length?content.toString('utf8').split(/\r\n|\r|\n/).length:0;
        if(reference.line!==undefined&&reference.line>lineCount)throw Error(`Review reference line ${reference.line} exceeds ${lineCount} lines: ${reference.path}`);
        reference.contentHash=contentHash;reference.bytes=content.length;
      }
    }
  }
  if (!Array.isArray(review.findings) || !Array.isArray(review.unverified)) throw Error('Review requires findings and unverified arrays');
  for (const finding of review.findings) validateReviewFinding(finding);
  for (const reason of review.unverified) if (typeof reason !== 'string' || !reason.trim()) throw Error('Review unverified items must be non-empty strings');
}
async function quality(root, review) {
  const c = await config(root);
  await validateReview(root,review,reviewItemsFor(c));
  review=redactData(review);
  const before = await snapshot(root);
  if (review.fingerprint !== before.fingerprint) throw Error('Review is stale');
  const checks = [];
  let toolBlocked=false;
  for (const id of qualityTools) {
    if(!c.tools?.[id]){checks.push({id,status:'INFO',reason:'Not configured for this project or change'});continue;}
    checks.push({id,...await runScript(root,c,c.tools[id])});
    if (checks.at(-1).status !== 'PASS'){toolBlocked=true;break;}
  }
  if(!toolBlocked)checks.push(c.tools?.architecture
    ? {id:'architecture',...await runScript(root,c,c.tools.architecture)}
    : {id:'architecture',status:'INFO',reason:'No project architecture adapter configured; AI architecture review still applies'});
  const stable = before.fingerprint === (await snapshot(root)).fingerprint;
  const blocked = !stable || checks.some(c=>c.status==='BLOCK') || review.checks.some(c=>c.status==='BLOCK') || hasUnresolvedFindings(review.findings) || review.unverified.length>0;
  const warned = review.checks.some(c=>c.status==='WARN') || review.findings.some(f=>f.severity==='warning');
  const result=await save(root,'quality-gate',{snapshot:before,configHash:canonicalHash(c),status:blocked?'BLOCK':warned?'WARN':'PASS',checks,review,stable});
  await saveUnifiedQualityReport(root,{profile:null,verification:null,policy:null,review:result});
  return result;
}

export async function validateQualityGateReport(root,report){
 const c=await config(root),current=await snapshot(root);
 if(!report||report.kind!=='quality-gate'||typeof report.id!=='string'||!report.id.trim())throw Error('Quality-gate report requires kind and a non-empty id');
 if(report.stable!==true||!['PASS','WARN'].includes(report.status))throw Error('Quality-gate report must be stable and passing');
 if(report.snapshot?.fingerprint!==current.fingerprint||report.review?.fingerprint!==current.fingerprint)throw Error('Quality-gate evidence is stale; rerun it against the current source');
 if(report.configHash!==canonicalHash(c))throw Error('Quality-gate evidence was produced with a different quality configuration; rerun it');
 if(!Array.isArray(report.checks)||!report.checks.length)throw Error('Quality-gate report checks are missing');
 const reportCheckIds=report.checks.map(item=>item?.id);
 if(reportCheckIds.some(id=>typeof id!=='string'||!id.trim())||new Set(reportCheckIds).size!==reportCheckIds.length)throw Error('Quality-gate report checks are missing or duplicated');
 const knownChecks=new Set([...qualityTools,'architecture']);
 if(reportCheckIds.some(id=>!knownChecks.has(id)))throw Error('Quality-gate report contains an unknown check');
 for(const item of report.checks){if(!['PASS','WARN','INFO','BLOCK'].includes(item.status))throw Error(`Quality-gate report has an invalid check status: ${item.id}`);if(item.status==='BLOCK')throw Error(`Quality-gate report contains a blocking check: ${item.id}`);}
 if(qualityTools.some(id=>!reportCheckIds.includes(id))||!reportCheckIds.includes('architecture'))throw Error('Quality-gate report check set is incomplete');
 if(report.review?.schemaVersion!==2)throw Error('Fresh quality-gate evidence with schemaVersion 2 code references is required before implementation approval');
 await validateReview(root,report.review,reviewItemsFor(c));
 if(report.review.checks.some(item=>item.status==='BLOCK'))throw Error('Quality-gate review contains blocking findings');
 if(hasUnresolvedFindings(report.review.findings))throw Error('Quality-gate review contains unresolved critical or warning findings; accepted warnings need a disposition with decision, reason and owner');
 if(report.review.unverified.length)throw Error('Quality-gate review left applicable checks unverified');
 if(!qualityTools.filter(id=>c.tools?.[id]).every(id=>report.checks.some(item=>item.id===id&&item.status==='PASS')))throw Error('Quality-gate tool checks are incomplete');
 if(!c.tools?.architecture&&!report.checks.some(item=>item.id==='architecture'&&item.status==='INFO'))throw Error('Unconfigured architecture check must be explicitly INFO');
 if(c.tools?.architecture&&!report.checks.some(item=>item.id==='architecture'&&item.status==='PASS'))throw Error('Configured architecture check is missing or did not pass');
 return {config:c,snapshot:current};
}

async function doctor(root) {
  let c;
  try { c = await config(root); }
  catch(error) {
    if(error.code==='ENOENT') return save(root,'doctor',{
      status:'BLOCK',
      checks:[{id:'quality-config',path:'.instar-quality.json',status:'BLOCK',reason:'No quality configuration was found; create .instar-quality.json from templates/quality/README.md before running doctor or verification.'}],
      nextSteps:['Create .instar-quality.json with schemaVersion 3, verification.profiles and tools.checks.','Run doctor again after the configured commands exist in the project.','Do not treat a missing configuration as a PASS.']
    });
    return save(root,'doctor',{
      status:'BLOCK',
      checks:[{id:'quality-config',path:'.instar-quality.json',status:'BLOCK',reason:error.message}],
      nextSteps:['Repair the quality configuration before running verification.','Treat this BLOCK as an adoption gap, not a project failure.','Do not suppress configuration validation to obtain a PASS.']
    });
  }
  const checks = [];
  let installed=null,pluginVersion=null;
  try{installed=JSON.parse(await read(root,'.instar.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const pluginRoot=fileURLToPath(new URL('../../',import.meta.url));
  try{pluginVersion=JSON.parse(await readTextVerified(pluginRoot,'.codex-plugin/plugin.json')).version;}catch{try{pluginVersion=JSON.parse(await readTextVerified(pluginRoot,'package.json')).version;}catch{}}
  checks.push({id:'plugin-version',installed:installed?.pluginVersion||null,current:pluginVersion,status:installed?.pluginVersion&&pluginVersion&&installed.pluginVersion===pluginVersion?'PASS':'WARN',reason:!installed?'Project has no .instar.json installation metadata':!installed.pluginVersion?'Installation pluginVersion is missing; rerun initialize-project to reconcile managed assets':installed.pluginVersion!==pluginVersion?`Installed pluginVersion ${installed.pluginVersion} differs from the running plugin ${pluginVersion}; rerun initialize-project and doctor`:undefined});
  const context=await projectContextFiles(root,c);
  checks.push({id:'context:architecture',path:context.architecture,status:context.architecture?(await exists(root,context.architecture)?'PASS':'BLOCK'):'INFO',reason:context.architecture?undefined:'No project architecture document configured or discovered; architecture review uses available project instructions and code'});
  checks.push({id:'context:design',path:context.design,status:context.design?(await exists(root,context.design)?'PASS':'BLOCK'):'INFO',reason:context.design?undefined:'No project design document configured or discovered; design review uses available project guidance and code'});
  const designSystemStatus=context.designSystem?(await exists(root,context.designSystem)?'PASS':'BLOCK'):context.designSystemDirectory?'WARN':'INFO';
  const designSystemReason=context.designSystem?undefined:context.designSystemDirectory?`Project design-system directory was found (${context.designSystemDirectory}) but no manifest was discovered; configure context.designSystem or add DESIGN.md, README.md, or index.md so designCheck can bind the project-owned source`:'No project design-system manifest configured or discovered; token sources and project design guidance remain usable';
  checks.push({id:'context:designSystem',path:context.designSystem,directory:context.designSystemDirectory,status:designSystemStatus,reason:designSystemReason});
  checks.push({id:'context:tokens',configured:context.tokenResolution.configured,discovered:context.tokenResolution.discovered,paths:context.tokenResolution.results,status:context.tokenResolution.problems.length?'BLOCK':context.tokens.length?'PASS':'INFO',reason:context.tokenResolution.problems.length?'Configured or discovered Token sources must be regular, workspace-local files without symlinks':context.tokens.length?undefined:'No project Design Token source configured or discovered; do not invent token mappings'});
  if(c.schemaVersion<3)checks.push({id:'quality-config-version',status:'WARN',schemaVersion:c.schemaVersion,targetSchemaVersion:3,reason:'Legacy quality configuration remains readable, but it cannot provide schema 3 strict command evidence. Migrate to schemaVersion 3; compatibility support is planned for removal in the next major release.'});
  const agentConfigPath='.codex/config.toml';
  let installationStack='fullstack';
  try{const initialized=JSON.parse(await read(root,'.instar.json'));const scope=initialized.installationScope??initialized.stack;if(['frontend','backend','fullstack'].includes(scope))installationStack=scope;}catch(error){if(error.code!=='ENOENT')throw error;}
  const allExpected=Object.fromEntries(Object.entries({architect:'agents/architect.toml',developer:'agents/developer.toml','ui-reviewer':'agents/ui-reviewer.toml','code-reviewer':'agents/code-reviewer.toml','security-reviewer':'agents/security-reviewer.toml','spec-reviewer':'agents/spec-reviewer.toml','frontend-reviewer':'agents/frontend-reviewer.toml'}).filter(([name])=>installationStack!=='backend'||!['ui-reviewer','frontend-reviewer'].includes(name)));
  const allRoleNames=Object.keys(allExpected);
  let agentStatus='INFO',agentDetails={registered:[],missing:allRoleNames};
  try{
    let stat;
    try{stat=await lstatVerified(root,agentConfigPath);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(stat){
      if(!stat.isFile())throw Error('Project Codex config must be a regular file');
      const parsed=parseProjectAgentConfig(await read(root,agentConfigPath));
      const expected=allExpected;
      const registered=[],missing=[];
      for(const [name,relative] of Object.entries(expected)){
        const item=parsed.agents?.[name];
        if(item?.config_file!==relative){missing.push(name);continue;}
        const agentPath=`.codex/${relative}`;
        try{parseProjectAgentConfig(await read(root,agentPath));registered.push(name);}catch(error){if(error.code==='ENOENT'||error.code==='EISDIR')missing.push(name);else throw error;}
      }
      agentDetails={registered,missing};agentStatus=missing.length?'WARN':'PASS';
    }
  }catch(error){agentStatus='BLOCK';agentDetails={registered:[],missing:allRoleNames,reason:error.message};}
  checks.push({id:'codex:agents',path:agentConfigPath,status:agentStatus,...agentDetails,trustNote:'Codex loads project-level .codex configuration only after the project is trusted.'});
  for(const [key,label] of [['sessionState','context:session-state'],['lessons','context:lessons']])if(c.context?.[key])checks.push({id:label,path:c.context[key],status:await exists(root,c.context[key])?'PASS':'WARN',reason:'Optional session context destination'});
  if(c.schemaVersion<3)for (const file of ['package.json','package-lock.json','node_modules']) checks.push({id:file,status:await exists(root,file)?'PASS':'WARN'});
  if(c.verification){
    const kinds=ids=>[...new Set(ids.map(id=>c.tools.checks[id]?.kind).filter(Boolean))];
    const preflightKey=c.verification.profiles.preflight!==undefined?'preflight':c.verification.profiles.commit!==undefined?'commit':null;
    const profiles={preflight:preflightKey?c.verification.profiles[preflightKey]:null,implementation:c.verification.profiles.implementation||null,full:c.verification.profiles.full};
    const missing=[];
    if(!profiles.preflight)missing.push('preflight profile');
    if(!profiles.implementation)missing.push('implementation profile');
    else for(const kind of ['lint','format','test'])if(!kinds(profiles.implementation).includes(kind))missing.push(`implementation ${kind}`);
    if(!kinds(profiles.full).includes('security'))missing.push('full security');
    const legacyProfiles=preflightKey==='commit'?['commit']:[];
    const profileNotes=[missing.length?`Profile preflight is incomplete: ${missing.join(', ')}`:null,legacyProfiles.length?'Legacy verification profile "commit" is supported; migrate to "preflight" before the next major release':null].filter(Boolean);
    checks.push({id:'configured-verification',status:profileNotes.length?'WARN':'PASS',profiles,legacyProfiles,kinds:{preflight:kinds(profiles.preflight||[]),implementation:profiles.implementation?kinds(profiles.implementation):[],full:kinds(profiles.full)},missingKinds:missing,reason:profileNotes.length?profileNotes.join(' '):'Configured command profiles were inspected; doctor does not execute them'});
    const implementationIds=profiles.implementation||[],fullIds=profiles.full||[];
    const browserOverlap=implementationIds.filter(id=>fullIds.includes(id)&&c.tools.checks[id]?.kind==='browser');
    checks.push({id:'browser-overlap',status:browserOverlap.length?'WARN':'PASS',checks:browserOverlap,reason:browserOverlap.length?`Browser checks already covered by implementation are repeated in full: ${browserOverlap.join(', ')}; reuse the same snapshot evidence or remove them from full unless they add new semantics`:'No browser check is repeated across implementation and full profiles'});
    if(c.verification.layers)checks.push({id:'verification-layers',status:'PASS',layers:{L1:c.verification.layers.L1,L2:c.verification.layers.L2,L3:c.verification.profiles.full},cache:{enabled:c.verification.cache?.enabled!==false,buildOutputs:c.verification.cache?.buildOutputs??['dist','build']},reason:'L3 is frozen-full and never reuses the intermediate evidence cache'});
    checks.push({id:'full-build',status:'PASS',profiles:c.verification.profiles.full,reason:'The configured full profile contains a build and orders it before every configured UI evidence check; doctor validates the declaration but does not execute the build'});
    const uiIds=[...new Set([...Object.values(c.verification.profiles||{}).flat(),...Object.values(c.verification.layers||{}).flat()])].filter(id=>['browser','accessibility','keyboard'].includes(c.tools.checks[id]?.kind));
    checks.push({id:'ui-evidence-contract',status:'PASS',checks:uiIds,routes:Object.fromEntries(uiIds.map(id=>[id,c.tools.checks[id].routes])),browserMatrix:Object.fromEntries(uiIds.map(id=>[id,c.tools.checks[id].browserMatrix])),reason:'Every configured UI check declares routes and browserMatrix; artifact semantics are validated when evidence is bound'});
    checks.push(c.verification.runtime?{id:'preview-runtime',status:'PASS',command:c.verification.runtime.command,readyUrl:c.verification.runtime.readyUrl,reason:'Preview command and environment passed the shared trust-boundary validation'}:{id:'preview-runtime',status:'INFO',reason:'No preview runtime is configured; UI checks must receive an externally managed base URL'});
  }
  let workflowNames=[];try{workflowNames=(await readDirectoryVerified(root,'planning/workflows',{label:'planning/workflows'})).filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).map(entry=>entry.name).sort();}catch(error){if(error.code!=='ENOENT')throw error;}
  const workflows=[],invalidWorkflows=[];
  for(const name of workflowNames){
    let state;try{state=await json(root,`planning/workflows/${name}`);}catch(error){invalidWorkflows.push({path:`planning/workflows/${name}`,reason:error.message});continue;}
    const usagePath=`reports/usage/${state.changeId}.json`,usageExists=await exists(root,usagePath);
    workflows.push({changeId:state.changeId,schemaVersion:state.schemaVersion,status:state.status,ui:state.ui===true,stack:state.stack,usageBudget:state.usageBudget||null,usageReport:usageExists});
  }
  const legacyWorkflows=workflows.filter(item=>item.schemaVersion<6).map(item=>item.changeId);
  const legacyBudget=workflows.filter(item=>item.usageBudget&&item.usageBudget.maxBillableTokens===undefined).map(item=>item.changeId);
  const missingUsage=workflows.filter(item=>item.status!=='completed'&&item.usageBudget?.enforce===true&&!item.usageReport).map(item=>item.changeId);
  checks.push({id:'workflow-adoption',status:invalidWorkflows.length?'BLOCK':legacyWorkflows.length||legacyBudget.length||missingUsage.length?'WARN':'PASS',workflows,invalidWorkflows,legacySchemas:legacyWorkflows,legacyBudgets:legacyBudget,missingUsageReports:missingUsage,reason:invalidWorkflows.length?'Workflow state is malformed and cannot be trusted; repair it from project history or an explicit recovery record':legacyWorkflows.length?'Active or archived workflows still use an older schema; migrate active workflows explicitly':legacyBudget.length?'Workflow budgets still use the legacy total-token basis; set maxBillableTokens for cost-aligned enforcement':missingUsage.length?'Enforced workflows are missing usage reports; controlled transitions fail closed until usage is recorded or imported':undefined});
  let leakedCache=[];try{
    for(const layer of ['L1','L2']){
      let names=[];try{names=(await readDirectoryVerified(root,`reports/cache/${layer}`,{label:`reports/cache/${layer}`})).filter(entry=>entry.isFile()).map(entry=>entry.name);}catch(error){if(error.code!=='ENOENT')throw error;}
      for(const name of names.filter(name=>name.endsWith('.json'))){
        let record;try{record=await json(root,`reports/cache/${layer}/${name}`);}catch{continue;}
        if(record?.components?.command?.args!==undefined)leakedCache.push(`reports/cache/${layer}/${name}`);
      }
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  checks.push({id:'cache-secret-hygiene',status:leakedCache.length?'BLOCK':'PASS',files:leakedCache,reason:leakedCache.length?'Legacy cache records persist raw command arguments; inspect and purge them, then rerun the checks':'Cache records persist only executable, argsHash, filesHash and check identity'});
  // Semantic checks belong to the project's tools, not this orchestrator.
  for (const id of ['design-lint','dependencies','vue-doctor']) {
    if(!c.tools?.[id]){checks.push({id,status:'INFO',reason:'Optional project adapter is not configured'});continue;}
    checks.push({id,...await runScript(root,c,c.tools[id])});
  }
  checks.push(c.tools?.architecture?{id:'architecture',...await runScript(root,c,c.tools.architecture)}:{id:'architecture',status:'INFO',reason:'Optional project architecture adapter is not configured'});
  checks.push(c.tools?.security?{id:'security-scan',...await runScript(root,c,c.tools.security)}:{id:'security-scan',status:'INFO',reason:'Optional project security scanner is not configured'});
  const pkg=await json(root,'package.json').catch(()=>({scripts:{}}));
  if(c.scripts?.visual){
    if(!pkg.scripts?.[c.scripts.visual])checks.push({id:'visual',status:'BLOCK',reason:'Configured visual script is missing'});
    else{
      let snapshots=[];try{snapshots=(await readDirectoryVerified(root,'tests/visual/theme.spec.ts-snapshots',{label:'tests/visual/theme.spec.ts-snapshots'})).filter(entry=>entry.isFile()).map(entry=>entry.name).filter(name=>/^((light|dark|brand-enterprise)-(desktop|mobile)-chromium-.*\.png)$/.test(name));}catch(error){if(error.code!=='ENOENT')throw error;}
      checks.push(snapshots.length>=6?{id:'visual',status:'PASS',script:c.scripts.visual,snapshots:snapshots.length}:{id:'visual',status:'WARN',script:c.scripts.visual,snapshots:snapshots.length,reason:'Approved visual baselines are missing; generate them in the project browser environment, inspect them, and commit the approved baselines'});
    }
  }else checks.push({id:'visual',status:'INFO',reason:'Optional visual regression script is not configured'});
  return save(root,'doctor',{status:checks.some(c=>c.status==='BLOCK')?'BLOCK':checks.some(c=>c.status==='WARN')?'WARN':'PASS',checks});
}
async function close(root, input) {
  const id = randomUUID(), stamp = now();
  let pending=false;
  if(!input.summary && await exists(root,'logs/pending-session.json')) { const prepared=await json(root,'logs/pending-session.json'); if(!input.sessionId || !prepared.sessionId || input.sessionId===prepared.sessionId) { input={...input,...prepared}; pending=true; } }
  const summary = typeof input.summary==='string' && input.summary.trim() ? boundedText(input.summary,6000) : null;
  const lessons = typeof input.lessons==='string' && input.lessons.trim() ? boundedText(input.lessons,6000) : null;
  const c=await config(root);
  const log = `logs/session-${id}.md`;
  const updates=[];
  let telemetry=null,telemetryPath=null;
  if(input.sessionId){
   try{telemetry=await readCodexSessionUsage(input.sessionId);if(telemetry.available){telemetryPath=`reports/usage/sessions/${digest(input.sessionId).slice(0,16)}.json`;await write(root,telemetryPath,JSON.stringify(telemetry,null,2)+'\n');}}
   catch(error){telemetry={available:false,reason:error.message};}
  }
  const telemetryLine=telemetryPath?`\n## Token / API usage\n${telemetryPath}\n\nTotal tokens: ${telemetry.usage.totalTokens}; API calls: ${telemetry.apiCalls}\n\n`:'';
  await write(root,log,`# Session ${id}\n\n${stamp}\n\n${summary?`## Summary\n${summary}\n\n`:'No session summary supplied; no project state was inferred.\n\n'}${lessons?`## Evidence-backed lesson\n${lessons}\n\n`:'No evidence-backed lesson supplied; none was recorded.\n\n'}${telemetryLine}Status: pending\n`,true);
  for(const [key,body,label] of [['sessionState',summary,'Session summary'],['lessons',lessons,'Observed lesson']])if(body&&c.context?.[key]){
    const file=c.context[key],old=await exists(root,file)?await read(root,file):`# ${label}\n`;
    await write(root,file,`${old.trimEnd()}\n\n## ${stamp} (${id})\n${body}\n`);updates.push({label,file,body});
  }
  await write(root,log,`# Session ${id}\n\n${stamp}\n\n${summary?`## Summary\n${summary}\n\n`:'No session summary supplied; no project state was inferred.\n\n'}${lessons?`## Evidence-backed lesson\n${lessons}\n\n`:'No evidence-backed lesson supplied; none was recorded.\n\n'}${telemetryLine}${updates.length?`## Project context updated\n${updates.map(item=>`- ${item.label}: \`${item.file}\``).join('\n')}`:'No project context files were changed.'}\n\nStatus: complete\n`);
  if(pending) await removeFileVerified(root,'logs/pending-session.json');
  return {status:'PASS',log,contextUpdated:updates.map(({label,file})=>({label,file})),telemetry:telemetryPath?{path:telemetryPath,apiCalls:telemetry.apiCalls,totalTokens:telemetry.usage.totalTokens}:telemetry};
}
function requireText(value, name) { if(typeof value!=='string' || !value.trim()) throw Error(`${name} required`); return value; }
async function assertActiveWorkflowBudget(root) {
 let entries;try{entries=await readDirectoryVerified(root,'planning/workflows',{label:'planning/workflows'});}catch(error){if(error.code==='ENOENT')return;throw error;}
 const names=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).map(entry=>entry.name);
 for(const name of names.sort()){
  let state;try{state=await json(root,`planning/workflows/${name}`);}catch(error){throw Error(`Workflow state is invalid (${name}): ${error.message}`);}
  if(state.status==='completed')continue;
  if(state.usageBudget?.enforce!==true)continue;
  const relative=`reports/usage/${state.changeId}.json`;
  if(!await exists(root,relative))throw Error(`Usage report is missing for enforced workflow ${state.changeId}; record usage or explicitly disable the budget before running verification or quality-gate`);
  const usage=await json(root,relative);
  if(usage.changeId!==state.changeId)throw Error(`Usage report changeId does not match enforced workflow ${state.changeId}`);
  if(!Array.isArray(usage.records))throw Error(`Usage report records are missing for enforced workflow ${state.changeId}`);
  const checked=applyUsageBudget(usage,state.usageBudget);
  if(checked.budget?.enforce&&checked.budget.status==='exceeded')throw Error(`Usage budget exceeded for ${state.changeId}; raise or disable the budget before running verification or quality-gate`);
 }
}
function failedVerificationKinds(input) {
 const kinds=[];
 const add=kind=>{if(kind&&!kinds.includes(kind))kinds.push(kind);};
 if(input.layer!==undefined){
  try{add(layerReportKind(input.layer));}
  catch{for(const layer of ['L1','L2','L3'])add(layerReportKind(layer));}
 }else{
  const failedProfile=isProfileName(input.profile)?normalizeProfileName(input.profile):'full';
  const profileKinds=verificationReportVariants(failedProfile).map(variant=>variant.kind);
  if(input.action==='engineering-verify')for(const kind of profileKinds)add(kind);
  else if(['local-verify','frontend-verify'].includes(input.action)){for(const kind of profileKinds){add(kind.replace(/^engineering-verify-/,'frontend-verify-'));add(kind);}}
 }
 if(['quality-gate','doctor'].includes(input.action))add(input.action);
 return kinds;
}
function failedVerificationProfile(input) {
 if(input.layer!==undefined){
  try{return normalizeVerificationLayer(input.layer)==='L3'?'full':'implementation';}
  catch{return 'implementation';}
 }
 return isProfileName(input.profile)?normalizeProfileName(input.profile):'full';
}
function failedVerificationLayer(input) {
 if(input.layer===undefined)return null;
 try{return normalizeVerificationLayer(input.layer);}
 catch{return null;}
}
async function dispatch(root, input) {
  if (input.action === 'session-summary') { requireText(input.summary,'summary'); await write(root,'logs/pending-session.json',JSON.stringify({summary:boundedText(input.summary,6000),lessons:input.lessons?boundedText(input.lessons,6000):'',sessionId:input.sessionId?boundedText(input.sessionId,256):null})); return {status:'PASS'}; }
  if (input.action === 'session-close') return close(root,input);
  if (input.action === 'snapshot') return snapshot(root);
  if (['frontend-verify','local-verify','engineering-verify'].includes(input.action)) { await assertActiveWorkflowBudget(root); return verify(root,input.profile || 'full',{layer:input.layer,files:input.files,cache:input.cache}); }
  if (input.action === 'quality-gate') { await assertActiveWorkflowBudget(root); return quality(root,input.review); }
  if (input.action === 'doctor') return doctor(root);
  throw Error('Unknown quality action');
}
export async function run(input) {
  if (!input || typeof input.project !== 'string' || !path.isAbsolute(input.project)) throw Error('project must be an absolute path');
  const root = await fs.realpath(input.project);
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw Error('project must be a directory');
  const plugin = await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
  if(root===plugin || root.startsWith(plugin+path.sep)) throw Error('Target project must not be inside the plugin installation');
  if(input.action==='snapshot') return snapshot(root);
  let lockHandle;
  try {
    const lock=await safe(root,'logs/.quality.lock');
    lockHandle=await acquireFileLock(lock,{root,relative:'logs/.quality.lock',action:input.action,label:'Quality'});
    try { return await dispatch(root,input); }
    catch(error) {
      // Never leave a prior PASS as the latest result after a failed recheck.
      const kinds=failedVerificationKinds(input);
      const profile=failedVerificationProfile(input),layer=failedVerificationLayer(input);
      for(const kind of kinds) {
        try { await save(root,kind,{profile,status:'BLOCK',stable:false,reason:error.message,layer}); }
        catch(auditError) { throw new AggregateError([error,auditError],`${error.message}; audit write failed: ${auditError.message}`); }
      }
      throw error;
    }
  } catch(error) {
    if(input.action==='session-close') return {status:'WARN',reason:error.message};
    throw error;
  } finally {
    if(lockHandle) await releaseFileLock(lockHandle);
  }
}
