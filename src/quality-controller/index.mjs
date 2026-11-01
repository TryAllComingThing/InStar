import {promises as fs,constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveTokenSources} from '../shared/token-sources.mjs';
import {redactData,redactText,boundedText} from '../shared/redaction.mjs';
import {evaluateQualityPolicy,validateQualityPolicy} from './policy.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
function evidenceKey(c){
  const envName=c?.evidenceTrust?.hmacEnv;
  return envName ? process.env[envName] || null : null;
}
function sealReport(report,key=null){
  const sealed={...report,reportHash:digest(JSON.stringify(report))};
  return key ? {...sealed,reportSignature:createHmac('sha256',key).update(sealed.reportHash).digest('hex')} : sealed;
}
function validateReportIntegrity(report,key=null,requireAnchor=false){
  if(!report||typeof report.reportHash!=='string')throw Error('Report integrity metadata missing');
  const {reportHash,reportSignature,...content}=report;
  if(digest(JSON.stringify(content))!==reportHash)throw Error('Report integrity mismatch');
  if(requireAnchor && !key)throw Error('Trusted evidence anchor unavailable');
  if(key && report.reportSignature!==createHmac('sha256',key).update(reportHash).digest('hex'))throw Error('Report trust anchor mismatch');
}
const executionResult=(error,exitCode,signal)=>error?.code==='ETIMEDOUT'?'TIMEOUT':signal?'SIGNAL_TERMINATED':error?'SPAWN_ERROR':exitCode===null||exitCode===undefined?'NOT_RUN':exitCode===0?'EXECUTED_PASS':'EXECUTED_FAILED';
export const reviewItems = ['correctness','maintainability','architecture','security','performance','naming','types','component-boundaries','design','watch-cleanup','v-for-key','reactive-destructure','props','computed-purity','unmount-cleanup','async-component','lazy-route'];
const universalReviewItems=['correctness','maintainability','architecture','security','performance','naming'];
const vueReviewItems=reviewItems.filter(id=>!universalReviewItems.includes(id));
const backendReviewItems=['api-contract','input-validation','authorization','error-handling','data-consistency','transactions','concurrency','observability'];
export function reviewItemsFor(c){
 const language=(c.review?.language||'').toLowerCase(),framework=(c.review?.framework||'').toLowerCase();
 if(!language && !framework) return universalReviewItems; // fail closed on unknown stack: never assume Vue
 const vue=framework==='vue', backend=['python','java','go'].includes(language);
 return [...new Set([...universalReviewItems,...(vue?vueReviewItems:[]),...(backend?backendReviewItems:[]),...(c.review?.extraChecks||[])])];
}
export const qualityTools = ['vue-doctor','vue-ai-sanitizer','ai-code-gate','design-lint'];
export const riskLevels = ['L0','L1','L2','L3'];
const verifyProfiles = {commit:['lint','typecheck','dependencies'],full:['lint','typecheck','test','build','dependencies','vite-build']};
const riskRank = level => riskLevels.indexOf(level);
const builtInRiskRules = [
 {riskLevel:'L3',patterns:['.github/workflows/**','**/auth/**','**/authentication/**','**/authorization/**','**/migrations/**','**/migration/**','**/payments/**','**/payment/**','**/infrastructure/**','**/infra/**','**/terraform/**']},
 {riskLevel:'L2',patterns:['**/api/**','**/routes/**','**/database/**','**/db/**','**/permissions/**']},
];
function normalizeRiskLevel(value='L1') {
  if (typeof value !== 'string' || !riskLevels.includes(value)) throw Error('riskLevel must be L0, L1, L2 or L3');
  return value;
}
function highRisk(level) { return riskRank(level) >= riskRank('L2'); }
function globRegex(pattern) {
 let escaped='';
 for(let index=0;index<pattern.length;index++){
  const char=pattern[index],next=pattern[index+1];
  if(char==='*'&&next==='*'&&pattern[index+2]==='/'){escaped+='(?:.*/)?';index+=2;continue;}
  if(char==='/'&&next==='*'&&pattern[index+2]==='*'){escaped+='(?:/.*)?';index+=2;continue;}
  if(char==='*'){escaped+='[^/]*';continue;}
  if(char==='?'){escaped+='[^/]';continue;}
  escaped+=('.+^${}()|[]\\'.includes(char)?`\\${char}`:char);
 }
 return new RegExp(`^${escaped}$`);
}
function pathMatches(pattern,name) { return globRegex(pattern.replaceAll('\\','/')).test(name.replaceAll('\\','/')); }
function riskRules(c) { return [...builtInRiskRules,...(c.riskPolicy?.rules||[])]; }
function inferredRiskLevel(c,changed=[]) {
 let level='L1';
 for(const rule of riskRules(c)) if(rule.patterns.some(pattern=>changed.some(name=>pathMatches(pattern,name))) && riskRank(rule.riskLevel)>riskRank(level)) level=rule.riskLevel;
 return level;
}
function effectiveRiskLevel(c,requested='L1',changed=[]) {
 const declared=normalizeRiskLevel(requested), inferred=inferredRiskLevel(c,changed);
 return riskRank(inferred)>riskRank(declared)?inferred:declared;
}
function l3Policy(c) {
 const policy=c.riskPolicy?.l3;
 if(!policy || !Array.isArray(policy.requiredReviewRoles) || !policy.requiredReviewRoles.length) throw Error('L3 risk policy requires requiredReviewRoles');
 return {...policy,requiredChecks:Array.isArray(policy.requiredChecks)?policy.requiredChecks:[]};
}
function validateL3Review(review,c) {
 const policy=l3Policy(c), approvals=review?.approvals;
 if(!Array.isArray(approvals)) throw Error('L3 Review requires external human approval metadata');
 for(const role of policy.requiredReviewRoles){
  const approval=approvals.find(item=>item&&item.role===role&&item.status==='approved'&&typeof item.identity==='string'&&item.identity.trim()&&typeof item.provider==='string'&&item.provider.trim()&&typeof item.approvalId==='string'&&item.approvalId.trim());
  if(!approval) throw Error(`L3 Review missing approved role: ${role}`);
 }
 if(policy.requireHumanApproval!==false&&!approvals.some(item=>item?.kind==='human'&&item.status==='approved')) throw Error('L3 Review requires an approved human reviewer');
}
function checksForProfile(c,profile){
 if(c.verification?.profiles?.[profile]) return c.verification.profiles[profile];
 const base=[...verifyProfiles[profile],...(profile==='full'&&c.tools?.security?['security-scan']:[]),...(profile==='full'&&c.scripts?.e2e?['e2e']:[]),...(profile==='full'&&c.scripts?.visual?['visual']:[])];
 return base;
}
const generated = name => /(^|\/)(reports|logs|node_modules|dist|coverage|\.git)(\/|$)/.test(name) || /^\.instar\/session\//.test(name) || /^\.context\/(PROJECT_STATE|LESSONS)\.md$/.test(name);
const sensitive = name => /(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);
const credentialEnv = key => /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION|(?:^|_)API_KEY$|ACCESS_KEY|PRIVATE_KEY|(?:DATABASE|DB|POSTGRES(?:QL)?|MYSQL|MONGO(?:DB)?|REDIS|JDBC|ODBC)_URL|(?:^|_)(?:DSN|URI|CONNECTION_STRING|CERTIFICATE)(?:_|$)|^GH_|^GITHUB_|^AWS_|^AZURE_|^GOOGLE_APPLICATION_CREDENTIALS$|^NPM_CONFIG_.*(?:AUTH|TOKEN|USERCONFIG|GLOBALCONFIG)|^SSH_AUTH_SOCK$|^GIT_|^(?:SSH)_ASKPASS$|^CODEX_HOME$|^(?:NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONHOME|RUBYOPT|PERL5OPT|LD_PRELOAD)$|^DYLD_)/i.test(key);
function safeEnvironment(){return Object.fromEntries(Object.entries(process.env).filter(([key])=>!credentialEnv(key)));}
export async function safe(root, relative) {
  const dest = path.resolve(root, relative);
  if (dest !== root && !dest.startsWith(root + path.sep)) throw Error('Path outside workspace');
  let current = root;
  for (const part of path.relative(root, dest).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error(`Symlink forbidden: ${relative}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return dest;
}
async function read(root, name) { return fs.readFile(await safe(root, name), 'utf8'); }
async function json(root, name) { return JSON.parse(await read(root, name)); }
async function exists(root, name) { try { await fs.access(await safe(root, name)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function write(root, name, text, exclusive = false) {
  const dest = await safe(root, name);
  await fs.mkdir(path.dirname(dest), {recursive:true});
  if (exclusive) return fs.writeFile(dest, text, {flag:'wx'});
  const temp = await safe(root, `${name}.${randomUUID()}.tmp`);
  try { await fs.writeFile(temp, text, {flag:'wx'}); await fs.rename(temp, dest); }
  finally { await fs.rm(temp, {force:true}); }
}
function git(root, args) {
  const r = spawnSync('git', ['-c','core.fsmonitor=false', ...args], {cwd:root, encoding:'utf8', timeout:15000, maxBuffer:16*1024*1024});
  if (r.status !== 0) throw Error(`Git failed: ${args[0]} (${r.error?.code || r.status})`);
  return r.stdout.trimEnd();
}
async function autoConfig(root) {
  const packageJson=await json(root,'package.json').catch(()=>null);
  const pythonFiles=await Promise.all(['pyproject.toml','requirements.txt','setup.py','setup.cfg'].map(file=>exists(root,file)));
  const vue=Boolean(packageJson?.dependencies?.vue||packageJson?.devDependencies?.vue||packageJson?.scripts?.['vite']||await exists(root,'vite.config.ts')||await exists(root,'vite.config.js'));
  const python=pythonFiles.some(Boolean);
  let baseRef='main';
  try { baseRef=git(root,['branch','--show-current'])||'main'; } catch {}
  return {
    configurationSource:'auto-detected',
    baseRef,
    context:{},
    review:python?{language:'python',framework:'none'}:vue?{language:'typescript',framework:'vue'}:{language:'',framework:'none'},
    detectedStack:python?'python':vue?'vue':packageJson?'javascript':'unknown'
  };
}
async function config(root) {
  let c;
  try { c=await json(root, '.instar-quality.json'); }
  catch(error) { if(error.code!=='ENOENT')throw error; return autoConfig(root); }
  if (![1,2,3].includes(c.schemaVersion) || (c.packageManager !== undefined && c.packageManager !== 'npm') || typeof c.baseRef !== 'string' || !/^[a-zA-Z0-9][\w./-]*$/.test(c.baseRef)) throw Error('Invalid quality configuration');
  if (c.schemaVersion < 3 && c.packageManager !== 'npm') throw Error('Legacy quality configuration requires packageManager: npm');
  if(c.schemaVersion===3&&!c.verification)throw Error('schemaVersion 3 requires verification profiles and tools.checks');
  if (c.verification !== undefined) {
    if (c.schemaVersion < 3 || !c.verification.profiles || typeof c.verification.profiles !== 'object' || Array.isArray(c.verification.profiles) || !c.tools?.checks || typeof c.tools.checks !== 'object' || Array.isArray(c.tools.checks)) throw Error('Custom verification requires schemaVersion 3, verification.profiles and tools.checks');
    if(c.verification.inputs!==undefined&&(!Array.isArray(c.verification.inputs)||c.verification.inputs.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))||new Set(c.verification.inputs).size!==c.verification.inputs.length))throw Error('verification.inputs must be unique workspace-relative file or directory paths');
    for (const profile of ['commit','full']) {
      const ids=c.verification.profiles[profile];
      if (!Array.isArray(ids) || !ids.length || ids.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(id)) || new Set(ids).size!==ids.length) throw Error(`verification.profiles.${profile} must be a non-empty list of unique check ids`);
      for(const id of ids){const spec=c.tools.checks[id];const argBytes=Array.isArray(spec?.args)?spec.args.reduce((sum,arg)=>sum+(typeof arg==='string'?Buffer.byteLength(arg):0),0):Infinity;if(!spec||typeof spec!=='object'||Array.isArray(spec)||typeof spec.command!=='string'||spec.command.length>256||spec.command.includes('\0')||!/^[-\w./]+$/.test(spec.command)||!Array.isArray(spec.args)||spec.args.length>128||argBytes>16384||spec.args.some(arg=>typeof arg!=='string'||arg.includes('\0')||Buffer.byteLength(arg)>2048)|| (spec.cwd!==undefined&&(typeof spec.cwd!=='string'||path.isAbsolute(spec.cwd)||spec.cwd.split(/[\\/]/).includes('..'))) || (spec.timeoutMs!==undefined&&(!Number.isInteger(spec.timeoutMs)||spec.timeoutMs<1||spec.timeoutMs>600000)))throw Error(`Invalid tools.checks.${id}`);}
    }
  }
  if(c.schemaVersion===3&&([...qualityTools,'architecture','security','dependencies','ci-config','vite-build'].some(key=>c.tools?.[key]!==undefined)||c.scripts!==undefined))throw Error('schemaVersion 3 uses tools.checks and verification.profiles; legacy npm script adapters are not supported');
  if (c.tools?.architecture !== undefined && (typeof c.tools.architecture !== 'string' || !/^[\w:-]+$/.test(c.tools.architecture))) throw Error('tools.architecture must name a package.json script');
  if (c.tools?.security !== undefined && (typeof c.tools.security !== 'string' || !/^[\w:-]+$/.test(c.tools.security))) throw Error('tools.security must name a package.json script');
  if (c.timeoutMs !== undefined && (!Number.isInteger(c.timeoutMs) || c.timeoutMs < 1 || c.timeoutMs > 600000)) throw Error('timeoutMs must be between 1 and 600000');
  if(c.context!==undefined){if(!c.context||typeof c.context!=='object'||Array.isArray(c.context))throw Error('context must be an object');for(const key of ['architecture','design','sessionState','lessons'])if(c.context[key]!==undefined&&c.context[key]!==null){const value=c.context[key];if(typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))throw Error(`context.${key} must be a workspace-relative path or null`);if(['sessionState','lessons'].includes(key)&&(!/\.md$/i.test(value)||sensitive(value)))throw Error(`context.${key} must be a non-sensitive Markdown path`);}if(c.context.tokens!==undefined&&c.context.tokens!==null){const files=Array.isArray(c.context.tokens)?c.context.tokens:[c.context.tokens];if(!files.length||files.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..')))throw Error('context.tokens must be a workspace-relative path, a non-empty path array, or null');}}
  if(c.riskPolicy!==undefined){
    if(!c.riskPolicy||typeof c.riskPolicy!=='object'||Array.isArray(c.riskPolicy))throw Error('riskPolicy must be an object');
    if(c.riskPolicy.rules!==undefined&&(!Array.isArray(c.riskPolicy.rules)||c.riskPolicy.rules.some(rule=>!rule||typeof rule!=='object'||Array.isArray(rule)||!riskLevels.includes(rule.riskLevel)||!Array.isArray(rule.patterns)||!rule.patterns.length||rule.patterns.some(pattern=>typeof pattern!=='string'||!pattern.trim()||path.isAbsolute(pattern)||pattern.split(/[\\/]/).includes('..')))))throw Error('riskPolicy.rules must contain workspace-relative patterns and valid risk levels');
    if(c.riskPolicy.l3!==undefined){const l3=c.riskPolicy.l3;if(!l3||typeof l3!=='object'||Array.isArray(l3)||!Array.isArray(l3.requiredReviewRoles)||!l3.requiredReviewRoles.length||l3.requiredReviewRoles.some(role=>typeof role!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(role))||(l3.requiredChecks!==undefined&&(!Array.isArray(l3.requiredChecks)||l3.requiredChecks.some(check=>typeof check!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9 _./:-]{1,127}$/.test(check))))||(l3.requireHumanApproval!==undefined&&typeof l3.requireHumanApproval!=='boolean'))throw Error('riskPolicy.l3 requires review roles and valid optional checks/human approval settings');}
  }
  if(c.qualityPolicy!==undefined)validateQualityPolicy(c.qualityPolicy);
  if(c.evidenceTrust!==undefined&&(!c.evidenceTrust||typeof c.evidenceTrust!=='object'||Array.isArray(c.evidenceTrust)||typeof c.evidenceTrust.hmacEnv!=='string'||!/^INSTAR_[A-Z0-9_]{1,60}$/.test(c.evidenceTrust.hmacEnv)))throw Error('evidenceTrust.hmacEnv must name an INSTAR_* environment variable');
  if(c.review!==undefined){if(!c.review||typeof c.review!=='object'||Array.isArray(c.review)||!['vue','react','none'].includes(c.review.framework||'none')||!['typescript','javascript','python','java','go'].includes(c.review.language||'typescript')|| (c.review.extraChecks!==undefined&&(!Array.isArray(c.review.extraChecks)||c.review.extraChecks.some(x=>typeof x!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(x)))))throw Error('Invalid review configuration');}
  return c;
}
async function projectContextFiles(root,c={}){
  const result={architecture:c.context?.architecture??null,design:c.context?.design??null};
  for(const key of ['architecture','design']){
    if(result[key])continue;
    const candidates=key==='architecture'?['ARCHITECTURE.md','docs/engineering/ARCHITECTURE.md','docs/architecture/ARCHITECTURE.md','docs/architecture.md','.context/ARCHITECTURE.md']:['DESIGN.md','docs/engineering/DESIGN.md','docs/design/DESIGN.md','docs/design.md','.context/DESIGN.md'];
    for(const candidate of candidates)if(await exists(root,candidate)){result[key]=candidate;break;}
  }
  result.tokenResolution=await resolveTokenSources(root,c.context?.tokens);
  result.tokens=result.tokenResolution.sources;
  return result;
}
async function guidanceFingerprint(root) {
  const c=await config(root),context=await projectContextFiles(root,c);
  const names=new Set(['AGENTS.md','.context/AGENTS.md',...(context.architecture?[context.architecture]:[]),...(context.design?[context.design]:[]),...context.tokens]);
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
    const file=await safe(root,name);
    try{const stat=await fs.lstat(file);if(!stat.isFile())continue;result.push([name,digest(await fs.readFile(file))]);}
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
    const file = await safe(root, name);
    try { const stat = await fs.stat(file); if (!stat.isFile()) throw Error(`Unsupported file: ${name}`); files.push([name, stat.mode, digest(await fs.readFile(file))]); }
    catch (e) { if(e.code !== 'ENOENT') throw e; files.push([name,'deleted']); }
  }
  // Include ignored governance files as well; they change review policy.
  for (const name of ['.instar-quality.json','package.json',...['AGENTS.md','.context/AGENTS.md',context.architecture,context.design].filter(Boolean),...context.tokens]) {
    files.push([name, await exists(root,name) ? digest(await read(root,name)) : 'missing']);
  }
  const guidance=await guidanceFingerprint(root);
  return {tree,fingerprint:digest(JSON.stringify({head,base,files,guidance,index:git(root,['ls-files','--stage','-z']).split('\0').filter(entry=>entry && !generated(entry.slice(entry.indexOf('\t')+1)))})),head,base,baseRef:c.baseRef,changed,configurationSource:c.configurationSource||'project'};
}
async function save(root, kind, data, key=null) {
  const report = sealReport({schemaVersion:1,kind,id:randomUUID(),at:now(),...redactData(data)},key);
  const text = JSON.stringify(report,null,2)+'\n';
  const files=[
    {name:`reports/${kind}-${report.id}.json`,text},
    {name:`logs/${kind}-${report.id}.md`,text:`# ${kind}\n\nTime: ${report.at}\nStatus: ${report.status}\nReport: reports/${kind}-${report.id}.json\nFingerprint: ${report.snapshot?.fingerprint || 'not applicable'}\n`},
    {name:`reports/${kind}.json`,text},
  ];
  await writeReportTransaction(root,files);
  return report;
}
async function writeReportTransaction(root,files){
 const transaction=`.instar/quality-transactions/${randomUUID()}`, staged=[], backups=[], moved=[];
 try{
  for(const file of files){
   const stage=`${transaction}/${file.name}`;await write(root,stage,file.text,true);staged.push({stage,name:file.name});
  }
  for(const file of staged){
   const destination=await safe(root,file.name),backup=`${transaction}/backup/${file.name}`;
   await fs.mkdir(path.dirname(destination),{recursive:true});
   if(await exists(root,file.name)){await write(root,backup,await read(root,file.name),true);backups.push({backup,name:file.name});}
   await fs.rename(await safe(root,file.stage),destination);
   moved.push({name:file.name});
  }
 }catch(error){
  for(const file of moved){try{await fs.rm(await safe(root,file.name),{force:true});}catch{} }
  for(const file of backups){try{await fs.rename(await safe(root,file.backup),await safe(root,file.name));}catch{} }
  throw error;
 }finally{await fs.rm(await safe(root,transaction),{recursive:true,force:true});}
}
async function runScript(root, c, script) {
  const pkg = await json(root, 'package.json').catch(()=>({scripts:{}}));
  if (typeof script !== 'string' || !/^[\w:-]+$/.test(script) || !pkg.scripts?.[script]) return {script:script || null,status:'BLOCK',result:'SPAWN_ERROR',error:'SCRIPT_MISSING',reason:'Required package script missing'};
  const start = Date.now();
  // Scripts are project-owned and must run under the caller's sandbox. Offline flags
  // prevent package fetching, but are NOT an OS network isolation boundary.
  const timeoutMs=c.timeoutMs||120000;
  const env=safeEnvironment();
  const r = spawnSync(c.packageManager, ['run',script], {cwd:root, encoding:'utf8', timeout:timeoutMs, maxBuffer:4*1024*1024,
    env:{...env,CI:'true',npm_config_offline:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'}});
  const error=r.error?.code||null,result=executionResult(r.error,r.status,r.signal),status=result==='EXECUTED_PASS'?'PASS':'BLOCK';
  return {script,status,result,exitCode:r.status,signal:r.signal,error,durationMs:Date.now()-start,outputHash:digest((r.stdout||'')+(r.stderr||'')),reason:status === 'PASS' ? 'Completed' : 'Command failed; rerun this script locally for diagnostics (raw output is not persisted)'};
}
async function runConfiguredCheck(root,c,id,spec,evidencePath=null){
 const start=Date.now(),timeoutMs=spec.timeoutMs||c.timeoutMs||120000;
 const env=safeEnvironment();
 const args=spec.args.map((arg,index)=>{
   const previous=spec.args[index-1]||'';
   if (/(?:password|passwd|secret|token|credential|authorization|api[_-]?key|dsn|database_url|connection_string)/i.test(previous) || /(?:hunter2|postgres(?:ql)?:\/\/[^\s]*:[^\s@]+@)/i.test(arg)) return '[REDACTED]';
   return redactText(arg);
 });
 let cwd;
 try { cwd=spec.cwd?await safe(root,spec.cwd):root; }
 catch(error) { return {id,command:spec.command,args,status:'BLOCK',result:'SPAWN_ERROR',error:error.code||'PATH_ERROR',exitCode:null,signal:null,durationMs:Date.now()-start,outputHash:digest(''),evidencePath,reason:error.message}; }
 if(cwd!==root&&!cwd.startsWith(root+path.sep))return {id,command:spec.command,args,status:'BLOCK',result:'SPAWN_ERROR',error:'PATH_OUTSIDE_WORKSPACE',exitCode:null,signal:null,durationMs:Date.now()-start,outputHash:digest(''),evidencePath,reason:'Check working directory escapes project'};
 let r;try{r=spawnSync(spec.command,spec.args,{cwd,encoding:'utf8',timeout:timeoutMs,maxBuffer:4*1024*1024,env:{...env,CI:'true',npm_config_offline:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'}});}catch(error){return {id,command:spec.command,args,status:'BLOCK',result:'SPAWN_ERROR',error:error.code||'SPAWN_ERROR',exitCode:null,signal:null,durationMs:Date.now()-start,outputHash:digest(''),evidencePath,reason:'Configured command could not be started'};}
 const error=r.error?.code||null,exitCode=r.status,signal=r.signal,result=executionResult(r.error,exitCode,signal),status=result==='EXECUTED_PASS'?'PASS':'BLOCK';
 return {id,command:spec.command,args,status,result,exitCode,signal,error,durationMs:Date.now()-start,outputHash:digest((r.stdout||'')+(r.stderr||'')),evidencePath,reason:status==='PASS'?'Completed':result==='SPAWN_ERROR'?'Command could not be executed':'Command failed; rerun locally for diagnostics (raw output is not persisted)'};
}
function stackFor(c){
 const language=(c?.review?.language||'').toLowerCase();
 return language==='typescript'?['typescript','javascript']:language?[language]:[];
}
function persistedChecks(checks){
 return checks.map(({args,...check})=>({...check,argsCount:Array.isArray(args)?args.length:0,argsHash:Array.isArray(args)?digest(JSON.stringify(args)):null}));
}
async function saveUnifiedQualityReport(root,{profile,verification,policy,review,config:c={}}) {
  const file='reports/unified-quality.json';
  let previous={};try{previous=await json(root,file);}catch(error){if(error.code!=='ENOENT')throw error;}
  const sourceSnapshot=verification?.snapshot||review?.snapshot||null;
  const current=sourceSnapshot?.fingerprint||null;
  let existing={};
  if(previous.source?.snapshotFingerprint===current){
    try{validateReportIntegrity(previous,evidenceKey(c),Boolean(evidenceKey(c)));existing=previous;}
    catch(error){throw Error(`Existing unified quality report integrity invalid: ${error.message}`);}
  }
  const profiles={...(existing.profiles||{})};
  if(profile)profiles[profile]={status:verification.status,riskLevel:verification.riskLevel||'L1',verificationReportId:verification.id,checks:verification.reportChecks||persistedChecks(verification.checks),mandatory:policy?.mandatory||[],waivers:policy?.waivers||[]};
  const reviewResult=profile?null:(review?{status:review.status,riskLevel:review.riskLevel||'L1',checks:review.checks,reviewReportId:review.id,snapshot:review.snapshot}:existing.review||null);
  const statuses=[...Object.values(profiles).map(p=>p.status),reviewResult?.status].filter(Boolean);
  const status=statuses.includes('FAIL')?'FAIL':statuses.includes('BLOCK')||statuses.includes('BLOCKED')?'BLOCK':statuses.includes('PASS_WITH_WAIVERS')?'PASS_WITH_WAIVERS':statuses.length&&statuses.every(x=>x==='PASS'||x==='WARN')?'PASS':'BLOCK';
  const report=sealReport({schemaVersion:2,kind:'unified-quality',reportId:randomUUID(),generatedAt:now(),project:{id:path.basename(root),stack:stackFor(c)},configurationSource:c.configurationSource||'project',source:{head:sourceSnapshot?.head||null,baseRef:sourceSnapshot?.baseRef||c.baseRef||null,snapshotFingerprint:current},snapshotFingerprint:current,policy:policy?{schemaVersion:policy.schemaVersion,profile}:existing.policy||null,status,releaseReady:!!reviewResult&&!!profiles.full&&['PASS','PASS_WITH_WAIVERS'].includes(profiles.full.status)&&['PASS','WARN'].includes(reviewResult.status),profiles,review:reviewResult},evidenceKey(c));
  await write(root,file,JSON.stringify(report,null,2)+'\n');
  const lines=['# InStar Unified Quality Report','',`Status: ${report.status}`,`Release ready: ${report.releaseReady}`,`Project: ${report.project.id}`,`Stack: ${report.project.stack.join(', ')||'unknown'}`,`HEAD: ${report.source.head}`,`Base: ${report.source.baseRef}`,`Snapshot: ${current}`,'','## Verification profiles'];
  for(const [name,data] of Object.entries(profiles)){lines.push(`### ${name} — ${data.status}`);if(data.verificationReportId)lines.push(`Evidence report: ${data.verificationReportId}`);for(const item of data.checks||[])lines.push(`- ${item.id}: ${item.status} (${item.result||'UNKNOWN'}); command: ${item.command||'n/a'}; evidence: ${item.evidencePath||'n/a'}`);for(const item of data.mandatory||[])lines.push(`- ${item.category} / ${item.checkId}: ${item.status} (raw: ${item.rawStatus||item.status})`);for(const w of data.waivers||[])lines.push(`- WAIVER ${w.category}: ${w.reason}; approved by ${w.approvedBy}; expires ${w.expiresAt}`);}
  lines.push('','## Review',reviewResult?`Status: ${reviewResult.status}`:'NOT_RUN','');
  await write(root,'reports/unified-quality.md',lines.join('\n'));
  return report;
}
async function verify(root, profile, requestedRisk='L1') {
  if (!['full','commit'].includes(profile)) throw Error('profile must be full or commit');
  const c = await config(root), before = await snapshot(root), riskLevel=effectiveRiskLevel(c,requestedRisk,before.changed);
  if (highRisk(riskLevel) && profile!=='full') throw Error(`${riskLevel} changes require the full verification profile`);
  if(c.configurationSource==='auto-detected'){
    const kind=c.detectedStack==='python'?'engineering':'frontend';
    const result=await save(root,`${kind}-verify-${profile}`,{snapshot:before,riskLevel,status:'WARN',checks:[],stable:true,qualityPolicy:{status:'NOT_CONFIGURED',note:'No .instar-quality.json found; no project-owned verification commands were executed'},coverage:{basis:'auto-detected',profile,riskLevel,checkIds:[],note:'Automatic discovery is informational only; configure project checks for reproducible verification'},configurationSource:'auto-detected',detectedStack:c.detectedStack,limitations:['No project-owned verification commands were executed','This result cannot satisfy pre-pr-check or serve as remote CI evidence']},evidenceKey(c));
    result.checks=[];result.reportChecks=[];
    await saveUnifiedQualityReport(root,{profile,verification:result,policy:null,review:null,config:c});
    return result;
  }
  const checks = [];
  const kind=c.verification?.profiles?.[profile]?`engineering-verify-${profile}`:`frontend-verify-${profile}`;
  for (const id of checksForProfile(c,profile)) {
    if(c.verification?.profiles?.[profile]){const check=await runConfiguredCheck(root,c,id,c.tools.checks[id],`reports/${kind}.json`);checks.push(check);if(check.status!=='PASS')break;continue;}
    const script=id==='security-scan'?c.tools.security:c.scripts?.[id] || (['dependencies','vite-build'].includes(id) ? c.tools?.[id] : id);
    const check = {id,...await runScript(root,c,script)}; checks.push(check);
    if (check.status !== 'PASS') break;
  }
  const after = await snapshot(root), stable = before.fingerprint === after.fingerprint;
  const policy=c.qualityPolicy?evaluateQualityPolicy(c.qualityPolicy,profile,[...checks,{id:'evidence-report',status:stable?'PASS':'BLOCK'}],before):null;
  const checkIds=checksForProfile(c,profile);
  const coverage=c.verification
    ? {basis:'project-configured-checks',profile,riskLevel,checkIds,note:'configured checks coverage does not independently prove complete project coverage'}
    : {basis:'mandatory-policy',profile,checkIds};
  const waivedChecks = new Set(
    policy?.waivers?.map(item => item.checkId) || []
  );

  // A non-zero exit code without a spawn/runtime error represents
  // an executed check failure. Preserve the raw check status.
  const infrastructureBlocked = checks.some(check =>
    check.status === 'BLOCK' &&
    !waivedChecks.has(check.id) &&
    (
      check.error != null ||
      check.exitCode == null ||
      check.signal != null
    )
  );

  const allowedPolicyStatuses = new Set([
    'PASS',
    'FAIL',
    'PASS_WITH_WAIVERS'
  ]);

  const status =
    !stable || !policy || infrastructureBlocked
      ? 'BLOCK'
      : allowedPolicyStatuses.has(policy.status)
        ? policy.status
        : 'BLOCK';
  const evidenceChecks=checks.map(check=>({...check,evidencePath:`reports/${kind}.json`}));
  const reportChecks=persistedChecks(evidenceChecks);
  const result=await save(root,kind,{snapshot:before,riskLevel,status,checks:reportChecks,stable,qualityPolicy:policy||{status:'NOT_CONFIGURED',note:'Mandatory quality policy missing; legacy verification cannot pass'},coverage},evidenceKey(c));
  result.checks=evidenceChecks;
  result.reportChecks=reportChecks;
  await saveUnifiedQualityReport(root,{profile,verification:result,policy,review:null,config:c});
  return result;
}
async function validateReview(review,items=reviewItems,root=null,riskLevel='L1') {
  riskLevel=normalizeRiskLevel(riskLevel);
  if (!review || typeof review.reviewer !== 'string' || !review.reviewer.trim() || typeof review.fingerprint !== 'string') throw Error('Review requires reviewer and snapshot fingerprint');
  if (!Array.isArray(review.checks) || review.checks.length !== items.length || new Set(review.checks.map(c=>c.id)).size !== items.length) throw Error('Review checklist incomplete or duplicated');
  for (const id of items) {
    const item = review.checks.find(c=>c.id===id);
    if (!item || !['PASS','BLOCK','WARN','INFO','NA'].includes(item.status)) throw Error(`Missing review evidence: ${id}`);
    if (!highRisk(riskLevel)) {
      if ((typeof item.evidence !== 'string' && (!item.evidence || typeof item.evidence!=='object')) || (typeof item.evidence==='string' && !item.evidence.trim())) throw Error(`Missing review evidence: ${id}`);
      continue;
    }
    const evidence=item.evidence;
    const allowedTypes=new Set(['source','test','config','design','ci','decision','not-verified','not-applicable']);
    if (!evidence || typeof evidence!=='object' || Array.isArray(evidence) || !allowedTypes.has(evidence.type) || typeof evidence.note!=='string' || !evidence.note.trim() || typeof evidence.snapshotFingerprint!=='string' || evidence.snapshotFingerprint!==review.fingerprint) throw Error(`Invalid structured review evidence: ${id}`);
    if (evidence.type==='not-verified' && !['WARN','BLOCK'].includes(item.status)) throw Error(`Unverified evidence must be WARN or BLOCK: ${id}`);
    if (evidence.type==='not-applicable' && item.status!=='NA') throw Error(`Not-applicable evidence must be NA: ${id}`);
    if (evidence.type==='not-verified' || evidence.type==='not-applicable') continue;
    const hasRange=Number.isInteger(evidence.startLine)&&Number.isInteger(evidence.endLine);
    const hasSingle=Number.isInteger(evidence.line);
    if (!root || typeof evidence.path!=='string' || !evidence.path.trim() || path.isAbsolute(evidence.path) || evidence.path.split(/[\\/]/).includes('..') || (!hasSingle&&!hasRange) || (hasSingle&&(evidence.line<1)) || (hasRange&&(evidence.startLine<1||evidence.endLine<evidence.startLine)) || typeof evidence.excerpt!=='string' || !evidence.excerpt.trim()) throw Error(`Review evidence location required: ${id}`);
    const content=await readRegularFile(root,evidence.path);
    const lines=content.split(/\r?\n/);
    const startLine=hasRange?evidence.startLine:evidence.line;
    const endLine=hasRange?evidence.endLine:Math.min(lines.length,startLine+Math.max(0,evidence.excerpt.split(/\r?\n/).length-1));
    if (startLine>lines.length || endLine>lines.length || lines.slice(startLine-1,endLine).join('\n').includes(evidence.excerpt)===false) throw Error(`Review evidence does not match current source: ${id}`);
  }
}
async function quality(root, review, requestedRisk=null) {
  const c = await config(root);
  const before = await snapshot(root);
  const declaredRisk=requestedRisk || review?.riskLevel || 'L1', riskLevel=effectiveRiskLevel(c,declaredRisk,before.changed);
  if (review?.riskLevel && riskRank(normalizeRiskLevel(review.riskLevel))<riskRank(riskLevel)) throw Error('Review risk level is lower than the effective change risk');
  review={...review,riskLevel};
  await validateReview(review,reviewItemsFor(c),root,riskLevel);
  if(riskLevel==='L3')validateL3Review(review,c);
  review=redactData(review);
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
  const blocked = !stable || checks.some(c=>c.status==='BLOCK') || review.checks.some(c=>c.status==='BLOCK');
  const result=await save(root,'quality-gate',{snapshot:before,riskLevel,status:blocked?'BLOCK':review.checks.some(c=>c.status==='WARN')?'WARN':'PASS',checks,review,stable},evidenceKey(c));
  await saveUnifiedQualityReport(root,{profile:null,verification:null,policy:null,review:result,config:c});
  return result;
}
async function readRegularFile(root,relative){
  const file=await safe(root,relative);let handle;
  try{
    handle=await fs.open(file,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
    const stat=await handle.stat();if(!stat.isFile())throw Error('Invalid evidence file');
    return await handle.readFile('utf8');
  }finally{if(handle)await handle.close();}
}
export async function validateEvidenceChain(root, verification, unified, profile, key=null) {
  if (!verification?.id || !verification?.snapshot) throw Error('Invalid verification evidence');
  validateReportIntegrity(verification,key,Boolean(key));
  validateReportIntegrity(unified,key,Boolean(key));
  const entry=unified?.profiles?.[profile];
  if (!entry) throw Error('Missing unified quality profile');
  if (entry.verificationReportId!==verification.id) throw Error('Verification report ID mismatch');
  if (unified.source?.snapshotFingerprint!==verification.snapshot.fingerprint) throw Error('Snapshot fingerprint mismatch');
  if (unified.source?.head!==verification.snapshot.head) throw Error('Git HEAD mismatch');
  if (entry.status!==verification.status) throw Error('Verification status mismatch');
  if (JSON.stringify(entry.checks)!==JSON.stringify(verification.checks)) throw Error('Verification checks mismatch');
  if (JSON.stringify(entry.mandatory)!==JSON.stringify(verification.qualityPolicy?.mandatory)) throw Error('Mandatory policy evidence mismatch');
  if (unified.policy?.schemaVersion!==verification.qualityPolicy?.schemaVersion || unified.policy?.profile!==profile) throw Error('Quality policy metadata mismatch');
  for (const check of entry.checks||[]) {
    if (typeof check.evidencePath!=='string' || path.isAbsolute(check.evidencePath) || check.evidencePath.split(/[\\/]/).includes('..')) throw Error('Invalid evidence path');
    const evidenceReport=JSON.parse(await readRegularFile(root,check.evidencePath));
    validateReportIntegrity(evidenceReport,key,Boolean(key));
    if(evidenceReport.id!==verification.id || JSON.stringify(evidenceReport.checks)!==JSON.stringify(verification.checks)) throw Error('Evidence report content mismatch');
  }
}
async function gate(root, profile) {
  const current = await snapshot(root), c = await config(root);
  const localKind=`${c.verification?'engineering':c.detectedStack==='python'?'engineering':'frontend'}-verify-${profile}`;let local;
  if(await exists(root,`reports/${localKind}.json`))local=await json(root,`reports/${localKind}.json`);
  if(!local)throw Error('Missing verification report');
  if(!await exists(root,'reports/quality-gate.json'))throw Error('Missing quality-gate report');
  if(!await exists(root,'reports/unified-quality.json'))throw Error('Missing unified quality report');
  const review = await json(root,'reports/quality-gate.json');
  const unified=await json(root,'reports/unified-quality.json');
  const key=evidenceKey(c);
  await validateEvidenceChain(root,local,unified,profile,key);
  validateReportIntegrity(review,key,Boolean(key));
  if(!unified.review || unified.review.reviewReportId!==review.id || unified.review.status!==review.status || unified.review.snapshot?.fingerprint!==review.snapshot?.fingerprint || JSON.stringify(unified.review.checks)!==JSON.stringify(review.checks)) throw Error('Review evidence missing, failed or stale');
  for (const r of [local,review]) if (!r.stable || !['PASS','WARN','PASS_WITH_WAIVERS'].includes(r.status) || r.snapshot?.fingerprint !== current.fingerprint) throw Error('Missing, failed or stale quality evidence; rerun the configured verification and quality-gate');
  if (!['frontend-verify','engineering-verify'].includes(local.kind?.replace(/-(commit|full)$/,'')) || !['PASS','PASS_WITH_WAIVERS'].includes(local.status)) throw Error('Wrong verification profile');
  const required = checksForProfile(c,profile);
  if (!c.qualityPolicy) throw Error('Mandatory qualityPolicy missing; legacy verification cannot pass');
  const riskLevel=effectiveRiskLevel(c,review.riskLevel || local.riskLevel || 'L1',current.changed);
  if (review.riskLevel && riskRank(normalizeRiskLevel(review.riskLevel))<riskRank(riskLevel)) throw Error('Review risk level is lower than the effective change risk');
  if (local.riskLevel && riskRank(normalizeRiskLevel(local.riskLevel))<riskRank(riskLevel)) throw Error('Verification risk level is lower than the effective change risk');
  if (highRisk(riskLevel) && profile!=='full') throw Error(`${riskLevel} changes require the full verification profile`);
  await validateReview(review.review,reviewItemsFor(c),root,riskLevel);
  if(riskLevel==='L3')validateL3Review(review.review,c);
  if (review.review.fingerprint!==current.fingerprint || review.review.checks.some(c=>c.status==='BLOCK') || !qualityTools.filter(id=>c.tools?.[id]).every(id=>review.checks?.some(c=>c.id===id && c.status==='PASS'))) throw Error('Review checks incomplete');
  if(c.tools?.architecture&&!review.checks?.some(c=>c.id==='architecture'&&c.status==='PASS'))throw Error('Configured architecture check is missing or did not pass');
  {const policy=evaluateQualityPolicy(c.qualityPolicy,profile,[...local.checks,{id:'evidence-report',status:local.stable?'PASS':'BLOCK'}],current);if(!['PASS','PASS_WITH_WAIVERS'].includes(policy.status)||policy.status!==local.qualityPolicy?.status)throw Error('Mandatory quality checks or waivers are incomplete');if(JSON.stringify(policy.mandatory)!==JSON.stringify(unified.profiles[profile].mandatory))throw Error('Unified mandatory policy is stale');}
  return {status:local.status,riskLevel,snapshot:current,localReport:local.id,reviewReport:review.id};
}
async function doctor(root) {
  const c = await config(root), checks = [];
  checks.push(c.configurationSource==='auto-detected'
    ? {id:'quality-config',status:'WARN',configurationSource:'auto-detected',detectedStack:c.detectedStack,reason:'No .instar-quality.json found; project files were not modified. Configure project-owned checks for reproducible verification.'}
    : {id:'quality-config',status:'PASS',configurationSource:'project',path:'.instar-quality.json'});
  const context=await projectContextFiles(root,c);
  checks.push({id:'context:architecture',path:context.architecture,status:context.architecture?(await exists(root,context.architecture)?'PASS':'BLOCK'):'INFO',reason:context.architecture?undefined:'No project architecture document configured or discovered; architecture review uses available project instructions and code'});
  checks.push({id:'context:design',path:context.design,status:context.design?(await exists(root,context.design)?'PASS':'BLOCK'):'INFO',reason:context.design?undefined:'No project design document configured or discovered; design review uses available project guidance and code'});
  checks.push({id:'context:tokens',configured:context.tokenResolution.configured,discovered:context.tokenResolution.discovered,paths:context.tokenResolution.results,status:context.tokenResolution.problems.length?'BLOCK':context.tokens.length?'PASS':'INFO',reason:context.tokenResolution.problems.length?'Configured or discovered Token sources must be regular, workspace-local files without symlinks':context.tokens.length?undefined:'No project Design Token source configured or discovered; do not invent token mappings'});
  for(const [key,label] of [['sessionState','context:session-state'],['lessons','context:lessons']])if(c.context?.[key])checks.push({id:label,path:c.context[key],status:await exists(root,c.context[key])?'PASS':'WARN',reason:'Optional session context destination'});
  if(c.schemaVersion<3)for (const file of ['package.json','package-lock.json','node_modules']) checks.push({id:file,status:await exists(root,file)?'PASS':'WARN'});
  checks.push({id:'github-workflows',status:await exists(root,'.github/workflows')?'PASS':'INFO',reason:await exists(root,'.github/workflows')?undefined:'No repository GitHub workflow directory discovered'});
  if(c.verification)checks.push({id:'configured-verification',status:'PASS',profiles:{commit:c.verification.profiles.commit,full:c.verification.profiles.full},reason:'Configured command profiles were inspected; doctor does not execute them'});
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
  if(c.configurationSource==='auto-detected'){
    return sealReport({schemaVersion:1,kind:'doctor',id:randomUUID(),at:now(),status:checks.some(check=>check.status==='BLOCK')?'BLOCK':checks.some(check=>check.status==='WARN')?'WARN':'PASS',checks,configurationSource:'auto-detected',detectedStack:c.detectedStack},evidenceKey(c));
  }
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
  await write(root,log,`# Session ${id}\n\n${stamp}\n\n${summary?`## Summary\n${summary}\n\n`:'No session summary supplied; no project state was inferred.\n\n'}${lessons?`## Evidence-backed lesson\n${lessons}\n\n`:'No evidence-backed lesson supplied; none was recorded.\n\n'}Status: pending\n`,true);
  for(const [key,body,label] of [['sessionState',summary,'Session summary'],['lessons',lessons,'Observed lesson']])if(body&&c.context?.[key]){
    const file=c.context[key],old=await exists(root,file)?await read(root,file):`# ${label}\n`;
    await write(root,file,`${old.trimEnd()}\n\n## ${stamp} (${id})\n${body}\n`);updates.push({label,file,body});
  }
  await write(root,log,`# Session ${id}\n\n${stamp}\n\n${summary?`## Summary\n${summary}\n\n`:'No session summary supplied; no project state was inferred.\n\n'}${lessons?`## Evidence-backed lesson\n${lessons}\n\n`:'No evidence-backed lesson supplied; none was recorded.\n\n'}${updates.length?`## Project context updated\n${updates.map(item=>`- ${item.label}: \`${item.file}\``).join('\n')}`:'No project context files were changed.'}\n\nStatus: complete\n`);
  if(pending) await fs.unlink(await safe(root,'logs/pending-session.json'));
  return {status:'PASS',log,contextUpdated:updates.map(({label,file})=>({label,file}))};
}
function requireText(value, name) { if(typeof value!=='string' || !value.trim()) throw Error(`${name} required`); return value; }
async function provenance(root,input) {
  if(typeof input.aiGenerated!=='boolean') throw Error('aiGenerated must be explicit');
  const c=await config(root),current=await snapshot(root);
  return save(root,'ai-provenance',{status:'PASS',snapshot:current,aiGenerated:input.aiGenerated,sessionId:boundedText(requireText(input.sessionId,'sessionId'),256),summary:boundedText(requireText(input.summary,'summary'),6000)},evidenceKey(c));
}
async function prePr(root) {
  const c=await config(root),result=await gate(root,'full'), p=await json(root,'reports/ai-provenance.json');
  validateReportIntegrity(p,evidenceKey(c),Boolean(evidenceKey(c)));
  if(p.status!=='PASS' || p.snapshot?.fingerprint!==result.snapshot.fingerprint || typeof p.aiGenerated!=='boolean' || !p.summary?.trim()) throw Error('Missing or stale ai-provenance; record session summary for this snapshot');
  return {...result,provenance:p};
}
function assertStaged(root) {
  const dirty=git(root,['diff','--name-only','-z']).split('\0').filter(Boolean).filter(n=>!generated(n));
  const untracked=git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean).filter(n=>!generated(n));
  if(dirty.length || untracked.length) throw Error('Stage all intended source/config changes before commit; working tree and index must match');
}
async function commitCheck(root) {
  const c=await config(root);
  assertStaged(root);
  const local=await verify(root,'commit');
  if(!['PASS','PASS_WITH_WAIVERS'].includes(local.status)) throw Error('Configured commit verification failed');
  const old=await json(root,'reports/quality-gate.json');
  validateReportIntegrity(old,evidenceKey(c),Boolean(evidenceKey(c)));
  validateReportIntegrity(old);
  const review=await quality(root,old.review);
  if(review.status==='BLOCK') throw Error('quality-gate failed');
  return gate(root,'commit');
}
async function commit(root,input) {
  requireText(input.authorization,'authorization'); requireText(input.message,'message');
  assertStaged(root);
  const c=await config(root), before=await snapshot(root), branch=git(root,['branch','--show-current']);
  if(!branch || ['main','master',c.baseRef,c.ci?.base].includes(branch)) throw Error('Use a feature branch');
  let waived=false;
  try { await commitCheck(root); }
  catch(error) {
    if(input.force!==true) throw error;
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
  if (['frontend-verify','local-verify','engineering-verify'].includes(input.action)) return verify(root,input.profile || 'full',input.riskLevel || 'L1');
  if (input.action === 'quality-gate') return quality(root,input.review,input.riskLevel);
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
  if(input.action==='doctor' && !(await exists(root,'.instar-quality.json'))) return doctor(root);
  let handle, lock;
  try {
    lock=await safe(root,'logs/.quality.lock');
    await fs.mkdir(path.dirname(lock),{recursive:true});
    handle=await fs.open(lock,'wx');
    await handle.writeFile(JSON.stringify({pid:process.pid,at:now(),action:input.action}));
    try { return await dispatch(root,input); }
    catch(error) {
      // Never leave a prior PASS as the latest result after a failed recheck.
      const verificationKinds=input.action==='engineering-verify'?[`engineering-verify-${input.profile==='commit'?'commit':'full'}`]:['local-verify','frontend-verify'].includes(input.action)?[`frontend-verify-${input.profile==='commit'?'commit':'full'}`,`engineering-verify-${input.profile==='commit'?'commit':'full'}`]:[];
      const kinds=[...verificationKinds,...(['quality-gate','doctor','pre-pr-check'].includes(input.action)?[input.action]:[])];
      for(const kind of kinds) {
        try { await save(root,kind,{status:'BLOCK',stable:false,reason:error.message}); }
        catch(auditError) { throw new AggregateError([error,auditError],`${error.message}; audit write failed: ${auditError.message}`); }
      }
      throw error;
    }
  } catch(error) {
    if(input.action==='session-close') return {status:'WARN',reason:error.message};
    if(error.code==='EEXIST') throw Error('Quality operation already running; inspect logs/.quality.lock before recovery');
    throw error;
  } finally {
    if(handle) { await handle.close(); await fs.unlink(lock); }
  }
}
