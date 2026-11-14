import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,access,mkdir,rename,symlink} from 'node:fs/promises';
import {constants,promises as fsPromises} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {evaluateQualityPolicy,validateQualityPolicy} from '../src/quality-controller/policy.mjs';
import {acquireFileLock,releaseFileLock} from '../src/shared/file-lock.mjs';
import {runCommand,windowsCommandPlan} from '../src/shared/run-command.mjs';
import {openVerified,readHandleVerified,readTextVerified} from '../src/shared/path-safety.mjs';
import {normalizeProfileName,requiredWorkflowKinds,verificationReportKind,verificationReportVariants} from '../src/shared/profile-contract.mjs';
const snapshot={fingerprint:'snapshot-a',head:'commit-a'};
const full=['Q-01','Q-02','Q-03','Q-04','Q-05','Q-06','Q-07'].map((category,i)=>({category,checkId:category==='Q-07'?'evidence-report':`check-${i+1}`}));
const policy={schemaVersion:1,profiles:{commit:[full[0],full[6]],full}};
const checks=full.map(x=>({id:x.checkId,status:'PASS'}));
test('preflight is canonical and commit remains a read-compatible profile alias',()=>{
 assert.equal(normalizeProfileName('commit'),'preflight');
 assert.equal(normalizeProfileName('preflight'),'preflight');
 assert.equal(verificationReportKind('commit'),'engineering-verify-preflight');
 assert.deepEqual(verificationReportVariants('preflight'),[
  {profile:'preflight',kind:'engineering-verify-preflight'},
  {profile:'commit',kind:'engineering-verify-commit'}
 ]);
 assert.deepEqual(requiredWorkflowKinds('commit'),[]);
 assert.throws(()=>normalizeProfileName('unknown'),/profile must be/);
});
test('quality policy accepts canonical preflight and legacy commit profiles',()=>{
 const preflight={schemaVersion:1,profiles:{preflight:[full[0],full[6]],full}};
 assert.doesNotThrow(()=>validateQualityPolicy(preflight));
 assert.equal(evaluateQualityPolicy(preflight,'preflight',checks,snapshot).status,'PASS');
 assert.equal(evaluateQualityPolicy(preflight,'commit',checks,snapshot).status,'PASS');
 assert.doesNotThrow(()=>validateQualityPolicy(policy));
 assert.equal(evaluateQualityPolicy(policy,'preflight',checks,snapshot).status,'PASS');
 assert.throws(()=>validateQualityPolicy({...preflight,profiles:{...preflight.profiles,unknown:[full[0]]}}),/Invalid qualityPolicy profile/);
});
test('mandatory full matrix and fail closed',()=>{
 assert.doesNotThrow(()=>validateQualityPolicy(policy));
 assert.throws(()=>validateQualityPolicy({...policy,profiles:{...policy.profiles,full:full.slice(0,-2).concat(full[6])}}),/Q-01 through Q-07/);
 assert.equal(evaluateQualityPolicy(policy,'full',checks,snapshot).status,'PASS');
 assert.equal(evaluateQualityPolicy(policy,'full',checks.slice(1),snapshot).status,'BLOCK');
});
test('waiver must carry risk, compensating control, approver and scope; never Q-07',()=>{
 const waiver={category:'Q-01',checkId:'check-1',reason:'temporary exception',risk:'reduced lint coverage',compensatingControl:'manual review',approvedBy:'owner',expiresAt:'2099-01-01T00:00:00Z',scopeFingerprint:'snapshot-a'};
 assert.throws(()=>validateQualityPolicy({...policy,waivers:[{...waiver,category:'Q-07',checkId:'evidence-report'}]}),/Invalid waiver/);
 assert.throws(()=>validateQualityPolicy({...policy,waivers:[{...waiver,risk:''}]}),/Invalid waiver/);
 const p={...policy,waivers:[waiver]},failed=[{id:'check-1',status:'BLOCK'},...checks.slice(1)];
 const result=evaluateQualityPolicy(p,'full',failed,snapshot,new Date('2026-10-31'));
 assert.equal(result.status,'PASS_WITH_WAIVERS');assert.equal(result.waivers[0].rawStatus,'BLOCK');
 assert.equal(evaluateQualityPolicy(p,'full',failed,{...snapshot,fingerprint:'new'},new Date('2026-10-31')).status,'FAIL');
 assert.equal(evaluateQualityPolicy(p,'full',failed,snapshot,new Date('2100-01-01')).status,'FAIL');
});
test('lock release never removes a replacement owner',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'instar-lock-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,'lock');const lock=await acquireFileLock(file);
 await rm(lock.ownerFile);
 await writeFile(lock.ownerFile,JSON.stringify({pid:1,action:'replacement',token:'replacement-token'}));
 await releaseFileLock(lock);
 assert.equal(JSON.parse(await readFile(lock.ownerFile,'utf8')).token,'replacement-token');
});
test('command timeout terminates descendants and reports ETIMEDOUT',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'instar-process-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const marker=path.join(root,'descendant.txt');
 const script='const {spawn}=require("node:child_process");spawn(process.execPath,["-e","setTimeout(()=>require(\'node:fs\').writeFileSync(process.argv[1],\'leak\'),400)",process.argv[1]],{stdio:"ignore"});setTimeout(()=>{},5000)';
 const result=await runCommand(process.execPath,['-e',script,marker],{cwd:root,timeoutMs:100});
 assert.equal(result.error?.code,'ETIMEDOUT');
 await new Promise(resolve=>setTimeout(resolve,800));
 await assert.rejects(access(marker),{code:'ENOENT'});
});
test('windows command planning quotes shims and rejects shell metacharacters',()=>{
 assert.deepEqual(windowsCommandPlan('npm',['run','lint']),{command:'"npm" "run" "lint"',args:[],shell:true});
 assert.deepEqual(windowsCommandPlan('tools\\check.cmd',['--format','json']),{command:'"tools\\check.cmd" "--format" "json"',args:[],shell:true});
 assert.deepEqual(windowsCommandPlan('C:\\tools\\node.exe',['-e','process.exit(0)']),{command:'C:\\tools\\node.exe',args:['-e','process.exit(0)'],shell:false});
 assert.throws(()=>windowsCommandPlan('npm',['run','%PATH%']),error=>error.code==='EINVAL');
 assert.throws(()=>windowsCommandPlan('npm',['run','a"b']),error=>error.code==='EINVAL');
});
test('verified reads enforce byte limits without unbounded readFile',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'instar-read-limit-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'input.txt'),'12345');
 const handle=await openVerified(root,'input.txt',constants.O_RDONLY);
 try{
  handle.readFile=async()=>{throw Error('unbounded readFile used');};
  assert.equal((await readHandleVerified(root,'input.txt',handle,{maxBytes:5})).toString('utf8'),'12345');
  await assert.rejects(readHandleVerified(root,'input.txt',handle,{maxBytes:4}),/Input exceeds 4 byte limit/);
 }finally{await handle.close();}
});
test('verified reads reject a parent replacement after path resolution',async t=>{
 const base=await mkdtemp(path.join(tmpdir(),'instar-path-race-')),root=path.join(base,'project'),outside=path.join(base,'outside');
 t.after(()=>rm(base,{recursive:true,force:true}));
 await mkdir(path.join(root,'reports'),{recursive:true});await mkdir(outside);
 await writeFile(path.join(root,'reports','evidence.json'),'inside');await writeFile(path.join(outside,'evidence.json'),'outside');
 const originalOpen=fsPromises.open;let swapped=false;
 fsPromises.open=async(file,...rest)=>{
  if(!swapped&&String(file).endsWith('evidence.json')){
   swapped=true;
   await rename(path.join(root,'reports'),path.join(root,'reports-real'));
   await symlink(outside,path.join(root,'reports'));
   const handle=await originalOpen(file,...rest);
   await rm(path.join(root,'reports'),{force:true});await rename(path.join(root,'reports-real'),path.join(root,'reports'));
   return handle;
  }
  return originalOpen(file,...rest);
 };
 t.after(()=>{fsPromises.open=originalOpen;});
 await assert.rejects(readTextVerified(root,'reports/evidence.json'),error=>error.code==='EPATHCHANGED');
});
test('verified creates reject a parent replacement before any content is written',async t=>{
 const base=await mkdtemp(path.join(tmpdir(),'instar-path-write-')),root=path.join(base,'project'),outside=path.join(base,'outside');
 t.after(()=>rm(base,{recursive:true,force:true}));
 await mkdir(path.join(root,'reports'),{recursive:true});await mkdir(outside);
 const originalOpen=fsPromises.open;let swapped=false;
 fsPromises.open=async(file,...rest)=>{
  if(!swapped&&String(file).endsWith('new.json')){
   swapped=true;
   await rename(path.join(root,'reports'),path.join(root,'reports-real'));
   await symlink(outside,path.join(root,'reports'));
   const handle=await originalOpen(file,...rest);
   await rm(path.join(root,'reports'),{force:true});await rename(path.join(root,'reports-real'),path.join(root,'reports'));
   return handle;
  }
  return originalOpen(file,...rest);
 };
 t.after(()=>{fsPromises.open=originalOpen;});
 await assert.rejects(async()=>{
  const handle=await openVerified(root,'reports/new.json',constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
  try{await handle.writeFile('secret','utf8');}finally{await handle.close();}
 },error=>error.code==='EPATHCHANGED');
 assert.equal((await readFile(path.join(outside,'new.json'),'utf8')),'');
});
