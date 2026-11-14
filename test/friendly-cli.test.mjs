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
    assert.equal((await parseFriendlyArgs(['verify','--profile','preflight'],project)).profile,'preflight');
    assert.equal((await parseFriendlyArgs(['verify','--profile','commit'],project)).profile,'preflight');
  } finally {await rm(project,{recursive:true,force:true});}
});

test('review CLI reads either a direct review object or a wrapped review object',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'instar-review-'));
  try {
    const review={reviewer:'reviewer',fingerprint:'abc',checks:[]};
    const file=path.join(dir,'review.json');
    await writeFile(file,JSON.stringify({review}));
    assert.deepEqual((await parseFriendlyArgs(['review','--review-file','review.json'],dir)).review,review);
    await writeFile(file,JSON.stringify(review));
    assert.deepEqual((await parseFriendlyArgs(['review','--review-file','review.json'],dir)).review,review);
  } finally {await rm(dir,{recursive:true,force:true});}
});


test('friendly CLI rejects ignored flags and missing values',async()=>{
  await assert.rejects(parseFriendlyArgs(['verify','--json']),/Unknown option/);
  await assert.rejects(parseFriendlyArgs(['verify','--confirm']),/Unknown option/);
  assert.equal(await parseFriendlyArgs(['init','--project']),null);
});
