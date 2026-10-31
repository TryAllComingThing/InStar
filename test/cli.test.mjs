import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {MAX_JSON_INPUT_BYTES,readBoundedFile,readBoundedStdin} from '../runtime/shared/bounded-input.mjs';
const cli=fileURLToPath(new URL('../runtime/workflow-controller/cli.mjs',import.meta.url));
function invoke(args,input){return spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8'});}
test('CLI reports usage and malformed JSON as JSON errors with nonzero exit',()=>{
 for(const [args,input] of [[[],undefined],[['-'],'{broken']]){
  const result=invoke(args,input);
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.equal(typeof JSON.parse(result.stderr).error,'string');
 }
});
test('CLI accepts request files and stdin; preview leaves the project untouched',async t=>{
 const temp=await mkdtemp(path.join(tmpdir(),'instar-cli-'));
 t.after(()=>rm(temp,{recursive:true,force:true}));
 const request=path.join(temp,'request.json');
 await writeFile(request,JSON.stringify({action:'initialize',project:temp,preview:true}));
 const preview=invoke([request]);
 assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).preview,true);
 assert.deepEqual(await readdir(temp),['request.json']);
 const initialized=invoke(['-'],JSON.stringify({action:'initialize',project:temp}));
 assert.equal(initialized.status,0,initialized.stderr);assert.ok(JSON.parse(initialized.stdout).created.length);
 const repeated=invoke(['-'],JSON.stringify({action:'initialize',project:temp}));
 assert.equal(repeated.status,0,repeated.stderr);assert.deepEqual(JSON.parse(repeated.stdout).created,[]);
});
test('shared CLI readers stop after the configured byte limit',async t=>{
 const temp=await mkdtemp(path.join(tmpdir(),'instar-bounded-'));
 t.after(()=>rm(temp,{recursive:true,force:true}));
 const file=path.join(temp,'oversized.json');
 await writeFile(file,Buffer.alloc(MAX_JSON_INPUT_BYTES+1,0x20));
 await assert.rejects(readBoundedFile(file),/Input exceeds 8388608 byte limit/);
 await assert.rejects(readBoundedStdin(Readable.from([Buffer.alloc(MAX_JSON_INPUT_BYTES),Buffer.from('x')])),/Input exceeds 8388608 byte limit/);
});
