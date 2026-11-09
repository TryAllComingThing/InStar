import {promises as fs} from 'node:fs';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveTokenSources} from '../shared/token-sources.mjs';
import {parseProjectAgentConfig} from '../shared/agent-config.mjs';
import {redactData,boundedText} from '../shared/redaction.mjs';
import {readCodexSessionUsage} from '../shared/usage-telemetry.mjs';
import {canonicalHash} from '../shared/canonical.mjs';
import {assertProfileName,verificationReportKind,MAX_ARTIFACT_BYTES} from '../shared/profile-contract.mjs';
import {acquireFileLock,releaseFileLock} from '../shared/file-lock.mjs';
import {safePath as safe} from '../shared/path-safety.mjs';
import {openVerified,readTextVerified,readBufferVerified,renameVerified,unlinkVerified} from '../shared/path-safety.mjs';
import {runCommand} from '../shared/run-command.mjs';
import {evaluateQualityPolicy,validateQualityPolicy} from './policy.mjs';

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
const verifyProfiles = {commit:['lint','typecheck','dependencies'],implementation:['lint','typecheck','test','build'],full:['lint','typecheck','test','build','dependencies','vite-build']};
function checksForProfile(c,profile){
 if(c.verification){const ids=c.verification.profiles?.[profile];if(!ids)throw Error(`Verification profile is not configured: ${profile}`);return ids;}
 const base=[...verifyProfiles[profile],...(profile==='full'&&c.tools?.security?['security-scan']:[]),...(profile==='full'&&c.scripts?.e2e?['e2e']:[]),...(profile==='full'&&c.scripts?.visual?['visual']:[])];
 return base;
}
const generated = name => /(^|\/)(reports|logs|node_modules|dist|coverage|\.git|\.workflow|planning)(\/|$)/.test(name) || /^docs\/prd\//.test(name) || /^\.instar\/session\//.test(name) || /^\.context\/(PROJECT_STATE|LESSONS)\.md$/.test(name);
const sensitive = name => /(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);
const evidencePath = value => typeof value==='string' && value.startsWith('reports/') && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..') && !sensitive(value);
const credentialEnv = key => /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION|(?:^|_)API_KEY$|ACCESS_KEY|PRIVATE_KEY|(?:DATABASE|DB|POSTGRES(?:QL)?|MYSQL|MONGO(?:DB)?|REDIS|JDBC|ODBC)_URL|(?:^|_)(?:DSN|URI|CONNECTION_STRING|CERTIFICATE)(?:_|$)|^GH_|^GITHUB_|^AWS_|^AZURE_|^GOOGLE_APPLICATION_CREDENTIALS$|^NPM_CONFIG_.*(?:AUTH|TOKEN|USERCONFIG|GLOBALCONFIG)|^SSH_AUTH_SOCK$|^GIT_|^(?:SSH)_ASKPASS$|^CODEX_HOME$|^(?:NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONHOME|RUBYOPT|PERL5OPT|LD_PRELOAD)$|^DYLD_)/i.test(key);
function safeEnvironment(){return Object.fromEntries(Object.entries(process.env).filter(([key])=>!credentialEnv(key)));}
const commandKey = value => (process.platform==='win32'?path.win32.basename(value):path.basename(value)).toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/,'');
function commandIsAllowed(command){
 const configured=process.env.INSTAR_HOOK_ALLOWED_COMMANDS;
 if(configured===undefined)return true;
 const allowed=new Set(configured.split(',').map(value=>commandKey(value.trim())).filter(Boolean));
 return allowed.has(commandKey(command));
}
function checkIsAllowed(id){
 const configured=process.env.INSTAR_HOOK_ALLOWED_CHECKS;
 if(configured===undefined)return true;
 return new Set(configured.split(',').map(value=>value.trim()).filter(Boolean)).has(id);
}
async function read(root, name) { return readTextVerified(root, name); }
async function json(root, name) { return JSON.parse(await read(root, name)); }
async function exists(root, name) { try { await fs.access(await safe(root, name)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function write(root, name, text, exclusive = false) {
  const dest = await safe(root, name);
  await fs.mkdir(path.dirname(dest), {recursive:true});
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
function git(root, args) {
  const r = spawnSync('git', ['-c','core.fsmonitor=false', ...args], {cwd:root, encoding:'utf8', timeout:15000, maxBuffer:16*1024*1024});
  if (r.status !== 0) throw Error(`Git failed: ${args[0]} (${r.error?.code || r.status})`);
  return r.stdout.trimEnd();
}
async function config(root) {
  const c = await json(root, '.instar-quality.json');
  if (![1,2,3].includes(c.schemaVersion) || (c.packageManager !== undefined && c.packageManager !== 'npm') || typeof c.baseRef !== 'string' || !/^[a-zA-Z0-9][\w./-]*$/.test(c.baseRef)) throw Error('Invalid quality configuration');
  if (c.schemaVersion < 3 && c.packageManager !== 'npm') throw Error('Legacy quality configuration requires packageManager: npm');
  if(c.schemaVersion===3&&!c.verification)throw Error('schemaVersion 3 requires verification profiles and tools.checks');
  if (c.verification !== undefined) {
    if (c.schemaVersion < 3 || !c.verification.profiles || typeof c.verification.profiles !== 'object' || Array.isArray(c.verification.profiles) || !c.tools?.checks || typeof c.tools.checks !== 'object' || Array.isArray(c.tools.checks)) throw Error('Custom verification requires schemaVersion 3, verification.profiles and tools.checks');
    if(c.verification.inputs!==undefined&&(!Array.isArray(c.verification.inputs)||c.verification.inputs.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))||new Set(c.verification.inputs).size!==c.verification.inputs.length))throw Error('verification.inputs must be unique workspace-relative file or directory paths');
    for (const profile of ['commit','full',...(c.verification.profiles.implementation?['implementation']:[])]) {
      const ids=c.verification.profiles[profile];
      if (!Array.isArray(ids) || !ids.length || ids.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(id)) || new Set(ids).size!==ids.length) throw Error(`verification.profiles.${profile} must be a non-empty list of unique check ids`);
      for(const id of ids){const spec=c.tools.checks[id];const argBytes=Array.isArray(spec?.args)?spec.args.reduce((sum,arg)=>sum+(typeof arg==='string'?Buffer.byteLength(arg):0),0):Infinity;const command=spec?.command;const relativeCommand=typeof command==='string'&&/^[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*$/.test(command)&&!command.split(/[\\/]/).includes('..');const safeCommand=typeof command==='string'&&command.length<=256&&!command.includes('\0')&&(relativeCommand||(path.isAbsolute(command)&&command===process.execPath));if(!spec||typeof spec!=='object'||Array.isArray(spec)||!safeCommand||!Array.isArray(spec.args)||spec.args.length>128||argBytes>16384||spec.args.some(arg=>typeof arg!=='string'||arg.includes('\0')||Buffer.byteLength(arg)>2048)|| (spec.cwd!==undefined&&(typeof spec.cwd!=='string'||path.isAbsolute(spec.cwd)||spec.cwd.split(/[\\/]/).includes('..'))) || (spec.timeoutMs!==undefined&&(!Number.isInteger(spec.timeoutMs)||spec.timeoutMs<1||spec.timeoutMs>600000)) || !['lint','format','typecheck','test','build','security','browser','accessibility','keyboard','dependencies'].includes(spec.kind))throw Error(`Invalid tools.checks.${id}`);}
      for(const id of ids)if(c.tools.checks[id].artifact!==undefined&&!evidencePath(c.tools.checks[id].artifact))throw Error(`Invalid tools.checks.${id}.artifact`);
    }
  }
  if(c.schemaVersion===3&&([...qualityTools,'architecture','security','dependencies','ci-config','vite-build'].some(key=>c.tools?.[key]!==undefined)||c.scripts!==undefined))throw Error('schemaVersion 3 uses tools.checks and verification.profiles; legacy npm script adapters are not supported');
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
    try{const stat=await fs.lstat(await safe(root,dir));if(stat.isDirectory()&&!stat.isSymbolicLink()){result.designSystemDirectory=dir;break;}}
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
    const dir=relative?await safe(root,relative):root;let entries;
    try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
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
    try{const handle=await openVerified(root,name,fsConstants.O_RDONLY);try{const stat=await handle.stat();if(!stat.isFile())continue;result.push([name,digest(await handle.readFile())]);}finally{await handle.close();}}
    catch(error){if(error.code!=='ENOENT')throw error;result.push([name,'missing']);}
  }
  return result;
}
export async function snapshot(root) {
  const c = await config(root);
  const context=await projectContextFiles(root,c);
  if(context.tokenResolution.problems.length)throw Error(`Invalid project Token source: ${context.tokenResolution.problems.map(item=>`${item.path} (${item.status})`).join(', ')}`);
  if (path.resolve(git(root, ['rev-parse','--show-toplevel'])) !== root) throw Error('project must be the Git repository root');
  const head = git(root, ['rev-parse','HEAD']);
  const tree = git(root, ['write-tree']);
  const base = git(root, ['rev-parse','--verify',`${c.baseRef}^{commit}`]);
  const namesSet = new Set(git(root, ['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean));
  let inputBytes=0,inputCount=0,inputDirectoryCount=0;
  async function addInput(name,depth=0){
    if(depth>64)throw Error('Configured verification inputs exceed maximum directory depth of 64');
    if(generated(name)||sensitive(name))throw Error(`Configured verification input cannot target generated or sensitive paths: ${name}`);
    const file=await safe(root,name);let stat;
    try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')throw Error(`Configured verification input does not exist: ${name}`);throw error;}
    if(stat.isSymbolicLink())throw Error(`Configured verification input cannot be a symlink: ${name}`);
    if(stat.isDirectory()){
      inputDirectoryCount++;if(inputDirectoryCount>10000)throw Error('Configured verification inputs exceed 10,000 directories');
      for(const entry of (await fs.readdir(file,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        if(['.git','node_modules','reports','logs','dist','build','coverage'].includes(entry.name))continue;
        await addInput(`${name}/${entry.name}`,depth+1);
      }
    }else if(stat.isFile()){
      if(generated(name)||sensitive(name))throw Error(`Configured verification input cannot target generated or sensitive paths: ${name}`);
      inputCount++;inputBytes+=stat.size;if(inputCount>10000||inputBytes>256*1024*1024)throw Error('Configured verification inputs exceed 10,000 files or 256 MiB');
      namesSet.add(name);
    }else throw Error(`Configured verification input is not a regular file or directory: ${name}`);
  }
  for(const input of c.verification?.inputs||[])await addInput(input);
  const names = [...namesSet].sort();
  const changed = [...new Set([...git(root, ['diff','--name-only','-z',base,'--']).split('\0'), ...git(root, ['ls-files','-z','--others','--exclude-standard']).split('\0')].filter(Boolean))].sort().filter(n=>!generated(n));
  if (changed.some(sensitive)) throw Error('Sensitive path changed; review outside quality automation');
  const files = [];
  for (const name of names.filter(n=>!generated(n) && !sensitive(n))) {
    try { const handle=await openVerified(root,name,fsConstants.O_RDONLY);try{const stat=await handle.stat();if(!stat.isFile())throw Error(`Unsupported file: ${name}`);files.push([name,stat.mode,digest(await handle.readFile())]);}finally{await handle.close();} }
    catch (e) { if(e.code !== 'ENOENT') throw e; files.push([name,'deleted']); }
  }
  // Include ignored governance files as well; they change review policy.
  for (const name of ['.instar-quality.json','package.json',...['AGENTS.md','.context/AGENTS.md',context.architecture,context.design,context.designSystem].filter(Boolean),...context.tokens]) {
    files.push([name, await exists(root,name) ? digest(await read(root,name)) : 'missing']);
  }
  const guidance=await guidanceFingerprint(root);
  return {tree,fingerprint:digest(JSON.stringify({head,base,files,guidance,index:git(root,['ls-files','--stage','-z']).split('\0').filter(entry=>entry && !generated(entry.slice(entry.indexOf('\t')+1)))})),head,base,baseRef:c.baseRef,changed};
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
async function bindCheckArtifact(root,check,profile,reportId,id,spec){
 const artifact=spec.artifact||`reports/evidence/${profile}/${reportId}/${id}.json`;
 if(!spec.artifact)await write(root,artifact,JSON.stringify({schemaVersion:1,profile,reportId,checkId:id,kind:spec.kind,status:check.status,exitCode:check.exitCode,durationMs:check.durationMs,outputHash:check.outputHash,at:now()},null,2)+'\n',true);
 const content=await readBufferVerified(root,artifact);
 if(!content.length)throw Error(`Check artifact is empty: ${artifact}`);
 if(content.length>MAX_ARTIFACT_BYTES)throw Error(`Artifact exceeds ${MAX_ARTIFACT_BYTES} byte limit`);
 return {artifact,artifactHash:digest(content),artifactBytes:content.length};
}

async function runConfiguredCheck(root,c,profile,reportId,id,spec){
 const start=Date.now(),timeoutMs=spec.timeoutMs||c.timeoutMs||120000;
 if(!checkIsAllowed(id))return {id,command:spec.command,status:'BLOCK',error:'ECHECKNOTALLOWED',durationMs:0,reason:'Configured check is not allowed by INSTAR_HOOK_ALLOWED_CHECKS'};
 if(!commandIsAllowed(spec.command))return {id,command:spec.command,status:'BLOCK',error:'ECOMMANDNOTALLOWED',durationMs:0,reason:'Configured command is not allowed by INSTAR_HOOK_ALLOWED_COMMANDS'};
 const env=safeEnvironment();
 const cwd=spec.cwd?await safe(root,spec.cwd):root;if(cwd!==root&&!cwd.startsWith(root+path.sep))return {id,status:'BLOCK',reason:'Check working directory escapes project'};
 if(spec.artifact)await fs.rm(await safe(root,spec.artifact),{force:true});
 let r;try{r=await runCommand(spec.command,spec.args,{cwd,timeoutMs,env:{...env,CI:'true',npm_config_offline:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'}});}catch(error){return {id,command:spec.command,status:'BLOCK',error:error.code||'SPAWN_ERROR',durationMs:Date.now()-start,reason:'Configured command could not be started'};}
 const result={id,command:spec.command,status:r.status===0&&!r.error?'PASS':'BLOCK',exitCode:r.status,signal:r.signal,error:r.error?.code||null,durationMs:Date.now()-start,outputHash:digest((r.stdout||'')+(r.stderr||''))};
 if(result.status==='PASS'){
  try{Object.assign(result,await bindCheckArtifact(root,result,profile,reportId,id,spec));}
  catch(error){return {...result,status:'BLOCK',reason:`Check artifact evidence is invalid: ${error.message}`};}
 }
 return {...result,reason:result.status==='PASS'?'Completed':'Command failed; rerun locally for diagnostics (raw output is not persisted)'};
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
async function verify(root, profile) {
  assertProfileName(profile);
  const c = await config(root);const before = await snapshot(root), checks = [], ids=checksForProfile(c,profile),reportId=randomUUID();
  for (const id of ids) {
    if(c.verification?.profiles?.[profile]){const check=await runConfiguredCheck(root,c,profile,reportId,id,c.tools.checks[id]);checks.push(check);if(check.status!=='PASS')break;continue;}
    const script=id==='security-scan'?c.tools.security:c.scripts?.[id] || (['dependencies','vite-build'].includes(id) ? c.tools?.[id] : id);
    const check = {id,...await runScript(root,c,script)}; checks.push(check);
    if (check.status !== 'PASS') break;
  }
  const after = await snapshot(root), stable = before.fingerprint === after.fingerprint;
  const configured=!!c.verification?.profiles?.[profile];
  const kind=configured?verificationReportKind(profile):`frontend-verify-${profile}`;
  const policy=c.qualityPolicy&&profile!=='implementation'?evaluateQualityPolicy(c.qualityPolicy,profile,[...checks,{id:'evidence-report',status:stable?'PASS':'BLOCK'}],before):null;
  const status=!stable||checks.some(check=>check.status!=='PASS')||policy?.status==='FAIL'?'BLOCK':(profile==='implementation'||c.schemaVersion>=3)?(policy?.status||'PASS'):policy?.status||'BLOCK';
  const result=await save(root,kind,{profile,snapshot:before,configHash:canonicalHash(c),checkDefinitions:configured?Object.fromEntries(ids.map(id=>[id,canonicalHash(c.tools.checks[id])])):null,status,checks,stable,qualityPolicy:policy||{status:'NOT_CONFIGURED',note:c.schemaVersion>=3?'Configured profile is authoritative; qualityPolicy is optional':'Mandatory policy required; legacy verification cannot pass'},coverage:{basis:configured?'project-configured-checks':'mandatory-policy',profile,checkIds:ids,note:configured?'Configured checks passed for this profile; the selected check set does not independently prove coverage of all risks.':undefined}},reportId);
  await saveUnifiedQualityReport(root,{profile,verification:result,policy,review:null});
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
        if (reference.line !== undefined && (!Number.isInteger(reference.line) || reference.line < 1)) throw Error(`Invalid review reference line: ${id}`);
        const full = await safe(root, reference.path); let stat;
        try { stat = await fs.lstat(full); } catch (error) { if (error.code === 'ENOENT') throw Error(`Review reference does not exist: ${reference.path}`); throw error; }
        if (!stat.isFile()) throw Error(`Review reference must be a regular file: ${reference.path}`);
      }
    }
  }
  if (!Array.isArray(review.findings) || !Array.isArray(review.unverified)) throw Error('Review requires findings and unverified arrays');
  for (const finding of review.findings) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding) || !['critical','warning','suggestion'].includes(finding.severity) || typeof finding.message !== 'string' || !finding.message.trim()) throw Error('Invalid review finding');
  }
  for (const reason of review.unverified) if (typeof reason !== 'string' || !reason.trim()) throw Error('Review unverified items must be non-empty strings');
}
async function quality(root, review) {
  const c = await config(root);
  await validateReview(root,review,reviewItemsFor(c));
  review=redactData(review);
  const before = await snapshot(root);
  if (review.fingerprint !== before.fingerprint) throw Error('Review is stale');
  const checks = [];
  for (const id of qualityTools) {
    if(!c.tools?.[id]){checks.push({id,status:'INFO',reason:'Not configured for this project or change'});continue;}
    checks.push({id,...await runScript(root,c,c.tools[id])});
    if (checks.at(-1).status !== 'PASS') break;
  }
  if (checks.every(check=>check.status==='PASS')) checks.push(c.tools?.architecture
    ? {id:'architecture',...await runScript(root,c,c.tools.architecture)}
    : {id:'architecture',status:'INFO',reason:'No project architecture adapter configured; AI architecture review still applies'});
  const stable = before.fingerprint === (await snapshot(root)).fingerprint;
  const blocked = !stable || checks.some(c=>c.status==='BLOCK') || review.checks.some(c=>c.status==='BLOCK') || review.findings.some(f=>f.severity==='critical'||f.severity==='warning') || review.unverified.length>0;
  const result=await save(root,'quality-gate',{snapshot:before,configHash:canonicalHash(c),status:blocked?'BLOCK':review.checks.some(c=>c.status==='WARN')?'WARN':'PASS',checks,review,stable});
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
 if(report.review?.schemaVersion!==2)throw Error('Fresh quality-gate evidence with schemaVersion 2 code references is required before implementation approval');
 await validateReview(root,report.review,reviewItemsFor(c));
 if(report.review.checks.some(item=>item.status==='BLOCK'))throw Error('Quality-gate review contains blocking findings');
 if(report.review.findings.some(item=>item.severity==='critical'||item.severity==='warning'))throw Error('Quality-gate review contains unresolved critical or warning findings');
 if(report.review.unverified.length)throw Error('Quality-gate review left applicable checks unverified');
 if(!qualityTools.filter(id=>c.tools?.[id]).every(id=>report.checks.some(item=>item.id===id&&item.status==='PASS')))throw Error('Quality-gate tool checks are incomplete');
 if(c.tools?.architecture&&!report.checks.some(item=>item.id==='architecture'&&item.status==='PASS'))throw Error('Configured architecture check is missing or did not pass');
 return {config:c,snapshot:current};
}

async function gate(root, profile) {
  const current = await snapshot(root), c = await config(root);
  const localKind=`${c.verification?'engineering':'frontend'}-verify-${profile}`;let local;
  if(await exists(root,`reports/${localKind}.json`))local=await json(root,`reports/${localKind}.json`);
  if(!local)throw Error('Missing verification report');
  const review = await json(root,'reports/quality-gate.json');
  for (const r of [local,review]) if (!r.stable || !['PASS','WARN','PASS_WITH_WAIVERS'].includes(r.status) || r.snapshot?.fingerprint !== current.fingerprint) throw Error('Missing, failed or stale quality evidence; rerun the configured verification and quality-gate');
  if(local.kind!==localKind||local.profile!==profile||!['PASS','PASS_WITH_WAIVERS'].includes(local.status))throw Error('Wrong verification profile');
  const required = checksForProfile(c,profile);
  const ids=Array.isArray(local.checks)?local.checks.map(item=>item?.id):[];
  if(!Array.isArray(local.checks)||new Set(ids).size!==ids.length||required.some(id=>!ids.includes(id))||ids.some(id=>!required.includes(id)))throw Error('Verification report checks do not match the configured profile');
  if(c.verification?.profiles?.[profile])for(const id of required)if(local.checkDefinitions?.[id]!==canonicalHash(c.tools.checks[id]))throw Error(`Verification check definition changed: ${id}`);
  if(c.schemaVersion===3&&profile==='full'&&!required.some(id=>c.tools.checks[id]?.kind==='security'))throw Error('Full profile requires a security check');
  if (c.schemaVersion<3&&!c.qualityPolicy) throw Error('Mandatory qualityPolicy missing; legacy verification cannot pass');
  await validateReview(root,review.review,reviewItemsFor(c));
  const toolChecks=Array.isArray(review.checks)?review.checks:[];
  if (review.review.fingerprint!==current.fingerprint || review.review.checks.some(c=>c.status==='BLOCK') || !qualityTools.filter(id=>c.tools?.[id]).every(id=>toolChecks.some(c=>c.id===id && c.status==='PASS'))) throw Error('Review checks incomplete');
  if(c.tools?.architecture&&!toolChecks.some(c=>c.id==='architecture'&&c.status==='PASS'))throw Error('Configured architecture check is missing or did not pass');
  if(c.qualityPolicy){const policy=evaluateQualityPolicy(c.qualityPolicy,profile,[...local.checks,{id:'evidence-report',status:local.stable?'PASS':'BLOCK'}],current);if(!['PASS','PASS_WITH_WAIVERS'].includes(policy.status)||policy.status!==local.qualityPolicy?.status)throw Error('Mandatory quality checks or waivers are incomplete');}
  return {status:local.status,snapshot:current,localReport:local.id,reviewReport:review.id};
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
    throw error;
  }
  const checks = [];
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
    const configFile=await safe(root,agentConfigPath);let stat;
    try{stat=await fs.lstat(configFile);}catch(error){if(error.code!=='ENOENT')throw error;}
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
  checks.push({id:'github-workflows',status:await exists(root,'.github/workflows')?'PASS':'INFO',reason:await exists(root,'.github/workflows')?undefined:'No repository GitHub workflow directory discovered'});
  if(c.verification){
    const kinds=ids=>[...new Set(ids.map(id=>c.tools.checks[id]?.kind).filter(Boolean))];
    const profiles={commit:c.verification.profiles.commit,implementation:c.verification.profiles.implementation||null,full:c.verification.profiles.full};
    const missing=[];
    if(!profiles.implementation)missing.push('implementation profile');
    else for(const kind of ['lint','format','test'])if(!kinds(profiles.implementation).includes(kind))missing.push(`implementation ${kind}`);
    if(!kinds(profiles.full).includes('security'))missing.push('full security');
    checks.push({id:'configured-verification',status:missing.length?'WARN':'PASS',profiles,kinds:{commit:kinds(profiles.commit),implementation:profiles.implementation?kinds(profiles.implementation):[],full:kinds(profiles.full)},missingKinds:missing,reason:missing.length?`Profile preflight is incomplete: ${missing.join(', ')}`:'Configured command profiles were inspected; doctor does not execute them'});
    const implementationIds=profiles.implementation||[],fullIds=profiles.full||[];
    const browserOverlap=implementationIds.filter(id=>fullIds.includes(id)&&c.tools.checks[id]?.kind==='browser');
    checks.push({id:'browser-overlap',status:browserOverlap.length?'WARN':'PASS',checks:browserOverlap,reason:browserOverlap.length?`Browser checks already covered by implementation are repeated in full: ${browserOverlap.join(', ')}; reuse the same snapshot evidence or remove them from full unless they add new semantics`:'No browser check is repeated across implementation and full profiles'});
  }
  // Semantic checks belong to the project's tools, not this orchestrator.
  for (const id of ['design-lint','dependencies','ci-config','vue-doctor']) {
    if(!c.tools?.[id]){checks.push({id,status:'INFO',reason:'Optional project adapter is not configured'});continue;}
    checks.push({id,...await runScript(root,c,c.tools[id])});
  }
  checks.push(c.tools?.architecture?{id:'architecture',...await runScript(root,c,c.tools.architecture)}:{id:'architecture',status:'INFO',reason:'Optional project architecture adapter is not configured'});
  checks.push(c.tools?.security?{id:'security-scan',...await runScript(root,c,c.tools.security)}:{id:'security-scan',status:'INFO',reason:'Optional project security scanner is not configured'});
  const pkg=await json(root,'package.json').catch(()=>({scripts:{}}));
  if(c.scripts?.visual){
    if(!pkg.scripts?.[c.scripts.visual])checks.push({id:'visual',status:'BLOCK',reason:'Configured visual script is missing'});
    else{
      const snapshotDir=await safe(root,'tests/visual/theme.spec.ts-snapshots');
      let snapshots=[];try{snapshots=(await fs.readdir(snapshotDir)).filter(name=>/^((light|dark|brand-enterprise)-(desktop|mobile)-chromium-.*\.png)$/.test(name));}catch(error){if(error.code!=='ENOENT')throw error;}
      checks.push(snapshots.length>=6?{id:'visual',status:'PASS',script:c.scripts.visual,snapshots:snapshots.length}:{id:'visual',status:'WARN',script:c.scripts.visual,snapshots:snapshots.length,reason:'Approved visual baselines are missing; generate them in the CI browser environment, inspect and commit before PR checks'});
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
  if(pending) await fs.unlink(await safe(root,'logs/pending-session.json'));
  return {status:'PASS',log,contextUpdated:updates.map(({label,file})=>({label,file})),telemetry:telemetryPath?{path:telemetryPath,apiCalls:telemetry.apiCalls,totalTokens:telemetry.usage.totalTokens}:telemetry};
}
function requireText(value, name) { if(typeof value!=='string' || !value.trim()) throw Error(`${name} required`); return value; }
async function provenance(root,input) {
  if(typeof input.aiGenerated!=='boolean') throw Error('aiGenerated must be explicit');
  const current=await snapshot(root);
  return save(root,'ai-provenance',{status:'PASS',snapshot:current,aiGenerated:input.aiGenerated,sessionId:boundedText(requireText(input.sessionId,'sessionId'),256),summary:boundedText(requireText(input.summary,'summary'),6000)});
}
async function prePr(root) {
  const result=await gate(root,'full'), p=await json(root,'reports/ai-provenance.json');
  if(p.status!=='PASS' || p.snapshot?.fingerprint!==result.snapshot.fingerprint || typeof p.aiGenerated!=='boolean' || !p.summary?.trim()) throw Error('Missing or stale ai-provenance; record session summary for this snapshot');
  return {...result,provenance:p};
}
function assertStaged(root) {
  const dirty=git(root,['diff','--name-only','-z']).split('\0').filter(Boolean).filter(n=>!generated(n));
  const untracked=git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean).filter(n=>!generated(n));
  if(dirty.length || untracked.length) throw Error('Stage all intended source/config changes before commit; working tree and index must match');
}
async function commitCheck(root) {
  assertStaged(root);
  const local=await verify(root,'commit');
  if(!['PASS','PASS_WITH_WAIVERS'].includes(local.status)) { const error=Error('Configured commit verification failed'); error.code='QUALITY_VALIDATION_FAILED'; throw error; }
  const old=await json(root,'reports/quality-gate.json');
  const review=await quality(root,old.review);
  if(review.status==='BLOCK') { const error=Error('quality-gate failed'); error.code='QUALITY_VALIDATION_FAILED'; throw error; }
  return gate(root,'commit');
}
async function commit(root,input) {
  requireText(input.authorization,'authorization'); requireText(input.message,'message');
  assertStaged(root);
  const before=await snapshot(root), branch=git(root,['branch','--show-current']);
  if(!branch || ['main','master',c.baseRef,c.ci?.base].includes(branch)) throw Error('Use a feature branch');
  let waived=false;
  try { await commitCheck(root); }
  catch(error) {
    if(input.force!==true || error.code!=='QUALITY_VALIDATION_FAILED') throw error;
    requireText(input.reason,'force reason');
    // Only validation failure is waived. Scope/path and snapshot checks still apply.
    await save(root,'commit-waiver',{status:'WARN',snapshot:before,reason:input.reason,failure:error.message});
    waived=true;
  }
  if((await snapshot(root)).fingerprint!==before.fingerprint) throw Error('Input changed during commit checks');
  const message=input.message+(input.aiGenerated===true?'\n\nAI-Generated: true':'');
  git(root,['commit','-m',message]);
  return save(root,'commit',{status:waived?'WARN':'PASS',head:git(root,['rev-parse','HEAD']),branch,waived,note:'Final commit requires fresh full verification, review and provenance before PR'});
}
async function dispatch(root, input) {
  if (input.action === 'ai-provenance') return provenance(root,input);
  if (input.action === 'commit') return commit(root,input);
  if (input.action === 'session-summary') { requireText(input.summary,'summary'); await write(root,'logs/pending-session.json',JSON.stringify({summary:boundedText(input.summary,6000),lessons:input.lessons?boundedText(input.lessons,6000):'',sessionId:input.sessionId?boundedText(input.sessionId,256):null})); return {status:'PASS'}; }
  if (input.action === 'ci') { const {orchestrate}=await import('./ci.mjs'); return orchestrate(root,input,{config,snapshot,prePr,git,json,read,write,save,safe}); }
  if (input.action === 'session-close') return close(root,input);
  if (input.action === 'snapshot') return snapshot(root);
  if (['frontend-verify','local-verify','engineering-verify'].includes(input.action)) return verify(root,input.profile || 'full');
  if (input.action === 'quality-gate') return quality(root,input.review);
  if (input.action === 'pre-commit-check') return commitCheck(root);
  if (input.action === 'pre-pr-check') return save(root,'pre-pr-check',await prePr(root));
  if (input.action === 'doctor') return doctor(root);
  throw Error('Unknown quality action');
}
export async function run(input) {
  if (!input || typeof input.project !== 'string' || !path.isAbsolute(input.project)) throw Error('project must be an absolute path');
  const root = await fs.realpath(input.project);
  if (!(await fs.stat(root)).isDirectory()) throw Error('project must be a directory');
  const plugin = await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
  if(root===plugin || root.startsWith(plugin+path.sep)) throw Error('Target project must not be inside the plugin installation');
  if(input.action==='snapshot') return snapshot(root);
  let lockHandle;
  try {
    const lock=await safe(root,'logs/.quality.lock');
    lockHandle=await acquireFileLock(lock,{relative:'logs/.quality.lock',action:input.action,label:'Quality'});
    try { return await dispatch(root,input); }
    catch(error) {
      // Never leave a prior PASS as the latest result after a failed recheck.
      const failedProfile=['commit','implementation','full'].includes(input.profile)?input.profile:'full';
      const verificationKinds=input.action==='engineering-verify'?[`engineering-verify-${failedProfile}`]:['local-verify','frontend-verify'].includes(input.action)?[`frontend-verify-${failedProfile}`,`engineering-verify-${failedProfile}`]:[];
      const kinds=[...verificationKinds,...(['quality-gate','doctor','pre-pr-check'].includes(input.action)?[input.action]:[])];
      for(const kind of kinds) {
        try { await save(root,kind,{status:'BLOCK',stable:false,reason:error.message}); }
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
