import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const baselineFile='docs/project-baseline/rules.json';
const digest=text=>createHash('sha256').update(text).digest('hex');
const text=v=>typeof v==='string'&&v.trim();
export async function readProjectFile(root,relative){
 if(!text(relative)||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid baseline path');
 let current=path.resolve(root);
 const parts=relative.split('/');
 for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);const s=await fs.lstat(current);if(s.isSymbolicLink())throw Error('Baseline symlinks are not allowed');if(i<parts.length-1?!s.isDirectory():!s.isFile())throw Error('Baseline source must be a regular file with directory parents');}
 const handle=await fs.open(current,'r');
 try{const stat=await handle.stat();if(!stat.isFile()||stat.size>512*1024)throw Error('Invalid or oversized baseline source');return await handle.readFile('utf8');}finally{await handle.close();}
}
const read=readProjectFile;
export function validateRegistry(data){
 if(data?.schemaVersion!==1||!Array.isArray(data.rules)||data.rules.length>500)throw Error('Invalid baseline registry');
 const ids=new Set();
 for(const r of data.rules){
  if(!/^[A-Z]+-\d{3,}$/.test(r.id)||ids.has(r.id)||!text(r.statement)||!Array.isArray(r.scope)||!r.scope.length||r.scope.some(p=>!text(p)||p.includes('..')||p.startsWith('/')||p.includes('\\'))||!['observed','proposed','adopted','conflict','deprecated'].includes(r.status)||!text(r.document))throw Error('Invalid baseline rule');
  ids.add(r.id);
  if(r.status==='adopted'&&(!text(r.approval?.by)||!text(r.approval?.reason)||!text(r.approval?.at)))throw Error('Adopted rule requires approval metadata');
 }
 return data;
}
export function matches(pattern,file){
 let regex='';for(let i=0;i<pattern.length;i++){
  if(pattern[i]==='*'){if(pattern[i+1]==='*'){i++;if(pattern[i+1]==='/'){i++;regex+='(?:.*/)?';}else regex+='.*';}else regex+='[^/]*';}
  else regex+=pattern[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 }
 return new RegExp(`^${regex}$`).test(file.replaceAll('\\','/'));
}
export async function baselineContext(root,paths=[]){
 let raw;try{raw=await read(root,baselineFile);}catch(e){if(e.code==='ENOENT')return {present:false,fingerprint:null,rules:[],documents:{}};throw e;}
 const data=validateRegistry(JSON.parse(raw));
 const documents={};
 const rules=data.rules.filter(r=>!paths.length||r.scope.some(p=>paths.some(f=>matches(p,f))));
 const hashes={};for(const name of [...new Set(rules.map(r=>r.document))].sort())hashes[name]=digest(await read(root,name));
 for(const name of [...new Set(rules.map(r=>r.document))])documents[name]={fingerprint:hashes[name],load:'Read this file only when its rules apply; body intentionally omitted'};
 return {present:true,fingerprint:digest(JSON.stringify({rules,hashes})),rules,documents};
}
export function validateRuleReferences(baseline,references){
 if(!baseline.present)return;
 if(!Array.isArray(references))throw Error('Baseline ruleReferences required');
 const seen=new Set();for(const ref of references){if(seen.has(ref.id)||!baseline.rules.some(r=>r.id===ref.id)||!text(ref.evidence)||!['PASS','BLOCK','WARN','NA'].includes(ref.status))throw Error('Invalid baseline rule reference');seen.add(ref.id);}
 for(const rule of baseline.rules.filter(r=>r.status==='adopted'))if(!seen.has(rule.id))throw Error(`Missing adopted rule reference: ${rule.id}`);
 if(references.some(r=>r.status==='BLOCK'))throw Error('Baseline rule review blocked');
}
export async function adoptRules(root,input){
 if(input.confirm!==true||!text(input.by)||!text(input.reason)||!Array.isArray(input.ids)||!input.ids.length)throw Error('Explicit baseline adoption confirmation, by, reason and ids required');
 const before=await baselineContext(root);if(input.fingerprint!==before.fingerprint)throw Error('Baseline adoption is stale');
 const data=validateRegistry(JSON.parse(await read(root,baselineFile)));
 for(const id of input.ids){const r=data.rules.find(r=>r.id===id);if(!r||!['observed','proposed'].includes(r.status))throw Error('Only observed/proposed rules can be adopted');r.status='adopted';r.approval={by:input.by,reason:input.reason,at:new Date().toISOString()};}
 const file=path.join(root,baselineFile),temp=`${file}.${process.pid}.tmp`;
 await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 try{if((await baselineContext(root)).fingerprint!==before.fingerprint)throw Error('Baseline changed during adoption');await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}
 return baselineContext(root);
}
export async function baselineCheck(root){
 const context=await baselineContext(root),checks=[];
 if(!context.present)return {status:'INFO',checks:[{status:'INFO',reason:'No baseline registry'}]};
 for(const rule of context.rules){
  const doc=await read(root,rule.document);
  checks.push({id:rule.id,status:doc.includes(rule.id)?'PASS':'BLOCK',reason:'Rule ID in domain document'});
  if(rule.evidence){
   const evidence=JSON.parse(await read(root,rule.evidence));
   const found=evidence.findings?.find(f=>f.id===rule.id);
   checks.push({id:rule.id,status:found?.status===rule.status?'PASS':'BLOCK',reason:'Evidence ID/status mapping'});
   for(const source of found?.sources||[]){
    const content=await read(root,source.path),lines=content.split(/\r?\n/);
    const valid=Number.isInteger(source.startLine)&&Number.isInteger(source.endLine)&&source.startLine>0&&source.endLine>=source.startLine&&source.endLine<=lines.length&&typeof source.excerpt==='string'&&source.excerpt.trim()&&lines.slice(source.startLine-1,source.endLine).join('\n').includes(source.excerpt);
    checks.push({id:rule.id,status:valid?'PASS':'BLOCK',reason:'Evidence source excerpt'});
   }
   if(!found?.sources?.length)checks.push({id:rule.id,status:'BLOCK',reason:'Evidence source required'});
  }else checks.push({id:rule.id,status:'WARN',reason:'No structured evidence file configured'});
 }
 try{const index=await read(root,'docs/project-baseline/INDEX.md');for(const m of index.matchAll(/\]\(([^)]+)\)/g)){const target=m[1].split('#')[0];if(!target||/^https?:/.test(target))continue;await read(root,path.posix.join('docs/project-baseline',target));}}
 catch(error){if(error.code==='ENOENT')checks.push({status:'WARN',reason:'INDEX or a linked document is missing'});else throw error;}
 return {status:checks.some(c=>c.status==='BLOCK')?'BLOCK':checks.some(c=>c.status==='WARN')?'WARN':'PASS',checks};
}
