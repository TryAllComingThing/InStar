import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// npm.cmd is a shell script on Windows. Execute npm's JS entry directly instead.
export function runNpm(args,options){
 if(process.platform!=='win32')return spawnSync('npm',args,options);
 const nodeDir=path.dirname(realpathSync(process.execPath));
 const candidates=[path.join(nodeDir,'node_modules/npm/bin/npm-cli.js')];
 for(const dir of (process.env.PATH||'').split(path.delimiter))candidates.push(path.join(dir,'node_modules/npm/bin/npm-cli.js'));
 const cli=candidates.find(existsSync);
 if(!cli)return {status:null,signal:null,error:Object.assign(new Error('npm CLI not found'),{code:'ENOENT'}),stdout:'',stderr:''};
 return spawnSync(process.execPath,[cli,...args],options);
}
export function validExecutable(command){
 return typeof command==='string'&&command.length>0&&command.length<=256&&!/[\0\r\n]/.test(command)&&
  (path.isAbsolute(command)||/^[-\w./]+$/.test(command));
}
