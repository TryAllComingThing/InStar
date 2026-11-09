import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {run,reviewItems,loadQualityConfig} from '../runtime/quality-controller/index.mjs';
import {redactData} from '../runtime/shared/redaction.mjs';
const hook=new URL('../hooks/quality-hook.mjs',import.meta.url);
const policyFor=checks=>({schemaVersion:1,profiles:{
 commit:[{category:'Q-07',checkId:'evidence-report'}],
 full:['Q-01','Q-02','Q-03','Q-04','Q-05','Q-06','Q-07'].map((category,index)=>({category,checkId:index===6?'evidence-report':checks[Math.min(index,checks.length-1)]}))
}});
async function fixture(t) {
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-quality-'));t.after(()=>rm(project,{recursive:true,force:true}));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','InStar test');
 const config={schemaVersion:2,packageManager:'npm',baseRef:'main',context:{},qualityPolicy:policyFor(['lint','typecheck','test','build','dependencies','vite-build']),tools:Object.fromEntries(['vue-doctor','vue-ai-sanitizer','ai-code-gate','design-lint','dependencies','ci-config','vite-build'].map(n=>[n,`quality:${n}`]))};await writeFile(path.join(project,'.instar-quality.json'),JSON.stringify(config));
 const pkg={scripts:Object.fromEntries(['lint','typecheck','test','build','quality:vue-doctor','quality:vue-ai-sanitizer','quality:ai-code-gate','quality:design-lint','quality:dependencies','quality:ci-config','quality:vite-build'].map(n=>[n,'node -e "process.exit(0)"']))};
 await writeFile(path.join(project,'package.json'),JSON.stringify(pkg));
 await writeFile(path.join(project,'.gitignore'),'reports/\nlogs/\nnode_modules/\n');
 await mkdir(path.join(project,'reports'));await mkdir(path.join(project,'logs'));
 await writeFile(path.join(project,'App.vue'),'<template>Hello</template>');
 git('add','.');git('commit','-m','baseline');git('checkout','-b','feature');
 const call=(action,input={})=>run({action,project,...input});
 const review=async()=>({reviewer:'test-fixture',fingerprint:(await call('snapshot')).fingerprint,checks:reviewItems.map(id=>({id,status:'PASS',evidence:'Isolated orchestration fixture, not a real product review'})),findings:[],unverified:[]});
 return {project,git,pkg,call,review};
}
test('full pipeline accepts current evidence and blocks changed code or staging',async t=>{
 const f=await fixture(t);assert.equal((await f.call('local-verify')).status,'PASS');assert.equal((await f.call('quality-gate',{review:await f.review()})).status,'PASS');
 await f.call('ai-provenance',{aiGenerated:true,sessionId:'test',summary:'Fixture validation'});
 assert.equal((await f.call('pre-pr-check')).status,'PASS');
 await writeFile(path.join(f.project,'App.vue'),'<template>Changed</template>');
 await assert.rejects(f.call('pre-pr-check'),/stale/);
 await f.call('local-verify');await f.call('quality-gate',{review:await f.review()});f.git('add','App.vue');
 await assert.rejects(f.call('pre-pr-check'),/stale/);
});
test('first failure stops execution, overwrites prior pass and missing tools block',async t=>{
 const f=await fixture(t);await f.call('local-verify');
 f.pkg.scripts.lint='node -e "process.exit(7)"';f.pkg.scripts.typecheck='node -e "require(\'fs\').writeFileSync(\'should-not-run\',\'bad\')"';
 await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 const r=await f.call('local-verify');assert.equal(r.status,'BLOCK');assert.equal(r.checks.length,1);assert.equal(r.checks[0].exitCode,7);
 await assert.rejects(access(path.join(f.project,'should-not-run')));
 delete f.pkg.scripts['quality:vue-doctor'];await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 assert.equal((await f.call('quality-gate',{review:await f.review()})).status,'BLOCK');
});
test('project quality scripts do not inherit host credential environment variables',async t=>{
 const f=await fixture(t),old=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='fixture-not-a-secret';
 t.after(()=>{if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;});
 f.pkg.scripts.lint='node -e "if(process.env.GITHUB_TOKEN) process.exit(9)"';await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 const report=await f.call('frontend-verify',{profile:'commit'});assert.equal(report.status,'PASS');assert.equal(report.checks[0].status,'PASS');
});
test('optional security scanner runs only in full verification and configured failures block',async t=>{
 const f=await fixture(t);
 let doctor=await f.call('doctor');assert.equal(doctor.checks.find(c=>c.id==='security-scan').status,'INFO');
 let c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.tools.security='quality:security';
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 f.pkg.scripts['quality:security']='node -e "process.exit(0)"';await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 const commit=await f.call('frontend-verify',{profile:'commit'});assert.equal(commit.status,'PASS');assert.equal(commit.checks.some(check=>check.id==='security-scan'),false);
 let full=await f.call('frontend-verify',{profile:'full'});assert.equal(full.status,'PASS');assert.equal(full.checks.find(check=>check.id==='security-scan').status,'PASS');
 f.pkg.scripts['quality:security']='node -e "process.exit(9)"';await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 full=await f.call('frontend-verify',{profile:'full'});assert.equal(full.status,'BLOCK');assert.equal(full.checks.at(-1).id,'security-scan');assert.equal(full.checks.at(-1).exitCode,9);
 delete f.pkg.scripts['quality:security'];await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 full=await f.call('frontend-verify',{profile:'full'});assert.equal(full.status,'BLOCK');assert.equal(full.checks.at(-1).status,'BLOCK');
 f.pkg.scripts['quality:security']='node -e "setTimeout(()=>{},5000)"';await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.timeoutMs=1000;await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 full=await f.call('frontend-verify',{profile:'full'});assert.equal(full.status,'BLOCK');assert.equal(full.checks.at(-1).id,'security-scan');assert.equal(full.checks.at(-1).error,'ETIMEDOUT');
 f.pkg.scripts['quality:security']='node -e "require(\'fs\').writeFileSync(\'App.vue\',\'<template>Changed by scanner</template>\')"';await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.timeoutMs=120000;await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 full=await f.call('frontend-verify',{profile:'full'});assert.equal(full.status,'BLOCK');assert.equal(full.stable,false);assert.equal(full.checks.at(-1).status,'PASS');
});
test('quality schema version 1 remains explicitly supported',async t=>{
 const f=await fixture(t),c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.schemaVersion=1;await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 const report=await f.call('frontend-verify',{profile:'commit'});assert.equal(report.status,'PASS');
 const doctor=await f.call('doctor'),warning=doctor.checks.find(check=>check.id==='quality-config-version');assert.equal(warning.status,'WARN');assert.equal(warning.schemaVersion,1);assert.equal(warning.targetSchemaVersion,3);assert.match(warning.reason,/next major release/);
});

test('schema 3 engineering verification runs project commands without npm coupling',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['go-vet'],full:['go-vet','go-test','go-security']}};
 config.qualityPolicy=policyFor(['go-vet','go-test','go-security']);
 config.tools.checks={
  'go-vet':{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']},
  'go-test':{kind:'test',command:process.execPath,args:['-e','process.exit(0)'],timeoutMs:5000},
  'go-security':{kind:'security',command:process.execPath,args:['-e','process.exit(0)']}
 };
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const result=await f.call('engineering-verify',{profile:'full'});
 assert.equal(result.kind,'engineering-verify-full');assert.equal(result.status,'PASS');
 assert.deepEqual(result.checks.map(check=>check.id),['go-vet','go-test','go-security']);
 assert.equal(typeof result.checks[0].outputHash,'string');
 assert.match(result.checks[0].artifact,/^reports\/evidence\/full\//);assert.equal(result.checks[0].artifactHash.length,64);
 assert.equal(result.profile,'full');assert.equal(result.configHash.length,64);assert.equal(result.snapshot.fingerprint.length,64);assert.deepEqual(Object.keys(result.checkDefinitions),['go-vet','go-test','go-security']);
 assert.equal(result.coverage.basis,'project-configured-checks');assert.match(result.coverage.note,/does not independently prove/);
 const gate=await f.call('quality-gate',{review:await f.review()});assert.equal(gate.status,'PASS');assert.equal(gate.configHash.length,64);
 await f.call('ai-provenance',{aiGenerated:false,sessionId:'backend-fixture',summary:'Configured backend command profile verified'});
 assert.equal((await f.call('pre-pr-check')).status,'PASS');
});

test('full gate requires a security check in the configured profile',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{lint:{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']}}};
 config.verification={profiles:{commit:['lint'],full:['lint']}};config.qualityPolicy=policyFor(['lint']);
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await f.call('engineering-verify',{profile:'full'});await f.call('quality-gate',{review:await f.review()});
 await f.call('ai-provenance',{aiGenerated:false,sessionId:'no-security-fixture',summary:'Missing security fixture'});
 await assert.rejects(f.call('pre-pr-check'),/Full profile requires a security check/);
});

test('schema 3 engineering verification blocks failed project commands',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['lint'],full:['lint']}};
 config.tools.checks={lint:{kind:'lint',command:process.execPath,args:['-e','process.exit(7)']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const result=await f.call('engineering-verify',{profile:'commit'});
 assert.equal(result.status,'BLOCK');assert.equal(result.checks[0].exitCode,7);
});
test('optional hook command allowlist bounds configured executables',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 const previous=process.env.INSTAR_HOOK_ALLOWED_COMMANDS,previousChecks=process.env.INSTAR_HOOK_ALLOWED_CHECKS;
 t.after(()=>{
  if(previous===undefined)delete process.env.INSTAR_HOOK_ALLOWED_COMMANDS;else process.env.INSTAR_HOOK_ALLOWED_COMMANDS=previous;
  if(previousChecks===undefined)delete process.env.INSTAR_HOOK_ALLOWED_CHECKS;else process.env.INSTAR_HOOK_ALLOWED_CHECKS=previousChecks;
 });
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['lint'],full:['lint']}};
 config.tools.checks={lint:{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 process.env.INSTAR_HOOK_ALLOWED_COMMANDS='npm';
 let result=await f.call('engineering-verify',{profile:'commit'});
 assert.equal(result.status,'BLOCK');assert.equal(result.checks[0].error,'ECOMMANDNOTALLOWED');
 process.env.INSTAR_HOOK_ALLOWED_COMMANDS=path.basename(process.execPath);
 result=await f.call('engineering-verify',{profile:'commit'});
 assert.equal(result.status,'PASS');assert.equal(result.checks[0].status,'PASS');
 process.env.INSTAR_HOOK_ALLOWED_CHECKS='other-check';
 result=await f.call('engineering-verify',{profile:'commit'});
 assert.equal(result.status,'BLOCK');assert.equal(result.checks[0].error,'ECHECKNOTALLOWED');
 process.env.INSTAR_HOOK_ALLOWED_CHECKS='lint';
 result=await f.call('engineering-verify',{profile:'commit'});
 assert.equal(result.status,'PASS');
});
test('schema 3 cannot reuse a stale explicit artifact',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['check'],full:['check']}};
 config.tools.checks={check:{kind:'test',command:process.execPath,args:['-e','process.exit(0)'],artifact:'reports/evidence/stale.json'}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await mkdir(path.join(f.project,'reports/evidence'),{recursive:true});await writeFile(path.join(f.project,'reports/evidence/stale.json'),'{"status":"PASS"}\n');
 const result=await f.call('engineering-verify',{profile:'commit'});
 assert.equal(result.status,'BLOCK');assert.match(result.checks[0].reason,/artifact evidence is invalid/);
});

test('implementation profile runs before approval without full policy',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['lint'],implementation:['lint','test'],full:['lint','test']}};
 config.tools.checks={lint:{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']},test:{kind:'test',command:process.execPath,args:['-e','process.exit(0)']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const result=await f.call('engineering-verify',{profile:'implementation'});
 assert.equal(result.kind,'engineering-verify-implementation');assert.equal(result.status,'PASS');
 assert.deepEqual(result.checks.map(check=>check.id),['lint','test']);
});
test('schema 3 requires explicit kinds and doctor preflights profile coverage',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['lint'],full:['lint']}};
 config.tools.checks={lint:{command:process.execPath,args:['-e','process.exit(0)']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await assert.rejects(f.call('engineering-verify',{profile:'commit'}),/Invalid tools\.checks\.lint/);
 config.tools.checks.lint.kind='lint';await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const doctor=await f.call('doctor'),configured=doctor.checks.find(check=>check.id==='configured-verification');
 assert.equal(configured.status,'WARN');assert.equal(configured.profiles.implementation,null);assert.match(configured.reason,/implementation profile/);
 await assert.rejects(f.call('engineering-verify',{profile:'implementation'}),/profile is not configured/);
});
test('schema 3 rejects incomplete and unsafe command configurations and replaces stale PASS on errors',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};config.verification={profiles:{commit:['lint'],full:['lint']}};config.tools.checks={lint:{kind:'lint',command:process.execPath,args:['-e','process.exit(0)']}};config.qualityPolicy=policyFor(['lint']);await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 assert.equal((await f.call('engineering-verify',{profile:'commit'})).status,'PASS');
 delete config.verification;await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await assert.rejects(f.call('engineering-verify',{profile:'commit'}),/schemaVersion 3 requires/);
 let report=JSON.parse(await readFile(path.join(f.project,'reports/engineering-verify-commit.json'),'utf8'));assert.equal(report.status,'BLOCK');
 config.verification={profiles:{commit:['lint'],full:['lint']}};config.tools.checks={lint:{kind:'lint',command:process.execPath,args:['-e\0','process.exit(0)']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await assert.rejects(f.call('engineering-verify',{profile:'commit'}),/Invalid tools\.checks\.lint/);
 report=JSON.parse(await readFile(path.join(f.project,'reports/engineering-verify-commit.json'),'utf8'));assert.equal(report.status,'BLOCK');
});
test('schema 3 hides command arguments and removes common database credentials from child env',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};config.verification={profiles:{commit:['env-check'],full:['env-check']}};
 config.qualityPolicy=policyFor(['env-check']);
 config.tools.checks={'env-check':{kind:'test',command:process.execPath,args:['-e','process.exit(process.env.DATABASE_URL?9:0)','hunter2']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));const old=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://user:password@example.invalid/db';
 t.after(()=>{if(old===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=old;});
 const result=await f.call('engineering-verify',{profile:'commit'});assert.equal(result.status,'PASS');
 const persisted=await readFile(path.join(f.project,'reports/engineering-verify-commit.json'),'utf8');assert.doesNotMatch(persisted,/hunter2|postgres:\/\/user:password/);assert.equal(result.checks[0].args,undefined);
});
test('schema 3 snapshots explicit ignored inputs and blocks timeout or workspace mutation',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};config.verification={profiles:{commit:['check'],full:['check']},inputs:['.local-build-input']};
 config.tools.checks={check:{kind:'test',command:process.execPath,args:['-e','require("fs").writeFileSync(".local-build-input", "changed")']}};
 await writeFile(path.join(f.project,'.gitignore'),'.local-build-input\nreports/\nlogs/\nnode_modules/\n');await writeFile(path.join(f.project,'.local-build-input'),'before');await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const result=await f.call('engineering-verify',{profile:'commit'});assert.equal(result.status,'BLOCK');assert.equal(result.stable,false);
 config.tools.checks.check={kind:'test',command:process.execPath,args:['-e','setTimeout(()=>{},5000)'],timeoutMs:100};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const timed=await f.call('engineering-verify',{profile:'commit'});assert.equal(timed.status,'BLOCK');assert.equal(timed.checks[0].error,'ETIMEDOUT');
});
test('schema 3 bounds verification input directory count and nesting depth',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};
 config.verification={profiles:{commit:['check'],full:['check']},inputs:['empty-tree']};
 config.tools.checks={check:{kind:'test',command:process.execPath,args:['-e','process.exit(0)']}};
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 const emptyTree=path.join(f.project,'empty-tree');await mkdir(emptyTree);
 for(let i=0;i<10000;i++)await mkdir(path.join(emptyTree,`d${i}`));
 await assert.rejects(f.call('snapshot'),/exceed 10,000 directories/);
 await rm(emptyTree,{recursive:true});
 let deepTree=emptyTree;for(let i=0;i<65;i++){deepTree=path.join(deepTree,'d');await mkdir(deepTree,{recursive:true});}
 await assert.rejects(f.call('snapshot'),/maximum directory depth of 64/);
});
test('schema 3 blocks missing executables and symlink working directories',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};config.verification={profiles:{commit:['check'],full:['check']}};
 config.tools.checks={check:{kind:'test',command:'instar-test-command-that-does-not-exist',args:[]}};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 let result=await f.call('engineering-verify',{profile:'commit'});assert.equal(result.status,'BLOCK');assert.equal(result.checks[0].error,'ENOENT');
 await mkdir(path.join(f.project,'actual-cwd'));await symlink(path.join(f.project,'actual-cwd'),path.join(f.project,'linked-cwd'));
 config.tools.checks.check={kind:'test',command:process.execPath,args:['-e','process.exit(0)'],cwd:'linked-cwd'};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await assert.rejects(f.call('engineering-verify',{profile:'commit'}),/Symlink forbidden/);
 result=JSON.parse(await readFile(path.join(f.project,'reports/engineering-verify-commit.json'),'utf8'));assert.equal(result.status,'BLOCK');
});
test('quality reports redact common credentials before persistence or PR transport',async()=>{
 const safe=redactData({authorization:'do-not-persist',summary:'password: p@ssword and ghp_abcdefghijklmnopqrstuvwxyz1234567890'});
 assert.equal(safe.authorization,'[REDACTED]');assert.doesNotMatch(safe.summary,/p@ssword|ghp_/);assert.match(safe.summary,/\[REDACTED/);
});
test('review must be complete and fresh; BLOCK cannot pass PR gate',async t=>{
 const f=await fixture(t);await f.call('local-verify');
 const review=await f.review();await assert.rejects(f.call('quality-gate',{review:{...review,checks:[]}}),/incomplete/);
 await assert.rejects(f.call('quality-gate',{review:{...review,fingerprint:'old'}}),/stale/);
 review.checks[0].status='BLOCK';assert.equal((await f.call('quality-gate',{review})).status,'BLOCK');
 await assert.rejects(f.call('pre-pr-check'),/failed/);
});
test('schemaVersion 2 review requires code-level file references',async t=>{
 const f=await fixture(t),base=await f.review();
 const review={...base,schemaVersion:2,executionMode:'main-agent-fallback',checks:base.checks.map(item=>({...item,references:[{path:'App.vue',line:1,note:'fixture source'}]}))};
 assert.equal((await f.call('quality-gate',{review})).status,'PASS');
 const missing={...review,checks:review.checks.map(item=>item.id==='security'?{...item,references:[]}:item)};
 await assert.rejects(f.call('quality-gate',{review:missing}),/references required/);
 const badPath={...review,checks:review.checks.map(item=>item.id==='architecture'?{...item,references:[{path:'missing.js',line:1}]}:item)};
 await assert.rejects(f.call('quality-gate',{review:badPath}),/does not exist/);
});
test('session audit records supplied facts without inventing project context; init is non-destructive; symlink writes fail safely',async t=>{
 const f=await fixture(t);const before=await f.call('snapshot');
 const result=await f.call('session-close',{summary:'Verified fixture',lessons:'Observed cleanup behavior'});assert.equal(result.status,'PASS');
 assert.match(await readFile(path.join(f.project,result.log),'utf8'),/Verified fixture/);assert.equal(result.contextUpdated.length,0);
 await assert.rejects(access(path.join(f.project,'.context/PROJECT_STATE.md')));
 assert.equal((await f.call('snapshot')).fingerprint,before.fingerprint);
 const c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.context={sessionState:'.instar/session/PROJECT_STATE.md',lessons:'.instar/session/LESSONS.md'};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 const optedIn=await f.call('session-close',{summary:'Explicitly configured state',lessons:'Evidence: fixture behavior'});assert.equal(optedIn.contextUpdated.length,2);
 assert.match(await readFile(path.join(f.project,'.instar/session/PROJECT_STATE.md'),'utf8'),/Explicitly configured state/);assert.match(await readFile(path.join(f.project,'.instar/session/LESSONS.md'),'utf8'),/Evidence: fixture behavior/);
 await assert.rejects(f.call('initialize-quality'),/Unknown quality action/);
 const outside=await mkdtemp(path.join(os.tmpdir(),'instar-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
 await rm(path.join(f.project,'reports'),{recursive:true,force:true});await symlink(outside,path.join(f.project,'reports'));
 await assert.rejects(f.call('local-verify'),/Symlink/);
});
test('project architecture and design documents are optional, configurable fingerprint inputs',async t=>{
 const f=await fixture(t);let report=await f.call('doctor');assert.equal(report.checks.find(c=>c.id==='context:architecture').status,'INFO');assert.equal(report.checks.find(c=>c.id==='context:design').status,'INFO');
 const c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.context={architecture:'docs/engineering/ARCHITECTURE.md',design:'docs/engineering/DESIGN.md',tokens:'src/styles/tokens.css',sessionState:null,lessons:null};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 await mkdir(path.join(f.project,'docs/engineering'),{recursive:true});await mkdir(path.join(f.project,'src/styles'),{recursive:true});await writeFile(path.join(f.project,'docs/engineering/ARCHITECTURE.md'),'# Approved boundaries');await writeFile(path.join(f.project,'docs/engineering/DESIGN.md'),'# Product design');await writeFile(path.join(f.project,'src/styles/tokens.css'),'--color-primary: blue;');
 const configured=await f.call('doctor');assert.equal(configured.checks.find(c=>c.id==='context:architecture').status,'PASS');assert.equal(configured.checks.find(c=>c.id==='context:design').status,'PASS');assert.equal(configured.checks.find(c=>c.id==='context:tokens').status,'PASS');
 const before=(await f.call('snapshot')).fingerprint;await writeFile(path.join(f.project,'docs/engineering/ARCHITECTURE.md'),'# Changed approved boundaries');assert.notEqual((await f.call('snapshot')).fingerprint,before);
});
test('design-system manifest is a configurable and fingerprinted context source',async t=>{
 const f=await fixture(t);let report=await f.call('doctor');assert.equal(report.checks.find(c=>c.id==='context:designSystem').status,'INFO');
 const config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));config.context={designSystem:'design-system/DESIGN.md'};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 await mkdir(path.join(f.project,'design-system'),{recursive:true});await writeFile(path.join(f.project,'design-system/DESIGN.md'),'# Project design system');
 report=await f.call('doctor');const designSystem=report.checks.find(c=>c.id==='context:designSystem');assert.equal(designSystem.status,'PASS');assert.equal(designSystem.path,'design-system/DESIGN.md');
 const before=(await f.call('snapshot')).fingerprint;await writeFile(path.join(f.project,'design-system/DESIGN.md'),'# Project design system changed');assert.notEqual((await f.call('snapshot')).fingerprint,before);
});
test('design-system directory signals require a discoverable project manifest',async t=>{
 const f=await fixture(t);await mkdir(path.join(f.project,'src/design-system'),{recursive:true});
 let report=await f.call('doctor');let check=report.checks.find(c=>c.id==='context:designSystem');
 assert.equal(check.status,'WARN');assert.equal(check.directory,'src/design-system');assert.match(check.reason,/context\.designSystem/);
 await writeFile(path.join(f.project,'src/design-system/README.md'),'# Project design system');
 report=await f.call('doctor');check=report.checks.find(c=>c.id==='context:designSystem');
 assert.equal(check.status,'PASS');assert.equal(check.path,'src/design-system/README.md');assert.equal(check.directory,'src/design-system');
});
test('Token sources share secure path validation across doctor and quality snapshots',async t=>{
 const f=await fixture(t);const config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.context={tokens:'src/styles/tokens.css'};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
 let doctor=await f.call('doctor');assert.equal(doctor.checks.find(c=>c.id==='context:tokens').status,'BLOCK');
 await assert.rejects(f.call('snapshot'),/Invalid project Token source: src\/styles\/tokens\.css \(MISSING\)/);
 await mkdir(path.join(f.project,'src/styles'),{recursive:true});const external=path.join(f.project,'tokens-real.css');await writeFile(external,':root { --color-primary: blue; }');await symlink(external,path.join(f.project,'src/styles/tokens.css'));
 doctor=await f.call('doctor');assert.equal(doctor.checks.find(c=>c.id==='context:tokens').status,'BLOCK');assert.equal(doctor.checks.find(c=>c.id==='context:tokens').paths[0].status,'UNSAFE');
 await assert.rejects(f.call('snapshot'),/Invalid project Token source: src\/styles\/tokens\.css \(UNSAFE\)/);
 await rm(path.join(f.project,'src/styles/tokens.css'));await writeFile(path.join(f.project,'src/styles/tokens.css'),':root { --color-primary: blue; }');
 doctor=await f.call('doctor');assert.equal(doctor.checks.find(c=>c.id==='context:tokens').status,'PASS');
 const before=(await f.call('snapshot')).fingerprint;await writeFile(path.join(f.project,'src/styles/tokens.css'),':root { --color-primary: navy; }');const after=(await f.call('snapshot')).fingerprint;assert.notEqual(after,before);
});
test('doctor validates project Subagent registration and reports the Codex trust prerequisite',async t=>{
 const f=await fixture(t);let report=await f.call('doctor');assert.equal(report.checks.find(c=>c.id==='codex:agents').status,'INFO');
 await mkdir(path.join(f.project,'.codex/agents'),{recursive:true});await writeFile(path.join(f.project,'.codex/config.toml'),'[agents.architect]\nconfig_file = "agents/architect.toml"\n');await writeFile(path.join(f.project,'.codex/agents/architect.toml'),'name = "architect"\n');
 report=await f.call('doctor');const agents=report.checks.find(c=>c.id==='codex:agents');assert.equal(agents.status,'WARN');assert.deepEqual(agents.registered,['architect']);assert.deepEqual(agents.missing,['developer','ui-reviewer','code-reviewer','security-reviewer','spec-reviewer','frontend-reviewer']);assert.match(agents.trustNote,/trusted/);
 await writeFile(path.join(f.project,'.codex/config.toml'),'[agents.architect\n');report=await f.call('doctor');assert.equal(report.checks.find(c=>c.id==='codex:agents').status,'BLOCK');
});
test('legacy organization policy settings do not affect local quality workflow',async t=>{
 const f=await fixture(t),old=process.env.INSTAR_POLICY_REQUIRED;process.env.INSTAR_POLICY_REQUIRED='true';
 t.after(()=>{if(old===undefined)delete process.env.INSTAR_POLICY_REQUIRED;else process.env.INSTAR_POLICY_REQUIRED=old;});
 await writeFile(path.join(f.project,'.instar-policy.json'),'{ invalid legacy policy');
 assert.equal((await f.call('frontend-verify',{profile:'commit'})).status,'PASS');
 const doctor=await f.call('doctor');assert.equal(doctor.checks.some(item=>item.id.startsWith('policy:')),false);
});
test('removed project initializer actions are rejected',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.call('init-frontend'),/Unknown quality action/);
 await assert.rejects(f.call('initialize-quality'),/Unknown quality action/);
});
test('commit profile is insufficient for PR; hooks deny missing evidence and allow unrelated commands',async t=>{
 const f=await fixture(t);
 const invoke=command=>{const r=spawnSync(process.execPath,[hook.pathname],{input:JSON.stringify({cwd:f.project,hook_event_name:'PreToolUse',tool_input:{command}}),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout?JSON.parse(r.stdout):null;};
 assert.equal(invoke('git commit -m test').hookSpecificOutput.permissionDecision,'deny');assert.equal(invoke('git status'),null);
 await f.call('local-verify',{profile:'commit'});await f.call('quality-gate',{review:await f.review()});
 assert.equal(invoke('git commit -m test'),null);
 assert.equal(invoke('gh pr create --title test').hookSpecificOutput.permissionDecision,'deny');
 assert.equal(invoke('cd /tmp && git commit -m test').hookSpecificOutput.permissionDecision,'deny');
 assert.equal(invoke('git -C /tmp commit -m test').hookSpecificOutput.permissionDecision,'deny');
});
test('doctor reports absent tool scripts instead of claiming diagnostics passed',async t=>{
 const f=await fixture(t);delete f.pkg.scripts['quality:ci-config'];await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 const r=await f.call('doctor');assert.equal(r.status,'BLOCK');assert.equal(r.checks.find(c=>c.id==='ci-config').status,'BLOCK');
});
test('a malformed re-review invalidates an earlier passing report',async t=>{
 const f=await fixture(t);await f.call('local-verify');await f.call('quality-gate',{review:await f.review()});
 await assert.rejects(f.call('quality-gate',{review:{}}),/requires/);
 await assert.rejects(f.call('pre-pr-check'),/failed/);
 assert.equal(JSON.parse(await readFile(path.join(f.project,'reports/quality-gate.json'),'utf8')).status,'BLOCK');
});
test('quality lock is not stolen and command timeout blocks',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.project,'logs/.quality.lock'),'other operation');
 await assert.rejects(f.call('local-verify'),/already running/);
 assert.equal(await readFile(path.join(f.project,'logs/.quality.lock'),'utf8'),'other operation');
 await rm(path.join(f.project,'logs/.quality.lock'));
 const c=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));c.timeoutMs=20;
 await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(c));
 f.pkg.scripts.lint='node -e "setTimeout(()=>{},1000)"';await writeFile(path.join(f.project,'package.json'),JSON.stringify(f.pkg));
 const r=await f.call('local-verify');assert.equal(r.status,'BLOCK');assert.equal(r.checks[0].error,'ETIMEDOUT');
});

test('quality review configuration rejects workflow-only reviewer fields',async t=>{
 const f=await fixture(t);
 const file=path.join(f.project,'.instar-quality.json');
 const config=JSON.parse(await readFile(file,'utf8'));
 for(const review of [{requireIndependentReview:true},{allowMainAgentFallback:true}]){
  await writeFile(file,JSON.stringify({...config,review}));
  await assert.rejects(loadQualityConfig(f.project),/not supported/);
 }
});
test('CI check assessment blocks missing, pending and failed required checks',async()=>{
 const {assessChecks}=await import('../runtime/quality-controller/ci.mjs');
 assert.equal(assessChecks([{name:'Frontend checks',bucket:'pass',state:'SUCCESS'}],['Frontend checks','Security scan']).status,'BLOCK');
 assert.equal(assessChecks([{name:'Frontend checks',bucket:'pass',state:'SUCCESS'},{name:'Security scan',bucket:'pending',state:'IN_PROGRESS'}],['Frontend checks','Security scan']).status,'PENDING');
 assert.equal(assessChecks([{name:'Frontend checks',bucket:'pass',state:'SUCCESS'},{name:'Security scan',bucket:'fail',state:'FAILURE'}],['Frontend checks','Security scan']).status,'BLOCK');
});
test('accessibility template blocks empty routes instead of preserving a pass',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-a11y-'));t.after(()=>rm(project,{recursive:true,force:true}));
 const result=spawnSync(process.execPath,[path.resolve('templates/quality/a11y-check.mjs')],{cwd:project,encoding:'utf8',env:{...process.env,A11Y_ROUTES:' , '}});
 assert.equal(result.status,1);
 const report=JSON.parse(await readFile(path.join(project,'reports/accessibility.json'),'utf8'));
 assert.equal(report.status,'BLOCK');assert.match(report.error,/at least one route/);assert.equal(report.routesScanned,0);
});

test('keyboard template fails closed when journey evidence is missing or mismatched',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-keyboard-'));t.after(()=>rm(project,{recursive:true,force:true}));
 const result=spawnSync(process.execPath,[path.resolve('templates/quality/keyboard-check.mjs')],{cwd:project,encoding:'utf8',env:{...process.env,KEYBOARD_JOURNEYS:'[]'}});
 assert.equal(result.status,1);
 const report=JSON.parse(await readFile(path.join(project,'reports/keyboard.json'),'utf8'));
 assert.equal(report.kind,'keyboard');assert.equal(report.status,'BLOCK');assert.match(report.error,/route, keyboard steps/);
});

test('keyboard template writes BLOCK evidence when browser launch or context setup fails',async t=>{
 const project=await mkdtemp(path.join(os.tmpdir(),'instar-keyboard-browser-'));t.after(()=>rm(project,{recursive:true,force:true}));
 const script=path.join(project,'keyboard-check.mjs'),moduleDir=path.join(project,'node_modules/playwright');
 await writeFile(script,await readFile(path.resolve('templates/quality/keyboard-check.mjs'),'utf8'));
 await mkdir(moduleDir,{recursive:true});
 await writeFile(path.join(moduleDir,'package.json'),JSON.stringify({name:'playwright',type:'module',exports:'./index.mjs'}));
 const runTemplate=async source=>{
  await writeFile(path.join(moduleDir,'index.mjs'),source);
  const result=spawnSync(process.execPath,[script],{cwd:project,encoding:'utf8',env:{...process.env,KEYBOARD_JOURNEYS:'[{"route":"/","steps":["Tab"],"expectedFocus":"#search"}]'}});
  return {result,report:JSON.parse(await readFile(path.join(project,'reports/keyboard.json'),'utf8'))};
 };
 const launch=await runTemplate('export const chromium={launch:async()=>{throw new Error("browser unavailable")}};');
 assert.equal(launch.result.status,1);assert.equal(launch.report.status,'BLOCK');assert.match(launch.report.error,/browser launch failed/);assert.deepEqual(launch.report.journeys,[]);
 const context=await runTemplate('export const chromium={launch:async()=>({version:()=>"test",newContext:async()=>{throw new Error("context unavailable")},close:async()=>{}})};');
 assert.equal(context.result.status,1);assert.equal(context.report.status,'BLOCK');assert.match(context.report.error,/context setup failed/);assert.equal(context.report.browserVersion,'test');
});

test('quality review findings, unverified checks and unsafe context paths block',async t=>{
 const f=await fixture(t);await f.call('local-verify');const base=await f.review();
 const critical={...base,findings:[{severity:'critical',message:'Unsafe authorization path.'}]};
 assert.equal((await f.call('quality-gate',{review:critical})).status,'BLOCK');
 const warning={...base,findings:[{severity:'warning',message:'Missing error state.'}]};
 assert.equal((await f.call('quality-gate',{review:warning})).status,'BLOCK');
 const unverified={...base,unverified:['Keyboard flow not inspected']};
 assert.equal((await f.call('quality-gate',{review:unverified})).status,'BLOCK');
 const config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 for(const context of [{design:'.env.design.md'},{tokens:['.env.tokens.css']},{sessionState:'.context/PROJECT_STATE.md'}]){
  await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify({...config,context}));
  await assert.rejects(f.call('doctor'),/Invalid quality configuration|non-sensitive|\.instar\/session|context\.tokens/);
 }
});

test('schema 3 rejects absolute and parent-traversal command paths',async t=>{
 const f=await fixture(t),config=JSON.parse(await readFile(path.join(f.project,'.instar-quality.json'),'utf8'));
 config.schemaVersion=3;delete config.packageManager;config.tools={checks:{}};config.verification={profiles:{commit:['lint'],full:['lint']}};
 for(const command of ['/bin/sh','../bin/lint','tools/../../lint']){
  config.tools.checks={lint:{kind:'lint',command,args:[]}};await writeFile(path.join(f.project,'.instar-quality.json'),JSON.stringify(config));
  await assert.rejects(f.call('engineering-verify',{profile:'commit'}),/Invalid tools\.checks\.lint/);
 }
});
