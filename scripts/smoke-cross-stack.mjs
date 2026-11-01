import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {run,reviewItems,reviewItemsFor} from '../runtime/quality-controller/index.mjs';

const temp=await mkdtemp(path.join(tmpdir(),'instar-cross-stack-'));
const projects=[];
const git=(project,...args)=>{const result=spawnSync('git',args,{cwd:project,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
const call=(project,action,input={})=>run({action,project,...input});
const evidenceFor=(project,review,snapshot)=>({
 reviewer:`${review}-fixture-reviewer`,
 riskLevel:'L2',
 fingerprint:snapshot.fingerprint,
 checks:reviewItemsFor(review==='python'?{review:{language:'python',framework:'none'}}:{review:{language:'typescript',framework:'vue'}}).map(id=>({
   id,status:'PASS',evidence:{type:'source',path:review==='python'?'app.py':'src/App.vue',line:1,excerpt:review==='python'?'def answer(value):':'<template><main>Orders</main></template>',note:`Reviewed ${id} for the ${review} fixture.`,snapshotFingerprint:snapshot.fingerprint}
 }))
});

async function createGitProject(name){
 const project=await mkdtemp(path.join(temp,`${name}-`));projects.push(project);
 git(project,'init','-b','main');git(project,'config','user.email','instar-cross-stack@example.invalid');git(project,'config','user.name','InStar cross-stack validation');
 await writeFile(path.join(project,'.gitignore'),'reports/\nlogs/\n__pycache__/\n');
 return project;
}

async function validatePython(){
 const project=await createGitProject('python');
 await writeFile(path.join(project,'app.py'),'def answer(value):\n    return value + 1\n');
 await writeFile(path.join(project,'test_app.py'),'from app import answer\nassert answer(1) == 2\n');
 await writeFile(path.join(project,'.instar-quality.json'),JSON.stringify({
   schemaVersion:3,baseRef:'main',review:{language:'python',framework:'none'},
   verification:{profiles:{commit:['lint','typecheck'],full:['lint','typecheck','test','build','dependencies','security']}},
   tools:{checks:{
     lint:{command:'python3',args:['-m','py_compile','app.py']},
     typecheck:{command:'python3',args:['-c','import ast; ast.parse(open("app.py").read())']},
     test:{command:'python3',args:['test_app.py']},
     build:{command:'python3',args:['-c','compile(open("app.py").read(),"app.py","exec")']},
     dependencies:{command:'python3',args:['-c','import sys; sys.exit(0)']},
     security:{command:'python3',args:['-c','source=open("app.py").read(); raise SystemExit(1 if "eval(" in source else 0)']}
   }},
   qualityPolicy:{schemaVersion:1,profiles:{
     commit:[{category:'Q-01',checkId:'lint'},{category:'Q-02',checkId:'typecheck'},{category:'Q-07',checkId:'evidence-report'}],
     full:[{category:'Q-01',checkId:'lint'},{category:'Q-02',checkId:'typecheck'},{category:'Q-03',checkId:'test'},{category:'Q-04',checkId:'build'},{category:'Q-05',checkId:'dependencies'},{category:'Q-06',checkId:'security'},{category:'Q-07',checkId:'evidence-report'}]
   }},
   riskPolicy:{l3:{requiredReviewRoles:['security'],requireHumanApproval:true}}
 }),null,2);
 git(project,'add','.');git(project,'commit','-m','python baseline');git(project,'checkout','-b','feature/python-validation');
 const doctor=await call(project,'doctor');assert.equal(doctor.status,'PASS');
 const verification=await call(project,'engineering-verify',{profile:'full',riskLevel:'L2'});assert.equal(verification.status,'PASS');
 const snapshot=await call(project,'snapshot');const review=evidenceFor(project,'python',snapshot);
 const gate=await call(project,'quality-gate',{review,riskLevel:'L2'});assert.equal(gate.status,'PASS');
 const provenance=await call(project,'ai-provenance',{aiGenerated:false,sessionId:'python-validation',summary:'Python local validation completed.'});assert.equal(provenance.status,'PASS');
 const prePr=await call(project,'pre-pr-check');assert.equal(prePr.status,'PASS');
 return {stack:'Python',doctor:doctor.status,verify:verification.status,review:gate.status,provenance:provenance.status,prePr:prePr.status,reviewItems:review.checks.length,remoteCi:'not-configured'};
}

async function validateVue(){
 const project=await createGitProject('vue');
 await mkdir(path.join(project,'src'));
 await writeFile(path.join(project,'src/App.vue'),'<template><main>Orders</main></template>\n');
 const scripts=Object.fromEntries(['lint','typecheck','test','build','quality:dependencies','quality:vite-build'].map(name=>[name,'node -e "process.exit(0)"']));
 await writeFile(path.join(project,'package.json'),JSON.stringify({scripts},null,2));
 await writeFile(path.join(project,'package-lock.json'),JSON.stringify({name:'vue-validation-fixture',version:'1.0.0',lockfileVersion:3,packages:{'':{name:'vue-validation-fixture',version:'1.0.0'}}},null,2));
 await mkdir(path.join(project,'node_modules'));
 await writeFile(path.join(project,'.instar-quality.json'),JSON.stringify({
   schemaVersion:2,packageManager:'npm',baseRef:'main',review:{language:'typescript',framework:'vue'},
   qualityPolicy:{schemaVersion:1,profiles:{
     commit:[{category:'Q-01',checkId:'lint'},{category:'Q-02',checkId:'typecheck'},{category:'Q-05',checkId:'dependencies'},{category:'Q-07',checkId:'evidence-report'}],
     full:[{category:'Q-01',checkId:'lint'},{category:'Q-02',checkId:'typecheck'},{category:'Q-03',checkId:'test'},{category:'Q-04',checkId:'build'},{category:'Q-05',checkId:'dependencies'},{category:'Q-06',checkId:'vite-build'},{category:'Q-07',checkId:'evidence-report'}]
   }},
   tools:{dependencies:'quality:dependencies','vite-build':'quality:vite-build'},
   riskPolicy:{l3:{requiredReviewRoles:['frontend'],requireHumanApproval:true}}
 }),null,2);
 git(project,'add','.');git(project,'commit','-m','vue baseline');git(project,'checkout','-b','feature/vue-validation');
 const doctor=await call(project,'doctor');assert.equal(doctor.status,'PASS');
 const verification=await call(project,'frontend-verify',{profile:'full',riskLevel:'L2'});assert.equal(verification.status,'PASS');
 const snapshot=await call(project,'snapshot');const review=evidenceFor(project,'vue',snapshot);
 const gate=await call(project,'quality-gate',{review,riskLevel:'L2'});assert.equal(gate.status,'PASS');
 const provenance=await call(project,'ai-provenance',{aiGenerated:false,sessionId:'vue-validation',summary:'Vue local validation completed.'});assert.equal(provenance.status,'PASS');
 const prePr=await call(project,'pre-pr-check');assert.equal(prePr.status,'PASS');
 return {stack:'Vue',doctor:doctor.status,verify:verification.status,review:gate.status,provenance:provenance.status,prePr:prePr.status,reviewItems:review.checks.length,remoteCi:'not-configured'};
}

try {
 const results=[await validatePython(),await validateVue()];
 assert.equal(results[0].reviewItems,14);
 assert.equal(results[1].reviewItems,17);
 console.log(JSON.stringify({status:'PASS',results},null,2));
} finally {
 await rm(temp,{recursive:true,force:true});
}
