import {mkdtemp,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
let supported;
export async function symlinkAvailable(t){
 if(supported===undefined){
  const dir=await mkdtemp(path.join(os.tmpdir(),'instar-symlink-probe-'));
  try{await symlink(dir,path.join(dir,'link'));supported=true;}
  catch(error){if(!['EPERM','EACCES','ENOSYS'].includes(error.code))throw error;supported=false;}
  finally{await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
 }
 if(!supported)t.skip('Symbolic links unavailable; run security coverage on a symlink-capable CI worker');
 return supported;
}
