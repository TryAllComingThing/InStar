import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const REPORT_MANIFEST_PATH='reports/manifest.json';
const SCHEMA_VERSION=1;
const MAX_ENTRIES=200;

function text(value,label,max=600){
  if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value)>max)throw Error(`${label} must be non-empty text up to ${max} bytes`);
  return value.trim();
}
function reportPath(value){
  const normalized=text(value,'report.path',600).replaceAll('\\','/');
  if(!normalized.startsWith('reports/')||path.isAbsolute(normalized)||normalized.split('/').includes('..'))throw Error('report.path must stay under reports/');
  return normalized;
}
function hash(value){
  const normalized=text(value,'report.hash',64);
  if(!/^[a-f0-9]{64}$/.test(normalized))throw Error('report.hash must be a SHA-256 hex digest');
  return normalized;
}
async function readManifest(root){
  const file=path.resolve(root,REPORT_MANIFEST_PATH);
  let stat;
  try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return {schemaVersion:SCHEMA_VERSION,reports:[]};throw error;}
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1024*1024)throw Error('reports/manifest.json must be a regular file up to 1 MiB');
  const parsed=JSON.parse(await fs.readFile(file,'utf8'));
  if(parsed?.schemaVersion!==SCHEMA_VERSION||!Array.isArray(parsed.reports))throw Error('reports/manifest.json must use schemaVersion 1');
  return parsed;
}
async function writeManifest(root,manifest){
  const file=path.resolve(root,REPORT_MANIFEST_PATH),temp=path.resolve(root,`${REPORT_MANIFEST_PATH}.${randomUUID()}.tmp`);
  await fs.mkdir(path.dirname(file),{recursive:true});
  try{await fs.writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});await fs.rename(temp,file);}
  finally{await fs.rm(temp,{force:true});}
}

export async function updateReportManifest(root,{id,kind,path:bodyPath,hash:bodyHash,status='UNKNOWN',snapshotFingerprint=null,at=new Date().toISOString()}={}){
  const entry={
    id:text(id,'report.id',200),
    kind:text(kind,'report.kind',120),
    path:reportPath(bodyPath),
    hash:hash(bodyHash),
    status:text(status,'report.status',40),
    snapshotFingerprint:snapshotFingerprint===null?null:text(snapshotFingerprint,'report.snapshotFingerprint',128),
    at:text(at,'report.at',80),
  };
  const manifest=await readManifest(root);
  const reports=manifest.reports.filter(item=>item.id!==entry.id&&item.path!==entry.path);
  const sameContent=reports.find(item=>item.hash===entry.hash);
  if(sameContent){
    sameContent.aliases=[...new Set([...(sameContent.aliases||[]),entry.path])].slice(0,20);
    sameContent.at=entry.at;
  }else reports.push(entry);
  reports.sort((left,right)=>String(right.at).localeCompare(String(left.at))||String(right.id).localeCompare(String(left.id)));
  const body={schemaVersion:SCHEMA_VERSION,reports:reports.slice(0,MAX_ENTRIES)};
  await writeManifest(root,body);
  return entry;
}
