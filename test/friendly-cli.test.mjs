import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseFriendlyArgs} from '../src/quality-controller/friendly-cli.mjs';

test('friendly CLI parses quality commands and verify profiles',async()=>{
  const project=await mkdtemp(path.join(tmpdir(),'instar-friendly-'));
  try {
    assert.deepEqual(await parseFriendlyArgs(['snapshot','--project','.'],project),{action:'snapshot',project});
    assert.equal((await parseFriendlyArgs(['verify','--profile','commit'],project)).profile,'commit');
    assert.equal((await parseFriendlyArgs(['verify','--profile','full','--risk','L2'],project)).riskLevel,'L2');
    const status=await parseFriendlyArgs(['status','--change','add-search'],project);assert.equal(status.action,'workspace-status');assert.equal(status.changeId,'add-search');
    assert.equal((await parseFriendlyArgs(['next'],project)).action,'workspace-next');
    assert.equal((await parseFriendlyArgs(['help'],project)).action,'help');
  } finally {await rm(project,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
});

test('review CLI reads either a direct review object or a wrapped review object',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'instar-review-'));
  try {
    const review={reviewer:'reviewer',fingerprint:'abc',checks:[]};
    const file=path.join(dir,'review.json');
    await writeFile(file,JSON.stringify({review}));
    assert.deepEqual((await parseFriendlyArgs(['review','--review-file','review.json'],dir)).review,review);
    assert.equal((await parseFriendlyArgs(['review','--review-file','review.json','--risk','L2'],dir)).riskLevel,'L2');
    await writeFile(file,JSON.stringify(review));
    assert.deepEqual((await parseFriendlyArgs(['review','--review-file','review.json'],dir)).review,review);
  } finally {await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
});

test('review CLI creates a repair request without reading or inventing review evidence',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'instar-review-template-'));
  try {
    const init=await parseFriendlyArgs(['review','init','--reviewer','team-member'],dir);
    assert.equal(init.action,'quality-review-init');assert.equal(init.outputPath,'reports/review.json');assert.equal(init.reviewer,'team-member');
    const custom=await parseFriendlyArgs(['review','init','--output','reports/custom.json','--risk','L2'],dir);
    assert.equal(custom.outputPath,'reports/custom.json');assert.equal(custom.riskLevel,'L2');
    const forced=await parseFriendlyArgs(['review','init','--force'],dir);assert.equal(forced.force,true);
    const repair=await parseFriendlyArgs(['review','repair','--review-file','reports/review.json'],dir);
    assert.equal(repair.action,'quality-review-repair');assert.equal(repair.reviewFile,'reports/review.json');
    await assert.rejects(parseFriendlyArgs(['review','repair'],dir),/requires --review-file/);
    await assert.rejects(parseFriendlyArgs(['review','init','--output','reports/review.json','--review-file','old.json'],dir),/not supported by review/);
  } finally {await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
});

test('CI CLI requires a phase and explicit publish confirmation',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'instar-ci-'));
  try {
    const prepare=await parseFriendlyArgs(['ci','prepare','--title','feat: demo'],dir);
    assert.equal(prepare.phase,'prepare');assert.equal(prepare.title,'feat: demo');assert.equal(prepare.authorization,undefined);
    assert.equal((await parseFriendlyArgs(['ci','status'],dir)).phase,'status');
    await assert.rejects(parseFriendlyArgs(['ci','publish','--title','feat: demo'],dir),/requires --confirm/);
    const publish=await parseFriendlyArgs(['ci','publish','--title','feat: demo','--confirm'],dir);
    assert.equal(publish.authorization,'User explicitly confirmed via InStar CLI');
  } finally {await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
});

test('friendly CLI rejects ignored flags, missing values, and conflicting PR bodies',async()=>{
  await assert.rejects(parseFriendlyArgs(['verify','--json']),/Unknown option/);
  await assert.rejects(parseFriendlyArgs(['verify','--confirm']),/not supported by verify/);
  assert.equal(await parseFriendlyArgs(['init','--project']),null);
  await assert.rejects(parseFriendlyArgs(['ci','prepare','--title','demo','--body','a','--body-file','body.md']),/Choose only one/);
});
