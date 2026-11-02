import test from 'node:test';
import assert from 'node:assert/strict';
import {runNpm,validExecutable} from '../src/shared/process-runner.mjs';
test('npm runs without shell and accepts native executable paths',()=>{
 assert.equal(validExecutable(process.execPath),true);
 assert.equal(validExecutable('node\nmalicious'),false);
 assert.equal(validExecutable('node && echo bad'),false);
 const result=runNpm(['--version'],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.error?.message||result.stderr);
 assert.match(result.stdout,/\d+\.\d+/);
});
