import {constants as fsConstants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openVerified,readDirectoryVerified,readHandleVerified,readPrefixBufferVerified} from './path-safety.mjs';

const USAGE_KEYS=['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','billableTokens'];
const nonNegativeInteger=(value,label)=>{if(!Number.isInteger(value)||value<0)throw Error(`${label} must be a non-negative integer`);return value;};

function normalizeSessionUsage(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 return {
  inputTokens:value.inputTokens??value.input_tokens,
  cachedInputTokens:value.cachedInputTokens??value.cached_input_tokens,
  outputTokens:value.outputTokens??value.output_tokens,
  reasoningOutputTokens:value.reasoningOutputTokens??value.reasoning_output_tokens,
  totalTokens:value.totalTokens??value.total_tokens
 };
}

export function normalizeUsage(value,label='usage'){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} must be an object`);
 const usage={
  inputTokens:nonNegativeInteger(value.inputTokens??0,`${label}.inputTokens`),
  cachedInputTokens:nonNegativeInteger(value.cachedInputTokens??0,`${label}.cachedInputTokens`),
  outputTokens:nonNegativeInteger(value.outputTokens??0,`${label}.outputTokens`),
  reasoningOutputTokens:nonNegativeInteger(value.reasoningOutputTokens??0,`${label}.reasoningOutputTokens`),
  totalTokens:nonNegativeInteger(value.totalTokens??((value.inputTokens??0)+(value.outputTokens??0)),`${label}.totalTokens`),
  billableTokens:nonNegativeInteger(value.billableTokens??((value.inputTokens??0)-(value.cachedInputTokens??0)+(value.outputTokens??0)),`${label}.billableTokens`)
 };
 if(!Object.values(usage).some(Boolean))throw Error(`${label} contains no token usage`);
 if(usage.cachedInputTokens>usage.inputTokens)throw Error(`${label}.cachedInputTokens cannot exceed inputTokens`);
 if(usage.reasoningOutputTokens>usage.outputTokens)throw Error(`${label}.reasoningOutputTokens cannot exceed outputTokens`);
 if(usage.totalTokens<usage.inputTokens+usage.outputTokens)throw Error(`${label}.totalTokens cannot be less than inputTokens + outputTokens`);
 return usage;
}

export function usageTotals(values){
 const totals=Object.fromEntries(USAGE_KEYS.map(key=>[key,0]));
 for(const raw of values){const usage=normalizeUsage(raw,'session usage');for(const key of USAGE_KEYS)totals[key]+=usage[key];}
 return totals;
}

function parentId(meta,fileId){
 return meta?.parent_thread_id||meta?.source?.subagent?.thread_spawn?.parent_thread_id||meta?.forked_from_id||meta?.parentSessionId||meta?.parent_session_id||(meta?.session_id&&meta.session_id!==fileId?meta.session_id:null);
}

function agentLabel(meta){
 const spawn=meta?.source?.subagent?.thread_spawn;
 const agentPath=spawn?.agent_path||meta?.agent_path||null;
 const pathName=agentPath?path.basename(agentPath):null;
 return spawn?.agent_role||meta?.agent_role||pathName||meta?.agent_nickname||null;
}

async function walkSessionFiles(root){
 const files=[];let visited=0;
 async function walk(relative,depth){
  if(depth>8||visited>=20000)return;
  let entries;try{entries=await readDirectoryVerified(root,relative||'.',{maxEntries:10000,label:'Codex sessions directory'});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(visited++>=20000)return;
   const child=relative?`${relative}/${entry.name}`:entry.name;
   if(entry.isSymbolicLink())continue;
   if(entry.isDirectory())await walk(child,depth+1);
   else if(entry.isFile()&&entry.name.endsWith('.jsonl'))files.push(child);
  }
 }
 await walk('',0);
 return files;
}

async function findSessionFile(root,sessionId){
 const files=await walkSessionFiles(root);
 return files.find(file=>path.basename(file)===`${sessionId}.jsonl`||file.endsWith(`/${sessionId}.jsonl`))||null;
}

async function readSession(root,relative){
 let text;
 const handle=await openVerified(root,relative,fsConstants.O_RDONLY);
 try{
  const stat=await handle.stat();
  if(stat.size>64*1024*1024)return {available:false,reason:'Codex session log exceeds 64 MiB',file:path.basename(relative)};
  text=(await readHandleVerified(root,relative,handle,{maxBytes:64*1024*1024})).toString('utf8');
 }finally{await handle.close();}
 const responses=new Map();let startedAt=null,endedAt=null,model=null,provider=null,meta=null;
 for(const line of text.split('\n')){
  if(!line.trim())continue;let record;try{record=JSON.parse(line);}catch{continue;}
  const payload=record?.payload;
  if(record?.type==='session_meta'&&!meta)meta=payload||null;
  if(record?.type==='token_usage_record'&&payload?.response_id&&payload?.usage&&!responses.has(payload.response_id)){
   responses.set(payload.response_id,payload.usage);
   startedAt ||= record.timestamp||null;endedAt=record.timestamp||endedAt;
  }
  model ||= payload?.model||payload?.turn_context?.model||null;
  provider ||= payload?.provider||payload?.model_provider||null;
 }
 const fileId=path.basename(relative,'.jsonl').split('-').slice(-5).join('-');
 if(!responses.size)return {available:false,reason:'Session log contains no token usage records',file:path.basename(relative),fileId,meta};
 return {available:true,fileId,meta,model,provider,startedAt,endedAt,apiCalls:responses.size,usage:usageTotals([...responses.values()].map(normalizeSessionUsage))};
}

export async function readCodexSessionUsage(sessionId,{sessionsRoot}={}){
 if(typeof sessionId!=='string'||!sessionId.trim())throw Error('sessionId is required');
 const root=sessionsRoot||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions');
 if(sessionsRoot&&(typeof sessionsRoot!=='string'||!path.isAbsolute(sessionsRoot)))throw Error('sessionsRoot must be an absolute path');
 let file;try{file=await findSessionFile(root,sessionId);}catch(error){return {available:false,reason:`Cannot inspect Codex sessions: ${error.message}`};}
 if(!file)return {available:false,reason:'Codex session log not found'};
 const session=await readSession(root,file);
 if(!session.available)return {available:false,reason:session.reason,file:session.file};
 return {available:true,sessionId,source:'codex-session',file:session.file,startedAt:session.startedAt,endedAt:session.endedAt,model:session.model,provider:session.provider,apiCalls:session.apiCalls,usage:session.usage};
}

export async function readCodexSessionUsageTree(sessionId,{sessionsRoot}={}){
 if(typeof sessionId!=='string'||!sessionId.trim())throw Error('sessionId is required');
 const root=sessionsRoot||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions');
 if(sessionsRoot&&(typeof sessionsRoot!=='string'||!path.isAbsolute(sessionsRoot)))throw Error('sessionsRoot must be an absolute path');
 let files;try{files=await walkSessionFiles(root);}catch(error){return {available:false,reason:`Cannot inspect Codex sessions: ${error.message}`};}
 if(!files.length)return {available:false,reason:'Codex session log not found'};
 const candidates=[];
 let metadataBytes=0;
 for(const file of files){
  const fileId=path.basename(file,'.jsonl').split('-').slice(-5).join('-');let meta=null;
  try{
   const buffer=await readPrefixBufferVerified(root,file,{maxBytes:2*1024*1024});
   metadataBytes+=buffer.length;
   if(metadataBytes>32*1024*1024)return {available:false,reason:'Codex session metadata scan exceeds 32 MiB'};
   const first=buffer.toString('utf8').split('\n')[0];try{const record=JSON.parse(first);if(record?.type==='session_meta')meta=record.payload||null;}catch{}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  candidates.push({file,fileId,meta,parentId:parentId(meta,fileId)});
 }
 const rootFile=candidates.find(item=>item.fileId===sessionId||path.basename(item.file).endsWith(`${sessionId}.jsonl`));
 if(!rootFile)return {available:false,reason:'Codex session log not found'};
 const selected=new Set([rootFile.fileId]);
 let changed=true;
 while(changed){changed=false;for(const item of candidates)if(item.parentId&&selected.has(item.parentId)&&!selected.has(item.fileId)){selected.add(item.fileId);changed=true;}}
 const sessions=[];
 for(const candidate of candidates.filter(item=>selected.has(item.fileId))){
  const parsed=await readSession(root,candidate.file);if(!parsed.available)continue;
  const meta=candidate.meta||parsed.meta;
  sessions.push({sessionId:candidate.fileId,parentSessionId:candidate.parentId||null,role:candidate.parentId?agentLabel(meta):null,threadSource:meta?.thread_source||null,agentNickname:meta?.agent_nickname||null,file:parsed.file,startedAt:parsed.startedAt,endedAt:parsed.endedAt,model:parsed.model,provider:parsed.provider,apiCalls:parsed.apiCalls,usage:parsed.usage});
 }
 if(!sessions.length)return {available:false,reason:'Session log contains no token usage records'};
 sessions.sort((a,b)=>(a.parentSessionId?1:0)-(b.parentSessionId?1:0)||(a.startedAt||'').localeCompare(b.startedAt||''));
 const primary=sessions.find(item=>item.sessionId===rootFile.fileId)||sessions[0];
 return {available:true,sessionId,source:'codex-session-tree',file:primary.file,startedAt:sessions.map(item=>item.startedAt).filter(Boolean).sort()[0]||null,endedAt:sessions.map(item=>item.endedAt).filter(Boolean).sort().at(-1)||null,model:primary.model,provider:primary.provider,apiCalls:sessions.reduce((total,item)=>total+item.apiCalls,0),usage:usageTotals(sessions.map(item=>item.usage)),sessions};
}
