import {fs,safe,exists,read,assertTree} from './files.mjs';

export async function treeSize(root,relative){
 const result={bytes:0,files:0};if(!await exists(safe(root,relative)))return result;
 const {assertTarget}=await import('./write-set.mjs');await assertTarget(root,relative);
 const stat=await fs.lstat(safe(root,relative));if(stat.isFile())return {bytes:stat.size,files:1};
 await assertTree(root,relative);
 async function walk(dir){for(const entry of await fs.readdir(safe(root,dir),{withFileTypes:true})){const name=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(name);else{result.files++;result.bytes+=(await fs.lstat(safe(root,name))).size;}}}
 await walk(relative);return result;
}
export async function backupBudget(root,paths=['planning','docs/prd']){
 let options={};try{options=JSON.parse(await read(root,'.instar-quality.json')).workflowRecovery||{};}catch(e){if(e.code!=='ENOENT')throw e;}
 const maxBytes=options.maxBackupBytes??256*1024*1024,maxFiles=options.maxBackupFiles??50000;
 if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>1024*1024*1024||!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>100000)throw Error('Invalid workflowRecovery budget');
 const sizes=await Promise.all(paths.map(p=>treeSize(root,p)));
 if(sizes.reduce((n,s)=>n+s.bytes,0)>maxBytes||sizes.reduce((n,s)=>n+s.files,0)>maxFiles)throw Error('Workflow recovery backup budget exceeded; inspect recovery-status and project history before retrying');
}
export async function recoveryStore(root,input){
 const parent='.workflow/transactions',entries=[];
 if(await exists(safe(root,parent))){await assertTree(root,parent);for(const id of await fs.readdir(safe(root,parent))){if(!/^[a-f0-9-]{36}$/.test(id))continue;let record;try{record=JSON.parse(await read(root,`${parent}/${id}/result.json`));}catch(e){if(e.code!=='ENOENT')throw e;}
  entries.push({id,...await treeSize(root,`${parent}/${id}`),status:record?.status||'incomplete'});
 }}
 if(input.action==='recovery-status')return {entries,totalBytes:entries.reduce((n,e)=>n+e.bytes,0),note:'No automatic deletion; preserve incomplete and pending recovery journals'};
 if(await exists(safe(root,'.workflow/pending.json')))throw Error('Cannot prune while recovery is pending');
 if(!Array.isArray(input.ids)||input.ids.some(id=>!entries.some(e=>e.id===id&&['committed','rolled-back','recovered'].includes(e.status))))throw Error('Select completed recovery IDs from recovery-status');
 const selected=entries.filter(e=>input.ids.includes(e.id));
 if(input.preview!==false)return {status:'PREVIEW',selected};
 if(input.confirm!==true)throw Error('Recovery cleanup requires explicit confirmation');
 for(const entry of selected){await assertTree(root,`${parent}/${entry.id}`);await fs.rm(safe(root,parent,entry.id),{recursive:true,force:true});}
 return {status:'PASS',removed:selected.map(e=>e.id)};
}
