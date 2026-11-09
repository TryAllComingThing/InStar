import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nonNegativeInteger=(value,label)=>{if(!Number.isInteger(value)||value<0)throw Error(`${label} must be a non-negative integer`);return value;};

export function normalizeUsage(value,label='usage'){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} must be an object`);
 const usage={
  inputTokens:nonNegativeInteger(value.inputTokens??0,`${label}.inputTokens`),
  cachedInputTokens:nonNegativeInteger(value.cachedInputTokens??0,`${label}.cachedInputTokens`),
  outputTokens:nonNegativeInteger(value.outputTokens??0,`${label}.outputTokens`),
  reasoningOutputTokens:nonNegativeInteger(value.reasoningOutputTokens??0,`${label}.reasoningOutputTokens`),
  totalTokens:nonNegativeInteger(value.totalTokens??((value.inputTokens??0)+(value.outputTokens??0)),`${label}.totalTokens`)
 };
 if(!Object.values(usage).some(Boolean))throw Error(`${label} contains no token usage`);
 if(usage.cachedInputTokens>usage.inputTokens)throw Error(`${label}.cachedInputTokens cannot exceed inputTokens`);
 if(usage.reasoningOutputTokens>usage.outputTokens)throw Error(`${label}.reasoningOutputTokens cannot exceed outputTokens`);
 if(usage.totalTokens<usage.inputTokens+usage.outputTokens)throw Error(`${label}.totalTokens cannot be less than inputTokens + outputTokens`);
 return usage;
}

async function findSessionFile(root,sessionId){
 let visited=0;
 async function walk(dir,depth){
  if(depth>6||visited>=20000)return null;
  let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(visited++>=20000)return null;
   const full=path.join(dir,entry.name);
   if(entry.isSymbolicLink())continue;
   if(entry.isDirectory()){const found=await walk(full,depth+1);if(found)return found;}
   else if(entry.isFile()&&entry.name.endsWith(`${sessionId}.jsonl`))return full;
  }
  return null;
 }
 return walk(root,0);
}

export async function readCodexSessionUsage(sessionId,{sessionsRoot}={}){
 if(typeof sessionId!=='string'||!sessionId.trim())throw Error('sessionId is required');
 const root=sessionsRoot||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions');
 if(sessionsRoot&&(typeof sessionsRoot!=='string'||!path.isAbsolute(sessionsRoot)))throw Error('sessionsRoot must be an absolute path');
 let file;try{file=await findSessionFile(root,sessionId);}catch(error){return {available:false,reason:`Cannot inspect Codex sessions: ${error.message}`};}
 if(!file)return {available:false,reason:'Codex session log not found'};
 const stat=await fs.stat(file);if(stat.size>64*1024*1024)return {available:false,reason:'Codex session log exceeds 64 MiB'};
 const text=await fs.readFile(file,'utf8');
 const responses=new Map();let startedAt=null,endedAt=null,model=null,provider=null;
 for(const line of text.split('\n')){
  if(!line.trim())continue;let record;try{record=JSON.parse(line);}catch{continue;}
  const payload=record?.payload;
  if(record?.type==='token_usage_record'&&payload?.response_id&&payload?.usage&&!responses.has(payload.response_id)){
   responses.set(payload.response_id,payload.usage);
   startedAt ||= record.timestamp||null;endedAt=record.timestamp||endedAt;
  }
  model ||= payload?.model||payload?.turn_context?.model||null;
  provider ||= payload?.provider||payload?.model_provider||null;
 }
 if(!responses.size)return {available:false,reason:'Session log contains no token usage records',file:path.basename(file)};
 const totals={inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningOutputTokens:0,totalTokens:0};
 for(const value of responses.values()){
  totals.inputTokens+=Number.isInteger(value.input_tokens)?value.input_tokens:0;
  totals.cachedInputTokens+=Number.isInteger(value.cached_input_tokens)?value.cached_input_tokens:0;
  totals.outputTokens+=Number.isInteger(value.output_tokens)?value.output_tokens:0;
  totals.reasoningOutputTokens+=Number.isInteger(value.reasoning_output_tokens)?value.reasoning_output_tokens:0;
  totals.totalTokens+=Number.isInteger(value.total_tokens)?value.total_tokens:(value.input_tokens||0)+(value.output_tokens||0);
 }
 return {available:true,sessionId,source:'codex-session',file:path.basename(file),startedAt,endedAt,model,provider,apiCalls:responses.size,usage:normalizeUsage(totals,'session usage')};
}
