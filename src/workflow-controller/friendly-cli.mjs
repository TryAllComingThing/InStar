import path from 'node:path';
import {promises as fs} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {run as runWorkflow} from './index.mjs';
import {run as runDiscovery} from '../discovery-controller/index.mjs';
import {inspectWorkflow} from '../shared/workflow-status.mjs';
import {efficiencyLanes,laneDefinition} from '../shared/efficiency.mjs';
import {readBoundedFile,readBoundedStdin,assertBoundedText} from '../shared/bounded-input.mjs';
import {redactText} from '../shared/redaction.mjs';

const usage='Usage: instar <flow status|next|context|start|action|doc show|find reuse|standards|architecture|spec|standards context|check|cost show|lanes|explain> [options]';
const flags=new Set(['--json','--brief','--dry-run','--help','--changed','--resume']);
const valueOptions=new Set(['--project','--change','--document','--affected','--path','--query','--limit','--lane','--profile','--input','--context-hash','--expected-version','--kind','--stage','--scope']);

function parseTokens(tokens,{values=[],flags:allowedFlags=[],multi=[]}={}){
 const result={values:new Map(),flags:new Set(),multi:new Map(),positional:[]};
 for(let index=0;index<tokens.length;index++){
  const token=tokens[index];
  if(!token.startsWith('--')){result.positional.push(token);continue;}
  if(flags.has(token)){
   if(!allowedFlags.includes(token))throw Error(`${token} is not supported here`);
   result.flags.add(token);continue;
  }
  if(valueOptions.has(token)){
   if(!values.includes(token)&&!multi.includes(token))throw Error(`${token} is not supported here`);
   if(index+1>=tokens.length||tokens[index+1].startsWith('--'))throw Error(`Option requires a value: ${token}`);
   const value=tokens[++index];
   if(multi.includes(token)){
    if(!result.multi.has(token))result.multi.set(token,[]);
    result.multi.get(token).push(value);
   }else{
    if(result.values.has(token))throw Error(`Duplicate option: ${token}`);
    result.values.set(token,value);
   }
   continue;
  }
  throw Error(`Unknown option: ${token}`);
 }
 return result;
}

function requirePositional(parsed,count,label){
 if(parsed.positional.length!==count)throw Error(`Expected ${label}. ${usage}`);
}

function absoluteProject(parsed,cwd){return path.resolve(cwd,parsed.values.get('--project')||'.');}
function mode(parsed){return {json:parsed.flags.has('--json'),brief:parsed.flags.has('--brief'),dryRun:parsed.flags.has('--dry-run')};}
function limitValue(parsed,fallback=20){
 const raw=parsed.values.get('--limit');
 if(raw===undefined)return fallback;
 const value=Number(raw);
 if(!Number.isInteger(value)||value<1||value>200)throw Error('--limit must be an integer from 1 to 200');
 return value;
}

async function documentText(value,cwd){
 if(value==='-')return assertBoundedText(await readBoundedStdin(),'document');
 const file=path.resolve(cwd,value);
 try{return assertBoundedText(await readBoundedFile(file),'document');}
 catch(error){
  if(error.code==='ENOENT')throw Error(`Document file not found: ${value}`);
  throw error;
 }
}

export async function parseWorkflowArgs(args,cwd=process.cwd()){
 const [command,...tokens]=args;
 if(!command||command==='help')return {type:'help',mode:{json:args.includes('--json'),brief:args.includes('--brief'),dryRun:false},topic:tokens.find(token=>!token.startsWith('--'))||null};
 if(args.includes('--help'))return {type:'help',mode:{json:args.includes('--json'),brief:args.includes('--brief'),dryRun:false},topic:[command,tokens[0]&&!tokens[0].startsWith('--')?tokens[0]:null].filter(Boolean).join(' ')};
 if(command==='flow'){
  const [subcommand,...flowTokens]=tokens;
  if(!subcommand)throw Error(usage);
  if(subcommand==='status'||subcommand==='next'){
   const parsed=parseTokens(flowTokens,{values:['--project','--change'],flags:['--json','--brief','--help']});
   requirePositional(parsed,0,`no positional arguments after ${subcommand}`);
   return {type:'inspect',mode:mode(parsed),command:subcommand,project:absoluteProject(parsed,cwd),changeId:parsed.values.get('--change')||null};
  }
  if(subcommand==='context'){
   const parsed=parseTokens(flowTokens,{values:['--project','--change'],flags:['--json','--brief','--help','--resume']});
   requirePositional(parsed,0,'no positional arguments after context');
   return {type:'context',mode:mode(parsed),project:absoluteProject(parsed,cwd),changeId:parsed.values.get('--change')||null,resume:parsed.flags.has('--resume')};
  }
  if(subcommand==='start'){
   const parsed=parseTokens(flowTokens,{values:['--project','--change','--document','--lane','--profile'],multi:['--affected'],flags:['--json','--brief','--dry-run','--help']});
   requirePositional(parsed,0,'no positional arguments after start');
   const changeId=parsed.values.get('--change');if(!changeId)throw Error('flow start requires --change <id>');
   const documentOption=parsed.values.get('--document');if(!documentOption)throw Error('flow start requires --document <file|->');
   if(parsed.values.has('--lane')&&parsed.values.has('--profile'))throw Error('Choose only one of --lane or --profile');
   const lane=parsed.values.get('--lane')||parsed.values.get('--profile');
   if(lane&&!efficiencyLanes.includes(lane))throw Error(`lane must be ${efficiencyLanes.join(', ')}`);
   return {type:'workflow',mode:mode(parsed),command:'start',request:{action:'start',project:absoluteProject(parsed,cwd),changeId,document:await documentText(documentOption,cwd),affectedPaths:parsed.multi.get('--affected')||[],...(lane?{lane}:{})}};
  }
  if(subcommand==='action'){
   const parsed=parseTokens(flowTokens,{values:['--project','--change','--input','--document','--context-hash','--expected-version','--lane'],flags:['--json','--brief','--dry-run','--help']});
   if(parsed.positional.length!==1)throw Error(`flow action requires exactly one action name. ${usage}`);
   const action=parsed.positional[0];
   let request={};
   if(parsed.values.has('--input'))request=JSON.parse(await readBoundedFile(path.resolve(cwd,parsed.values.get('--input'))));
   if(!request||typeof request!=='object'||Array.isArray(request))throw Error('--input must contain a JSON object');
   if(request.action&&request.action!==action)throw Error('--input action does not match the positional flow action');
   const cliProject=absoluteProject(parsed,cwd);
   if(request.project!==undefined){
    if(typeof request.project!=='string'||!request.project.trim())throw Error('--input project must be a non-empty path');
    const inputProject=path.resolve(cwd,request.project);
    if(inputProject!==cliProject)throw Error(`--input project does not match --project: ${inputProject} != ${cliProject}`);
   }
   request={...request,action,project:cliProject};
   if(parsed.values.has('--change'))request.changeId=parsed.values.get('--change');
   if(parsed.values.has('--context-hash'))request.contextHash=parsed.values.get('--context-hash');
   if(parsed.values.has('--expected-version')){
    const expected=Number(parsed.values.get('--expected-version'));
    if(!Number.isInteger(expected)||expected<0)throw Error('--expected-version must be a non-negative integer');
    request.expectedVersion=expected;
   }
   if(parsed.values.has('--lane'))request.lane=parsed.values.get('--lane');
   if(parsed.values.has('--document'))request.document=await documentText(parsed.values.get('--document'),cwd);
   return {type:'workflow',mode:mode(parsed),command:'action',request};
  }
  throw Error(`Unknown flow command: ${subcommand}. ${usage}`);
 }
 if(command==='context'){
  const parsed=parseTokens(tokens,{values:['--project','--change'],flags:['--json','--brief','--help','--resume']});
  requirePositional(parsed,0,'no positional arguments after context');
  return {type:'context',mode:mode(parsed),project:absoluteProject(parsed,cwd),changeId:parsed.values.get('--change')||null,resume:parsed.flags.has('--resume')};
 }
 if(command==='start')return parseWorkflowArgs(['flow','start',...tokens],cwd);
 if(command==='doc'){
  const [subcommand,...docTokens]=tokens;if(subcommand!=='show')throw Error('Usage: instar doc show [--kind <prd|proposal|spec|design|tasks>] [--change <id>]');
  const parsed=parseTokens(docTokens,{values:['--project','--change','--kind','--stage'],flags:['--json','--brief','--help']});
  requirePositional(parsed,0,'no positional arguments after doc show');
  const kind=parsed.values.get('--kind')||parsed.values.get('--stage')||null;
  if(kind&&!['prd','proposal','spec','design','technical-design','tasks','all'].includes(kind))throw Error('--kind must be prd, proposal, spec, design, tasks or all');
  return {type:'doc',mode:mode(parsed),project:absoluteProject(parsed,cwd),changeId:parsed.values.get('--change')||null,kind};
 }
 if(command==='find'){
  const [subcommand,...findTokens]=tokens;
  if(!['reuse','capability','standards','rules','architecture','baseline','spec'].includes(subcommand))throw Error('Usage: instar find <reuse|standards|architecture|spec> [options]');
  if(subcommand==='spec'){
   const parsed=parseTokens(findTokens,{values:['--project','--scope'],multi:['--scope'],flags:['--json','--brief','--help']});
   requirePositional(parsed,0,'no positional arguments after find spec');
   return {type:'discovery',mode:mode(parsed),request:{action:'context',project:absoluteProject(parsed,cwd),...(parsed.multi.get('--scope')?.length?{scopes:parsed.multi.get('--scope')}:{})}};
  }
  const parsed=parseTokens(findTokens,{values:['--project','--change','--query','--limit'],multi:['--path'],flags:['--json','--brief','--help','--changed']});
  requirePositional(parsed,0,`no positional arguments after find ${subcommand}`);
  const action=subcommand==='reuse'||subcommand==='capability'?'reuse-context':subcommand==='architecture'||subcommand==='baseline'?'project-context':'standards-context';
  if(action==='reuse-context'&&!parsed.values.get('--query'))throw Error('find reuse requires --query <text>');
  return {type:'workflow',mode:mode(parsed),command:'find',request:{action,project:absoluteProject(parsed,cwd),...(parsed.values.has('--query')?{query:parsed.values.get('--query')}:{}),...(parsed.values.has('--limit')?{limit:limitValue(parsed)}:{}),...(parsed.multi.get('--path')?.length?{paths:parsed.multi.get('--path')}:{})},changed:parsed.flags.has('--changed'),changeId:parsed.values.get('--change')||null};
 }
 if(command==='standards'){
  const [subcommand,...standardTokens]=tokens;
  if(!['context','check','list'].includes(subcommand))throw Error('Usage: instar standards <context|check|list> [options]');
  if(subcommand==='check'){
   const parsed=parseTokens(standardTokens,{values:['--project','--document'],multi:['--path'],flags:['--json','--brief','--help']});
   requirePositional(parsed,0,'no positional arguments after standards check');
   const document=parsed.values.get('--document');if(!document)throw Error('standards check requires --document <file|->');
   return {type:'workflow',mode:mode(parsed),command:'standards-check',request:{action:'standards-check',project:absoluteProject(parsed,cwd),document:await documentText(document,cwd),...(parsed.multi.get('--path')?.length?{paths:parsed.multi.get('--path')}:{})}};
  }
  const parsed=parseTokens(standardTokens,{values:['--project'],multi:['--path'],flags:['--json','--brief','--help']});
  requirePositional(parsed,0,`no positional arguments after standards ${subcommand}`);
  return {type:'workflow',mode:mode(parsed),command:'standards-context',request:{action:'standards-context',project:absoluteProject(parsed,cwd),...(parsed.multi.get('--path')?.length?{paths:parsed.multi.get('--path')}:{})}};
 }
 if(command==='cost'){
  const [subcommand,...costTokens]=tokens;
  if(subcommand==='lanes'){
   const parsed=parseTokens(costTokens,{flags:['--json','--brief','--help']});requirePositional(parsed,0,'no positional arguments after cost lanes');
   return {type:'lanes',mode:mode(parsed)};
  }
  if(subcommand!=='show')throw Error('Usage: instar cost <show|lanes> [options]');
  const parsed=parseTokens(costTokens,{values:['--project','--change'],flags:['--json','--brief','--help']});requirePositional(parsed,0,'no positional arguments after cost show');
  return {type:'inspect',mode:mode(parsed),command:'cost',project:absoluteProject(parsed,cwd),changeId:parsed.values.get('--change')||null};
 }
 if(command==='explain')return {type:'explain',mode:mode(parseTokens(tokens,{flags:['--json','--brief','--help']}))};
 throw Error(usage);
}

async function resolveChange(root,changeId=null){
 const status=await inspectWorkflow(root,{changeId});
 if(!status.change)throw Error('No tracked workflow exists; start one with instar flow start');
 return status.change.changeId;
}

async function stateFor(root,changeId){
 return JSON.parse(await fs.readFile(path.join(root,'planning/workflows',`${changeId}.json`),'utf8'));
}

async function documentBundle(root,changeId,kind){
 const stage=(await stateFor(root,changeId)).stage;
 const requested=kind||({prd:'prd',spec:'spec',design:'design',tasks:'tasks',implementation:'tasks',verification:'tasks',archive:'tasks'}[stage]);
 const changeDir=path.join(root,'planning/changes',changeId);
 const files=[];
 const add=async(file,label)=>{try{files.push({path:path.relative(root,file).replaceAll(path.sep,'/'),label,text:await readBoundedFile(file)});}catch(error){if(error.code==='ENOENT')throw Error(`Document not found: ${path.relative(root,file)}`);throw error;}};
 if(requested==='prd')await add(path.join(root,'docs/prd',`${changeId}.md`),'PRD');
 else if(requested==='proposal')await add(path.join(changeDir,'proposal.md'),'Proposal');
 else if(requested==='spec'){
  const dir=path.join(changeDir,'specs');let entries;
  try{entries=(await fs.readdir(dir,{withFileTypes:true})).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name));}
  catch(error){if(error.code==='ENOENT')throw Error('Spec documents are not available yet');throw error;}
  for(const entry of entries)await add(path.join(dir,entry.name,'spec.md'),`Spec: ${entry.name}`);
 }else if(requested==='design'||requested==='technical-design'){
  const current=path.join(changeDir,'technical-design.md'),legacy=path.join(changeDir,'design.md');
  if(await fs.access(current).then(()=>true,()=>false))await add(current,'Technical design');else await add(legacy,'Technical design');
 }else if(requested==='tasks')await add(path.join(changeDir,'tasks.md'),'Tasks');
 else if(requested==='all'){
  for(const item of ['prd','proposal','spec','design','tasks'])files.push(...(await documentBundle(root,changeId,item)).files);
 }else throw Error(`Unsupported document kind: ${requested}`);
 return {changeId,kind:requested,files};
}

async function execute(command){
 if(command.type==='help')return helpOutput(command.topic);
 if(command.type==='explain')return explainOutput();
 if(command.type==='lanes')return {lanes:efficiencyLanes.map(lane=>laneDefinition(lane)),note:'Budgets are controller-recorded targets, not guarantees of external token billing or wall-clock time.'};
 if(command.type==='inspect'){
  const result=await inspectWorkflow(command.project,{changeId:command.changeId});
  return {command:command.command,result};
 }
 if(command.type==='context'){
  const changeId=command.changeId||await resolveChange(command.project);
  const result=await runWorkflow({action:'context',project:command.project,changeId});
  if(!command.resume)return {command:'context',result:{...result,changeId}};
  const status=await inspectWorkflow(command.project,{changeId});
  return {command:'context',result:{...result,changeId,resume:{next:status.next,efficiency:status.efficiency,source:status.source}}};
 }
 if(command.type==='doc'){
  const changeId=command.changeId||await resolveChange(command.project);
  return {command:'doc',result:await documentBundle(command.project,changeId,command.kind)};
 }
 if(command.type==='discovery')return {command:'find',result:await runDiscovery(command.request)};
 if(command.type==='workflow'){
  let request=command.request;
  if(command.changed){
   const changeId=command.changeId||await resolveChange(command.project);
   const state=await stateFor(command.project,changeId);
   request={...request,paths:[...(request.paths||[]),...(state.affectedPaths||[])]};
  }
  if(command.mode.dryRun)return {command:command.command,result:{status:'DRY_RUN',request:{...request,...(request.document&&request.document.length>240?{document:`<${Buffer.byteLength(request.document)} bytes>`}:{})}},dryRun:true};
  return {command:command.command,result:await runWorkflow(request)};
 }
 throw Error(usage);
}

function tokenRange(value){
 if(!Array.isArray(value)||value.length!==2)return 'unknown';
 const format=number=>number>=1000000?`${(number/1000000).toFixed(number%1000000?1:0)}M`:String(number);
 return `${format(value[0])}-${format(value[1])}`;
}

function briefText(command,payload){
 if(command.type==='doc')return payload.result.files.map(file=>`${file.path} (${Buffer.byteLength(file.text)} bytes)`).join('\n');
 if(command.type==='discovery'){
  const context=payload.result;
  return `find ${context.reviewStatus||'not-human-reviewed'}; scopes=${(context.scopes||[]).join(',')||'default'}; files=${Object.keys(context.inventory||{}).length}`;
 }
 if(command.type==='lanes')return payload.lanes.map(item=>`${item.lane} ${item.targetMinutes[0]}-${item.targetMinutes[1]}m ${tokenRange(item.tokenTarget)}`).join('\n');
 const result=payload.result;
 if(command.type==='inspect'&&command.command==='cost'){
  const efficiency=result.efficiency;
  if(!efficiency)return 'No efficiency record exists for this workflow.';
  return `cost ${efficiency.lane} ${efficiency.status}; tokens=${efficiency.usage.totalTokens??'missing'}; tools=${efficiency.usage.toolCalls??'missing'}; active=${efficiency.usage.activeMs??'missing'}ms; missing=${efficiency.missingMetrics.join(',')||'none'}`;
 }
 if(command.type==='inspect'){
  const change=result.change;
  if(!change)return 'No tracked workflow exists.';
  return `${change.changeId} ${change.stage}/${change.status} v${change.version}; risk=${change.risk?.level||'unknown'}; quality=${result.quality?.status||'missing'}; efficiency=${result.efficiency?.lane||'unknown'}/${result.efficiency?.status||'missing'}; next=${result.next.action||'none'}${result.next.warning?' (warning)':''}`;
 }
 if(command.type==='context'){
  const standards=(result.context.projectArchitecture?.applicableStandards?.mandatoryEntries||[]).map(item=>item.id).join(',')||'none';
  const next=result.resume?.next?.action||result.efficiencySummary?.status||'unknown';
  return `${result.state.changeId} ${result.state.stage}/${result.state.status}; standards=${standards}; next=${next}`;
 }
 if(command.type==='workflow'){
  if(command.command.startsWith('standards'))return `standards ${result.status}; required=${(result.compliance?.required||result.applicable?.mandatoryEntries?.map(item=>item.id)||[]).join(',')||'none'}; conflicts=${(result.applicable?.conflicts||[]).length}`;
  if(command.command==='find')return `${result.state||'find'}; candidates=${result.candidates?.length??result.capabilities?.length??result.entries?.length??0}`;
  return `${command.command} ${result.status||'unknown'} ${result.stage||'unknown'} v${result.version??'unknown'}`;
 }
 return JSON.stringify(payload);
}

function renderText(command,payload){
 if(command.mode?.brief&&!['help','explain'].includes(command.type))return briefText(command,payload);
 if(command.type==='help')return payload.text;
 if(command.type==='explain')return payload.text;
 if(command.type==='lanes')return payload.lanes.map(item=>`${item.lane}: ${item.targetMinutes[0]}-${item.targetMinutes[1]} min, ${tokenRange(item.tokenTarget)} tokens, ${item.budgets.qualityGateRuns} quality gate(s)`).join('\n');
 if(command.type==='doc')return payload.result.files.map(file=>`# ${file.label} (${file.path})\n\n${file.text.trimEnd()}`).join('\n\n---\n\n');
 if(command.type==='discovery'){
  const context=payload.result;
  return [`Discovery context: ${context.contextHash||'unknown'}`,`Scopes: ${(context.scopes||[]).join(', ')||'repository default'}`,`Inventory: ${Object.keys(context.inventory||{}).length} file(s)`,`Review status: ${context.reviewStatus||'not-human-reviewed'}`,...(context.limitations||[]).map(item=>`Limitation: ${item}`)].join('\n');
 }
 const result=payload.result;
 if(command.type==='inspect'&&command.command==='cost'){
  const efficiency=result.efficiency;
  if(!efficiency)return 'No efficiency record exists for this workflow.';
  return [`Lane: ${efficiency.lane}`,`Target: ${efficiency.targetMinutes[0]}-${efficiency.targetMinutes[1]} min; ${tokenRange(efficiency.tokenTarget)} tokens`,`Status: ${efficiency.status}`,`Observed total tokens: ${efficiency.usage.totalTokens??'missing'}`,`Observed tool calls: ${efficiency.usage.toolCalls??'missing'}`,`Observed model responses: ${efficiency.usage.modelResponses??'missing'}`,`Active: ${efficiency.usage.activeMs??'missing'} ms; elapsed: ${efficiency.usage.elapsedMs} ms; wait: ${efficiency.usage.waitMs??'missing'} ms`,`Missing metrics: ${efficiency.missingMetrics.length?efficiency.missingMetrics.join(', '):'none'}`,efficiency.exceeded.length?`Exceeded: ${efficiency.exceeded.map(item=>`${item.metric} ${item.used}>${item.limit}`).join(', ')}`:null].filter(Boolean).join('\n');
 }
 if(command.type==='inspect'){
  const change=result.change;
  if(!change)return 'No tracked workflow exists.';
  if(command.command==='next')return [`Next: ${result.next.action||'none'}`,`Reason: ${result.next.reason}`,`Change: ${change.changeId} (${change.stage}/${change.status}, v${change.version})`,result.next.warning?`Warning: ${result.next.warning.message}`:null].filter(Boolean).join('\n');
  return [`Change: ${change.changeId}`,`Stage: ${change.stage}`,`Status: ${change.status}`,`Version: ${change.version}`,`Risk: ${change.risk?.level||'unknown'}`,`Tasks: ${result.tasks.completed}/${result.tasks.total}`,`Quality: ${result.quality?.status||'missing'}${result.quality?.stale?' (stale)':''}`,`Efficiency: ${result.efficiency?.lane||'unknown'}/${result.efficiency?.status||'missing'}`,`Next: ${result.next.action||'none'} — ${result.next.reason}`,result.next.warning?`Warning: ${result.next.warning.message}`:null].filter(Boolean).join('\n');
 }
 if(command.type==='context'){
  const state=result.state,context=result.context;
  return [`Change: ${state.changeId}`,`Stage: ${state.stage}/${state.status}`,`Context hash: ${result.contextHash}`,`Affected paths: ${(context.instarReferences?.applicability?.paths||[]).join(', ')||'none declared'}`,`Applicable mandatory standards: ${(context.projectArchitecture?.applicableStandards?.mandatoryEntries||[]).map(item=>item.id).join(', ')||'none'}`,`Baseline rules: ${context.projectBaseline?.rules?.length||0}`,`Reuse candidates: ${context.codeReuse?.capabilities?.length||0}`,`Next: ${result.efficiencySummary?.status||'efficiency telemetry missing'}`].join('\n');
 }
 if(command.type==='workflow'){
  if(command.command.startsWith('standards')){
   if(command.command==='standards-check')return `Standards compliance: ${result.status}\nRequired: ${(result.compliance?.required||[]).join(', ')||'none'}`;
   return [`Standards roots: ${(result.catalog?.roots||[]).join(', ')||'none'}`,`Manifest: ${result.catalog?.manifestPath||'none'}`,`Files: ${result.catalog?.files?.length||0}`,`Applicable rules: ${(result.applicable?.entries||[]).map(item=>item.id).join(', ')||'none'}`,`Conflict status: ${result.applicable?.conflictStatus||'NONE'}`,...(result.applicable?.conflicts||[]).map(item=>`Conflict ${item.id}: ${item.status} — ${item.resolution}`),`Applicable fingerprint: ${result.applicable?.fingerprint||'none'}`].join('\n');
  }
  if(command.command==='find'){
   if(result.capabilities)return [`Reuse state: ${result.state||'unknown'}`,`Candidates: ${result.candidates?.length??result.capabilities.length}`,...(result.candidates||result.capabilities).slice(0,10).map(item=>`- ${item.id||item.name||item.path}: ${item.summary||item.description||''}`)].join('\n');
   if(result.catalog)return [`Standards files: ${result.catalog.files.length}`,`Applicable rules: ${(result.applicable?.entries||[]).map(item=>item.id).join(', ')||'none'}`,`Fingerprint: ${result.applicable?.fingerprint||'none'}`].join('\n');
   return `Project context: baseline ${result.baseline?.rules?.length||0} rule(s), standards ${result.standards?.entries?.length||0} entry/entries`;
  }
  return [`Action: ${command.command}`,`Stage: ${result.stage||'unknown'}`,`Status: ${result.status||'unknown'}`,`Version: ${result.version??'unknown'}`].join('\n');
 }
 return JSON.stringify(payload,null,2);
}

function helpOutput(topic=null){
 const command=topic?.split(' ')[0];
 const specific={
  flow:'Usage: instar flow status|next|context|start|action [options]\n  start requires --change and --document; mutating actions support --dry-run.\n  context supports --resume; status/next accept --change and --json/--brief.',
  doc:'Usage: instar doc show [--kind prd|proposal|spec|design|tasks|all] [--change <id>]\n  --json returns paths and text; --brief returns paths and byte counts.',
  find:'Usage: instar find reuse|standards|architecture|spec [options]\n  reuse requires --query; standards accepts repeated --path; spec accepts repeated --scope.',
  standards:'Usage: instar standards context|check [options]\n  context accepts repeated --path; check requires --document <file|->.',
  cost:'Usage: instar cost show [--change <id>] | cost lanes\n  --json returns full budgets; --brief returns one compact line per lane.',
  explain:'Usage: instar explain [--json]\n  Explains standards precedence, cost lanes and convenience commands.',
 }[command];
 return {text:[
  ...(specific?[specific,'']:[]),
  'InStar convenience commands:',
  '  instar flow status|next [--change <id>] [--json|--brief]',
  '  instar flow context [--change <id>] [--json]',
  '  instar flow start --change <id> --document <file|-> [--lane micro|quick|fast|standard|regulated] [--affected <path>] [--dry-run]',
  '  instar flow action <action> [--input <request.json>] [--document <file>] [--dry-run]',
  '  instar doc show [--kind prd|proposal|spec|design|tasks|all] [--change <id>]',
  '  instar find reuse --query <text> | find standards [--path <path>] [--changed] | find architecture | find spec [--scope <path>]',
  '  instar standards context [--path <path>] | standards check --document <file|->',
  '  instar cost show [--change <id>] | cost lanes',
  '  instar explain',
  'All JSON/file commands remain available; use --json for machine-readable output and --brief for compact text.',
  'Run instar <command> --help for command-specific guidance.'].join('\n')};
}

function explainOutput(){
 return {text:[
  'Design and implementation follow project-owned rules first: AGENTS.md, configured/discovered architecture and design documents, project standards/, then InStar advisory references.',
  'Project standards are discovered from <project>/standards or .instar-quality.json context.standards; standards/index.json marks mandatory rules and appliesTo globs.',
  'A mandatory applicable rule must appear in the technical design Compliance Matrix and in Review standardsReferences. Advisory rules never become BLOCK by themselves.',
  'Applicable-standard fingerprints only cover matching rules, so unrelated standards edits do not force unrelated design reopening.',
  'Flows are profile-driven: micro/quick for small, low-risk changes; fast is the default; standard and regulated remain risk floors for L2/L3.',
  'Discovery commands return indexed context and recommendations only; they never auto-adopt rules or rewrite project policy.',
  'Quality reports preserve missing telemetry as missing. Never treat absent metrics as zero usage or a pass.',
  'Use --json for full controller payloads and --brief for compact status. Mutating flow commands support --dry-run.'].join('\n')};
}

export async function main(args=process.argv.slice(2)){
 const json=args.includes('--json');
 try{
  const command=await parseWorkflowArgs(args);
  const payload=await execute(command);
  if(command.mode?.json||command.type==='explain'&&command.mode?.json)console.log(JSON.stringify(payload,null,command.mode.brief?0:2));
  else console.log(renderText(command,payload));
 }catch(error){
  const message=redactText(error.message);
  if(json)console.error(JSON.stringify({status:'BLOCK',error:message}));
  else console.error(`BLOCK: ${message}\nRun instar help or instar <command> --help for usage.`);
  process.exitCode=1;
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
