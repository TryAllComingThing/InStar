import {fs,path,safe,read,hash,requireText,exists} from './files.mjs';
import {discoverSpecFiles} from '../openspec-min/src/utils/spec-discovery.js';
import {instructions} from '../openspec-min/src/engine/schema/index.js';
import {buildCodeFenceMask} from '../openspec-min/src/diff/parsers/code-fence.js';
import {resolveTokenSources} from '../shared/token-sources.mjs';
import {baselineContext} from '../shared/project-baseline.mjs';
import {reuseContext} from '../shared/code-reuse.mjs';
import {selectStandards} from '../shared/standards-index.mjs';
export const legacyStandardReferencePaths=['standards/api/DESIGN.md','standards/database/DESIGN.md','standards/languages/typescript.md'];
export async function specs(root){const result={};for(const item of await discoverSpecFiles(root))result[item.id]=await fs.readFile(item.specFile,'utf8');return result;}
export const changeDir=(root,id)=>safe(root,'planning','changes',id);
export async function prd(root,state){return read(root,state.prdPath);}
export async function specBundle(root,state){const dir=changeDir(root,state.changeId);return {prd:await prd(root,state),proposal:await read(dir,'proposal.md'),specs:await specs(safe(dir,'specs')),baseline:await specs(safe(root,'planning/specs'))};}
export async function technicalDesign(root,dir){const current=await exists(safe(dir,'technical-design.md')),legacy=await exists(safe(dir,'design.md'));if(current&&legacy)throw Error('Both technical-design.md and legacy design.md exist; resolve the duplicate before continuing');return read(dir,current?'technical-design.md':'design.md');}
export async function planBundle(root,state){const dir=changeDir(root,state.changeId);return {...await specBundle(root,state),design:await technicalDesign(root,dir),tasks:(await read(dir,'tasks.md')).replace(/^- \[[ xX]\]/gm,'- [ ]'),...(state.designConstraintsHash?{designConstraintsHash:state.designConstraintsHash}:{}),...(state.designStandardsHash?{designStandardsHash:state.designStandardsHash}:{}),...(state.designInStarReferencesHash?{designInStarReferencesHash:state.designInStarReferencesHash}:{})};}
export function taskItems(document){const lines=document.split('\n'),mask=buildCodeFenceMask(lines);const result=[];const ids=new Set();for(let i=0;i<lines.length;i++){
 if(mask[i])continue;const line=lines[i];if(/^\s*[-*+] \[/.test(line)){
  const m=line.match(/^- \[([ xX])\] (\d+\.\d+) (\S.*)$/);if(!m||ids.has(m[2]))throw Error('Malformed or duplicate numbered task');ids.add(m[2]);result.push({id:m[2],done:m[1]!==' ',line:i,description:m[3]});
 }}if(!result.length)throw Error('Task list is empty');return result;}
export async function approvalHash(root,state,kind){
 if(kind==='prd')return hash(await prd(root,state));
 if(kind==='spec')return hash(await specBundle(root,state));
 if(kind==='implementation')return hash({plan:await planBundle(root,state),baseline:(await baselineContext(root,state.affectedPaths||[])).fingerprint,reusePlan:state.reuseDecisions||[],designReuseHash:state.designReuseHash??null});
 if(kind==='acceptance')return hash({plan:await planBundle(root,state),tasks:await read(changeDir(root,state.changeId),'tasks.md'),verification:state.verification,taskEvidence:state.taskEvidence});
 throw Error('Unknown approval kind');
}
export async function assertApprovals(root,state,{spec=false,implementation=false}={}){
 for(const kind of ['prd',...(spec?['spec']:[]),...(implementation?['implementation']:[])]){
  if(!state.approvals[kind]||state.approvals[kind].hash!==await approvalHash(root,state,kind))throw Error(`${kind} approval missing or stale; reopen and review the changed documents`);
 }
}
export async function generationContext(root,state,{knownContextHash=null}={}){
 let context;
 if(state.stage==='spec'){
  context={instruction:instructions.propose,prd:await prd(root,state),baseline:await specs(safe(root,'planning/specs')),projectArchitecture:await projectArchitecture(root,state.changeId,state.affectedPaths||[])};
  const referenceContext={...context};delete referenceContext.instruction;delete referenceContext.technicalDesign;
  context.instarReferences=await selectStandards({affectedPaths:state.affectedPaths||[],context:JSON.stringify(referenceContext),projectTree:context.projectArchitecture.projectTree,stage:state.stage});
  try{const bundle=await specBundle(root,state);context.current={proposal:bundle.proposal,specs:bundle.specs};}catch(e){if(e.code!=='ENOENT')throw e;}
 }else if(state.stage==='design'||state.stage==='tasks'){
  context={...await specBundle(root,state),instruction:instructions[state.stage]};
  context.projectArchitecture=await projectArchitecture(root,state.changeId,state.affectedPaths||[]);
  const referenceContext={...context};delete referenceContext.instruction;delete referenceContext.technicalDesign;
  context.instarReferences=await selectStandards({affectedPaths:state.affectedPaths||[],context:JSON.stringify(referenceContext),projectTree:context.projectArchitecture.projectTree,stage:'design'});
  const constraintsHash=context.projectArchitecture.guidanceFingerprint,standardsHash=hash(context.projectArchitecture.standards);
  if(state.stage==='tasks'&&(!state.designConstraintsHash||!state.designStandardsHash||!state.designInStarReferencesHash))throw Error('Technical design context fingerprints are missing; reopen design and review it again');
  if(state.stage==='tasks'&&state.designConstraintsHash!==constraintsHash)throw Error('Project architecture guidance changed after technical design; reopen design and review it again');
  if(state.stage==='tasks'&&state.designStandardsHash!==standardsHash)throw Error('Project standards changed after technical design; reopen design and review it again');
  if(state.stage==='tasks'&&state.designInStarReferencesHash!==context.instarReferences.fingerprint)throw Error('InStar reference guidance changed after technical design; reopen design and review it again');
  if(state.stage==='tasks')context.technicalDesign=await technicalDesign(root,changeDir(root,state.changeId));
 }else throw Error('Generation context is available only in spec, design or tasks stage');
 context.projectBaseline=await baselineContext(root,state.affectedPaths||[]);
 context.codeReuse=await reuseContext(root);
 if(state.stage==='tasks'&&(state.designReuseHash??null)!==context.codeReuse.fingerprint)throw Error('Capability sources changed; reopen design');
 if(state.stage==='tasks'&&(state.designBaselineHash??null)!==context.projectBaseline.fingerprint)throw Error('Project baseline changed; reopen design');
 const contextHash=hash({project:root,changeId:state.changeId,version:state.version,context});
 if(knownContextHash!==null){
  if(typeof knownContextHash!=='string'||!knownContextHash)throw Error('knownContextHash must be a nonempty string');
  if(knownContextHash===contextHash)return {stage:state.stage,contextHash,contextDiff:{basis:'contextHash',unchanged:true,changed:false,fullContextOmitted:true}};
  return {stage:state.stage,context,contextHash,contextDiff:{basis:'contextHash',unchanged:false,changed:true,fullContextIncluded:true}};
 }
 return {stage:state.stage,context,contextHash};
}
const AGENTS_MAX_FILES=40,AGENTS_FILE_MAX_BYTES=12*1024,AGENTS_TOTAL_MAX_BYTES=48*1024,AGENTS_TRUNCATION_MARKER='\n[truncated; inspect full file before finalizing]';
function truncateUtf8(value,maxBytes){
 let low=0,high=Math.min(value.length,maxBytes);
 while(low<high){const middle=Math.ceil((low+high)/2);if(Buffer.byteLength(value.slice(0,middle))<=maxBytes)low=middle;else high=middle-1;}
 return value.slice(0,low);
}
function boundedAgentsText(text,maxBytes){
 const originalBytes=Buffer.byteLength(text);
 if(originalBytes<=maxBytes)return {text,bytes:originalBytes,truncated:false};
 const markerBytes=Buffer.byteLength(AGENTS_TRUNCATION_MARKER);
 if(maxBytes<=markerBytes)return null;
 const body=truncateUtf8(text,maxBytes-markerBytes);
 return {text:`${body}${AGENTS_TRUNCATION_MARKER}`,bytes:Buffer.byteLength(body)+markerBytes,truncated:true};
}
function agentsPriority(file,affectedPaths,changeId){
 if(file==='AGENTS.md')return [2,0];
 if(file===`planning/changes/${changeId}/AGENTS.md`)return [1,10000];
 const directory=path.posix.dirname(file),depth=directory==='.'?0:directory.split('/').length;
 let relation=0;
 for(const affected of affectedPaths){const normalized=String(affected).replaceAll('\\','/');if(normalized===directory||normalized.startsWith(`${directory}/`))relation=Math.max(relation,depth);}
 return relation?[1,relation*100+depth]:[0,-depth];
}
async function projectArchitecture(root,changeId,affectedPaths=[]){
 const excluded=new Set(['.git','node_modules','dist','build','coverage','.workflow','.instar','reports','logs','planning','.next','.nuxt','vendor']);
 const guidance={},standards={};
 let configured={};
 try{if(await exists(safe(root,'.instar-quality.json'))){const config=JSON.parse(await read(root,'.instar-quality.json'));configured=config.context||{};}}catch(error){if(error.code!=='ENOENT')throw error;}
 async function choose(key,defaults){if(typeof configured[key]==='string')return configured[key];for(const file of defaults)if(await exists(safe(root,file)))return file;return null;}
 const architecture=await choose('architecture',['ARCHITECTURE.md','docs/engineering/ARCHITECTURE.md','docs/architecture/ARCHITECTURE.md','docs/architecture.md','.context/ARCHITECTURE.md']);
 const design=await choose('design',['DESIGN.md','docs/engineering/DESIGN.md','docs/design/DESIGN.md','docs/design.md','.context/DESIGN.md']);
 const tokenResolution=await resolveTokenSources(root,configured.tokens);
 if(tokenResolution.problems.length)throw Error(`Invalid project Token source: ${tokenResolution.problems.map(item=>`${item.path} (${item.status})`).join(', ')}`);
 const tokenPaths=tokenResolution.sources;
 const explicitAgents=['AGENTS.md','.context/AGENTS.md','planning/AGENTS.md','planning/changes/AGENTS.md',`planning/changes/${changeId}/AGENTS.md`];
 const policySources=[architecture,design,...tokenPaths].filter(Boolean);
 const candidates=[...new Set([...explicitAgents,...policySources])];
 async function readPolicy(file){let full=root;const parts=file.split('/');try{for(let i=0;i<parts.length;i++){full=path.join(full,parts[i]);const stat=await fs.lstat(full);if(stat.isSymbolicLink())throw Error(`Symlink policy source is not allowed: ${file}`);if(i<parts.length-1&&!stat.isDirectory())throw Error(`Policy source parent is not a directory: ${file}`);if(i===parts.length-1&&!stat.isFile())throw Error(`Policy source must be a regular file: ${file}`);}safe(root,file);return await fs.readFile(full,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 for(const file of policySources){const text=await readPolicy(file);if(text!==null)guidance[file]=text;}
 const agentsFiles=new Set(explicitAgents);
 let count=0,scanned=0;const lines=[];
 let standardBytes=0,standardsTruncated=false,treeTruncated=false,standardsDirectoryPresent=false;
 async function walk(dir,depth){
  if(depth>8){treeTruncated=true;if(dir==='standards'||dir.startsWith('standards/'))standardsTruncated=true;return;}
  if(scanned>=2000){treeTruncated=true;return;}
  let entries;try{entries=await fs.readdir(safe(root,dir),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(excluded.has(entry.name))continue;
   scanned++;const relative=dir?`${dir}/${entry.name}`:entry.name;
   if(entry.isSymbolicLink()){
    if(entry.name==='AGENTS.md'||relative==='standards')throw Error(`Symlink policy source is not allowed: ${relative}`);
    if(count<250){count++;lines.push(`${'  '.repeat(depth)}[symlink omitted] ${relative}`);}continue;
   }
   if(relative==='standards'&&entry.isDirectory())standardsDirectoryPresent=true;
   if(entry.name==='AGENTS.md')agentsFiles.add(relative);
   if(relative.startsWith('standards/')&&entry.isFile()&&/\.(md|mdx|json|ya?ml)$/i.test(entry.name)){
    if(Object.keys(standards).length>=100||standardBytes>=160000)standardsTruncated=true;
    else{const body=await readPolicy(relative);if(body!==null){const bytes=Buffer.byteLength(body);standards[relative]={path:relative,bytes,hash:hash(body),inlined:false};standardBytes+=bytes;if(standardBytes>=160000)standardsTruncated=true;}}
   }
   if(entry.name.startsWith('.'))continue;
   if(count<250){count++;lines.push(`${'  '.repeat(depth)}${entry.isDirectory()?'[dir] ':'      '}${relative}`);}
   if(entry.isDirectory())await walk(relative,depth+1);
   if(scanned>=2000){treeTruncated=true;break;}
  }
 }
 await walk('',0);
 let guidanceCount=0,guidanceBytes=0,guidanceTruncated=false;
 const includedAgents=[],omittedAgents=[];
 const orderedAgents=[...agentsFiles].sort((left,right)=>{const [leftGroup,leftScore]=agentsPriority(left,affectedPaths,changeId),[rightGroup,rightScore]=agentsPriority(right,affectedPaths,changeId);return rightGroup-leftGroup||rightScore-leftScore||left.localeCompare(right);});
 for(const file of orderedAgents){
  if(guidanceCount>=AGENTS_MAX_FILES){omittedAgents.push({path:file,reason:'file-count-cap'});guidanceTruncated=true;continue;}
  const text=await readPolicy(file);if(text===null)continue;
  const originalBytes=Buffer.byteLength(text),remaining=AGENTS_TOTAL_MAX_BYTES-guidanceBytes,maxBytes=Math.min(AGENTS_FILE_MAX_BYTES,remaining),bounded=boundedAgentsText(text,maxBytes);
  if(!bounded){omittedAgents.push({path:file,reason:'total-byte-cap'});guidanceTruncated=true;continue;}
  guidance[file]=bounded.text;guidanceCount++;guidanceBytes+=bounded.bytes;
  const truncated=originalBytes>bounded.bytes,reason=truncated?(originalBytes>AGENTS_FILE_MAX_BYTES&&maxBytes===AGENTS_FILE_MAX_BYTES?'file-byte-cap':'total-byte-cap'):null;
  guidanceTruncated ||= truncated;
  includedAgents.push({path:file,originalBytes,bytes:bounded.bytes,truncated,...(reason?{reason}:{})});
 }
 const guidanceBudget={maxFiles:AGENTS_MAX_FILES,maxFileBytes:AGENTS_FILE_MAX_BYTES,maxTotalBytes:AGENTS_TOTAL_MAX_BYTES,totalBytes:guidanceBytes,included:includedAgents,omitted:omittedAgents.slice(0,AGENTS_MAX_FILES),omittedCount:omittedAgents.length,truncated:guidanceTruncated};
 return {guidance,guidanceBudget,guidanceFingerprint:hash({guidance,guidanceBudget}),standards,standardDetailPolicy:'Project standards are indexed by path, byte count and content hash. Read a standard on demand only when it applies to the current task.',tokenSources:tokenPaths.filter(file=>Object.hasOwn(guidance,file)),tokenResolution,availableSources:[...Object.keys(guidance),...Object.keys(standards)],absentSources:candidates.filter(file=>!Object.hasOwn(guidance,file)),standardsDirectoryPresent,projectTree:lines.join('\n'),treeTruncated:treeTruncated||count>=250,standardsTruncated,guidanceTruncated};
}
export function report(input){
 if(!input||typeof input!=='object')throw Error('report is required');requireText(input.summary,'report.summary');requireText(input.source,'report.source');
 if(!Array.isArray(input.issues)||!Array.isArray(input.unverified))throw Error('report needs issues and unverified arrays');
 for(const issue of input.issues){if(!['critical','warning','suggestion'].includes(issue.severity))throw Error('Invalid issue severity');requireText(issue.message,'issue.message');}
 for(const reason of input.unverified)requireText(reason,'unverified reason');return structuredClone(input);
}
