import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceSnapshot,diffSourceSnapshots,describeSnapshotDrift} from '../runtime/shared/source-snapshot.mjs';
import {run as qualityRun} from '../runtime/quality-controller/index.mjs';
import {symlinkAvailable} from './symlink-support.mjs';

async function project(t){const root=await mkdtemp(path.join(os.tmpdir(),'instar-source-snapshot-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));return root;}

test('source snapshot recursively excludes dependencies, build outputs, caches and OS metadata',async t=>{
 const root=await project(t);
 await mkdir(path.join(root,'src'),{recursive:true});
 await writeFile(path.join(root,'src/app.js'),'export const value=1;');
 await writeFile(path.join(root,'.DS_Store'),'metadata');
 await mkdir(path.join(root,'frontend/node_modules/pkg'),{recursive:true});
 await writeFile(path.join(root,'frontend/node_modules/pkg/index.js'),'generated dependency');
 await mkdir(path.join(root,'frontend/dist'),{recursive:true});
 await writeFile(path.join(root,'frontend/dist/app.js'),'generated build');
 await mkdir(path.join(root,'src/__pycache__'),{recursive:true});
 await writeFile(path.join(root,'src/__pycache__/app.pyc'),'cache');
 await mkdir(path.join(root,'.pytest_cache'),{recursive:true});
 await writeFile(path.join(root,'.pytest_cache/state'),'cache');
 await mkdir(path.join(root,'backend/pkg.egg-info'),{recursive:true});
 await writeFile(path.join(root,'backend/pkg.egg-info/PKG-INFO'),'metadata');
 if(await symlinkAvailable(t)){
  await mkdir(path.join(root,'.venv/bin'),{recursive:true});
  await symlink(process.execPath,path.join(root,'.venv/bin/python'));
 }
 const first=await sourceSnapshot(root);
 assert.deepEqual(first.manifest.map(item=>item.path),['src/app.js']);
 await writeFile(path.join(root,'frontend/dist/another.js'),'more generated output');
 await writeFile(path.join(root,'src/__pycache__/other.pyc'),'cache');
 const second=await sourceSnapshot(root);
 assert.equal(second.treeHash,first.treeHash);
 await writeFile(path.join(root,'src/app.js'),'export const value=2;');
 const third=await sourceSnapshot(root);
 const diff=diffSourceSnapshots(second,third);
 assert.equal(diff.changes.length,1);
 assert.deepEqual(diff.changes[0],{path:'src/app.js',change:'modified',kind:'source'});
 assert.match(describeSnapshotDrift(second,third),/src\/app\.js/);
});

test('tracked source files inside build-like directories remain reviewable',async t=>{
 const root=await project(t);const git=(...args)=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','InStar test');
 await mkdir(path.join(root,'build'),{recursive:true});await mkdir(path.join(root,'src'),{recursive:true});
 await writeFile(path.join(root,'build/legacy.js'),'export const legacy=1;');
 await writeFile(path.join(root,'build/generated.js'),'generated later');
 await writeFile(path.join(root,'src/app.js'),'export const app=1;');
 git('add','src/app.js','build/legacy.js');git('commit','-m','source baseline');
 const snapshot=await sourceSnapshot(root);
 assert.deepEqual(snapshot.manifest.map(item=>item.path),['build/legacy.js','src/app.js']);
});

test('status and next report the legal workflow action without taking a lock',async t=>{
 const root=await project(t);await mkdir(path.join(root,'planning/workflows'),{recursive:true});await mkdir(path.join(root,'planning/changes/demo'),{recursive:true});
 await writeFile(path.join(root,'src.js'),'export const value=1;');
 const source=await sourceSnapshot(root);
 await writeFile(path.join(root,'planning/changes/demo/tasks.md'),'- [x] 1.1 Build; acceptance: done.');
 await writeFile(path.join(root,'planning/workflows/demo.json'),JSON.stringify({changeId:'demo',stage:'verification',status:'in-progress',version:7,pendingApproval:null,qualityReview:{reportId:'review',status:'PASS',snapshotFingerprint:'fingerprint',sourceSnapshot:source},taskEvidence:{}}));
 const status=await qualityRun({action:'workspace-status',project:root});
 assert.equal(status.change.stage,'verification');assert.equal(status.quality.stale,false);assert.equal(status.next.action,'submit-verification');assert.equal(status.next.request.expectedVersion,7);
 const next=await qualityRun({action:'workspace-next',project:root,changeId:'demo'});assert.equal(next.next.request.action,'submit-verification');
 await writeFile(path.join(root,'planning/workflows/demo.json'),JSON.stringify({changeId:'demo',stage:'verification',status:'blocked',version:8,pendingApproval:null,qualityReview:{reportId:'review',status:'PASS',snapshotFingerprint:'fingerprint',sourceSnapshot:source},verification:{at:'2026-01-01T00:00:00.000Z',report:{status:'FAIL',issues:[],unverified:[]},checks:[{name:'tests',kind:'test',outcome:'failed',applicable:true}],sourceSnapshot:source},taskEvidence:{}}));
 const blocked=await qualityRun({action:'workspace-next',project:root,changeId:'demo'});
 assert.equal(blocked.next.action,'submit-verification');assert.equal(blocked.next.request.action,'submit-verification');assert.equal(blocked.next.request.expectedVersion,8);
});

test('help runs without treating the plugin installation as a project',async()=>{
 const pluginRoot=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
 const help=await qualityRun({action:'help',project:pluginRoot});
 assert.equal(help.status,'PASS');
 assert(help.commands.some(item=>item.command.startsWith('instar status')));
});
