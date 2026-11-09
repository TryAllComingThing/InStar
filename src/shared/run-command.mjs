import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';

const DEFAULT_MAX_OUTPUT=4*1024*1024;
const KILL_GRACE_MS=150;
const WINDOWS_SHELL_METACHARACTERS=/["%!\r\n\0]/;

export function windowsCommandPlan(command,args){
 const extension=path.win32.extname(command).toLowerCase();
 if(extension && extension!=='.cmd' && extension!=='.bat')return {command,args,shell:false};
 const parts=[command,...args];
 if(parts.some(value=>WINDOWS_SHELL_METACHARACTERS.test(value)))throw Object.assign(Error('Windows command or arguments contain unsupported shell metacharacters'),{code:'EINVAL'});
 // `npm` and other Windows shims are `.cmd` files. Quote every part ourselves
 // before enabling Node's shell shim; the metacharacter check above prevents
 // command injection. Quality commands must remain single invocations.
 return {command:parts.map(value=>`"${value}"`).join(' '),args:[],shell:true};
}

function killTree(child){
 if(!child.pid)return;
 if(process.platform==='win32'){
  spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});
  return;
 }
 try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
 setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}},KILL_GRACE_MS).unref();
}

/** Run a project command without a shell and terminate its whole process group on timeout. */
export function runCommand(command,args,{cwd,env,timeoutMs,maxOutputBytes=DEFAULT_MAX_OUTPUT}={}){
 return new Promise(resolve=>{
  let child;
  try{
   const launch=process.platform==='win32'?windowsCommandPlan(command,args):{command,args,shell:false};
   child=spawn(launch.command,launch.args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true,shell:launch.shell===true});
  }catch(error){resolve({status:null,signal:null,error,stdout:'',stderr:''});return;}
  const stdout=[],stderr=[];let outputBytes=0,timedOut=false,settled=false,timer,forceTimer;
  const collect=(items,chunk)=>{
   const remaining=maxOutputBytes-outputBytes;
   if(remaining<=0)return;
   const part=chunk.subarray(0,remaining);items.push(part);outputBytes+=part.length;
  };
  child.stdout.on('data',chunk=>collect(stdout,chunk));
  child.stderr.on('data',chunk=>collect(stderr,chunk));
  const finish=(status,signal,error)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);clearTimeout(forceTimer);
   if(timedOut&&!error)error={code:'ETIMEDOUT'};
   resolve({status:status??null,signal:signal??null,error,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});
  };
  child.on('error',error=>finish(null,null,error));
  child.on('close',(status,signal)=>finish(status,signal));
  timer=setTimeout(()=>{
   timedOut=true;
   try{killTree(child);}catch(error){finish(null,null,error);return;}
   forceTimer=setTimeout(()=>finish(null,null,{code:'ETIMEDOUT'}),KILL_GRACE_MS+750);
  },timeoutMs);
 });
}
