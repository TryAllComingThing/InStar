import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseFriendlyArgs} from '../src/quality-controller/friendly-cli.mjs';

test('friendly CLI parses quality commands and verify profiles',async()=>{
  const project=await mkdtemp(path.join(tmpdir(),'instar-friendly-'));
  try {
    assert.equal(await parseFriendlyArgs(['init','--scaffold','--project',project],'/tmp'),null);
    assert.equal(await parseFriendlyArgs(['adopt','--project','.'],project),null);
    assert.deepEqual(await parseFriendlyArgs(['snapshot','--project','.'],project),{action:'snapshot',project});
    assert.equal((await parseFriendlyArgs(['verify','--profile','commit'],project)).profile,'commit');
    assert.equal((await parseFriendlyArgs(['verify','--profile','full','--risk','L2'],project)).riskLevel,'L2');
  } finally {await rm(project,{recursive:true,force:true});}
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
  } finally {await rm(dir,{recursive:true,force:true});}
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
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('friendly CLI rejects ignored flags, missing values, and conflicting PR bodies',async()=>{
  await assert.rejects(parseFriendlyArgs(['verify','--json']),/Unknown option/);
  await assert.rejects(parseFriendlyArgs(['verify','--confirm']),/not supported by verify/);
  assert.equal(await parseFriendlyArgs(['init','--project']),null);
  await assert.rejects(parseFriendlyArgs(['ci','prepare','--title','demo','--body','a','--body-file','body.md']),/Choose only one/);
});
