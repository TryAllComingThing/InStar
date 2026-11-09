import assert from 'node:assert/strict';
import {access,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {runCommand} from '../src/shared/run-command.mjs';

if(process.platform!=='win32'){
 console.log('SKIP: Windows command smoke requires win32.');
 process.exit(0);
}

const root=await mkdtemp(path.join(tmpdir(),'instar-windows-'));
try{
 await writeFile(path.join(root,'pass.cmd'),'@echo off\r\nexit /b 0\r\n');
 let result=await runCommand(path.join(root,'pass.cmd'),[],{cwd:root,timeoutMs:10000});
 assert.equal(result.error,null,result.error?.message);assert.equal(result.status,0);

 await writeFile(path.join(root,'fail.cmd'),'@echo off\r\nexit /b 7\r\n');
 result=await runCommand(path.join(root,'fail.cmd'),[],{cwd:root,timeoutMs:10000});
 assert.equal(result.status,7);

 result=await runCommand(process.execPath,['-e','process.exit(0)'],{cwd:root,timeoutMs:10000});
 assert.equal(result.error,null,result.error?.message);assert.equal(result.status,0);

 result=await runCommand('npm',['--version'],{cwd:root,timeoutMs:30000});
 assert.equal(result.error,null,result.error?.message);assert.equal(result.status,0);
 assert.match(result.stdout.trim(),/^\d+\.\d+\.\d+/);

 result=await runCommand(path.join(root,'pass.cmd'),['%PATH%'],{cwd:root,timeoutMs:10000});
 assert.equal(result.error?.code,'EINVAL');

 const marker=path.join(root,'descendant.txt');
 await writeFile(path.join(root,'tree.cmd'),`@echo off\r\nstart "" /b "${process.execPath}" -e "setTimeout(()=>require('fs').writeFileSync(process.env.INSTAR_WINDOWS_MARKER,'leak'),400)"\r\nping -n 6 127.0.0.1 >nul\r\n`);
 result=await runCommand(path.join(root,'tree.cmd'),[],{cwd:root,timeoutMs:100,env:{...process.env,INSTAR_WINDOWS_MARKER:marker}});
 assert.equal(result.error?.code,'ETIMEDOUT');
 await new Promise(resolve=>setTimeout(resolve,900));
 await assert.rejects(access(marker),{code:'ENOENT'});

 console.log('PASS: Windows .cmd launch, npm shim, metacharacter rejection and process-tree timeout.');
}finally{
 await rm(root,{recursive:true,force:true});
}
