import {fs,path,safe,read,hash,requireText,exists,pluginRoot} from './files.mjs';
import {discoverSpecFiles} from '../openspec-min/src/utils/spec-discovery.js';
import {instructions} from '../openspec-min/src/engine/schema/index.js';
import {buildCodeFenceMask} from '../openspec-min/src/diff/parsers/code-fence.js';
import {resolveTokenSources} from '../shared/token-sources.mjs';
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
 if(kind==='implementation')return hash(await planBundle(root,state));
 if(kind==='acceptance')return hash({plan:await planBundle(root,state),tasks:await read(changeDir(root,state.changeId),'tasks.md'),verification:state.verification,taskEvidence:state.taskEvidence});
 throw Error('Unknown approval kind');
}
export async function assertApprovals(root,state,{spec=false,implementation=false}={}){
 for(const kind of ['prd',...(spec?['spec']:[]),...(implementation?['implementation']:[])]){
  if(!state.approvals[kind]||state.approvals[kind].hash!==await approvalHash(root,state,kind))throw Error(`${kind} approval missing or stale; reopen and review the changed documents`);
 }
}
export async function generationContext(root,state){
 let context;
 if(state.stage==='spec'){
  context={instruction:instructions.propose,prd:await prd(root,state),baseline:await specs(safe(root,'planning/specs')),projectArchitecture:await projectArchitecture(root,state.changeId)};
  context.instarReferences=await instarReferences(relevantReferences(context.projectArchitecture.projectTree,JSON.stringify(context),false));
  try{const bundle=await specBundle(root,state);context.current={proposal:bundle.proposal,specs:bundle.specs};}catch(e){if(e.code!=='ENOENT')throw e;}
 }else if(state.stage==='design'||state.stage==='tasks'){
  context={...await specBundle(root,state),instruction:instructions[state.stage]};
  context.projectArchitecture=await projectArchitecture(root,state.changeId);
  context.instarReferences=await instarReferences(relevantReferences(context.projectArchitecture.projectTree,JSON.stringify(context),true));
  const constraintsHash=hash(context.projectArchitecture.guidance),standardsHash=hash(context.projectArchitecture.standards);
  if(state.stage==='tasks'&&(!state.designConstraintsHash||!state.designStandardsHash||!state.designInStarReferencesHash))throw Error('Technical design context fingerprints are missing; reopen design and review it again');
  if(state.stage==='tasks'&&state.designConstraintsHash!==constraintsHash)throw Error('Project architecture guidance changed after technical design; reopen design and review it again');
  if(state.stage==='tasks'&&state.designStandardsHash!==standardsHash)throw Error('Project standards changed after technical design; reopen design and review it again');
  if(state.stage==='tasks'&&state.designInStarReferencesHash!==context.instarReferences.fingerprint)throw Error('InStar reference guidance changed after technical design; reopen design and review it again');
  if(state.stage==='tasks')context.technicalDesign=await technicalDesign(root,changeDir(root,state.changeId));
 }else throw Error('Generation context is available only in spec, design or tasks stage');
 return {stage:state.stage,context,contextHash:hash({project:root,changeId:state.changeId,version:state.version,context})};
}
async function instarReferences(files){
 const documents={};
 for(const relative of files){const file=path.resolve(pluginRoot,relative);if(!file.startsWith(pluginRoot+path.sep))throw Error('Invalid InStar reference path');documents[relative]=await fs.readFile(file,'utf8');}
 return {precedence:'recommendation; user requirements and project-owned instructions take precedence',documents,fingerprint:hash(documents)};
}
function relevantReferences(projectTree,taskContext,includeDesign){
 const files=['standards/README.md','standards/architecture/overview.md'];
 if(includeDesign)files.push('standards/architecture/module-boundaries.md','standards/architecture/dependency-direction.md','design-system/DESIGN.md','design-system/rules/visual-language.md','design-system/rules/components-and-interaction.md','design-system/rules/layout-and-responsive.md','design-system/rules/accessibility.md','design-system/rules/theming.md','design-system/rules/tokens.md','design-system/rules/review-checklist.md','design-system/themes/enterprise.md','design-system/themes/wholesale.md','design-system/themes/dark.md');
 const tree=projectTree.toLowerCase(),text=taskContext.toLowerCase();
 const stack=tree+'\n'+text;
 const add=(condition,...references)=>{if(condition)files.push(...references)};
 add(/\.(tsx?|mts|cts)\b|typescript/.test(stack),'standards/languages/typescript.md');
 add(/\.(jsx?|mjs|cjs)\b|javascript|node\.js/.test(stack),'standards/languages/javascript.md');
 add(/\.py\b|pyproject\.toml|python/.test(stack),'standards/languages/python.md');
 add(/\.go\b|go\.mod|golang/.test(stack),'standards/languages/go.md');
 add(/\.java\b|pom\.xml|build\.gradle|java\b/.test(stack),'standards/languages/java.md');
 add(/\.rs\b|cargo\.toml|rust/.test(stack),'standards/languages/rust.md');
 add(/\.vue\b|vue\s*3/.test(stack),'standards/vue/vue3.md');
 add(/api|endpoint|http|openapi|webhook|接口|服务端/.test(stack),'standards/api/DESIGN.md','standards/api/SECURITY.md');
 add(/database|postgres|mysql|sqlite|sql\b|migration|schema|query|数据库|数据表|迁移|持久化/.test(stack),'standards/database/DESIGN.md','standards/database/MIGRATIONS.md');
 add(/postgres/.test(stack),'standards/database/postgresql.md');
 add(/security|auth|credential|permission|authorization|安全|鉴权|认证|权限/.test(stack),'standards/common/security.md');
 add(/test|testing|coverage|spec\b|验收|测试/.test(stack),'standards/common/testing.md');
 return [...new Set(files)];
}
async function projectArchitecture(root,changeId){
 const excluded=new Set(['.git','node_modules','dist','build','coverage','.workflow','.next','.nuxt','vendor']);
 const guidance={},standards={};
 let configured={};
 try{if(await exists(safe(root,'.instar-quality.json'))){const config=JSON.parse(await read(root,'.instar-quality.json'));configured=config.context||{};}}catch(error){if(error.code!=='ENOENT')throw error;}
 async function choose(key,defaults){if(typeof configured[key]==='string')return configured[key];for(const file of defaults)if(await exists(safe(root,file)))return file;return null;}
 const architecture=await choose('architecture',['ARCHITECTURE.md','docs/engineering/ARCHITECTURE.md','docs/architecture/ARCHITECTURE.md','docs/architecture.md','.context/ARCHITECTURE.md']);
 const design=await choose('design',['DESIGN.md','docs/engineering/DESIGN.md','docs/design/DESIGN.md','docs/design.md','.context/DESIGN.md']);
 const tokenResolution=await resolveTokenSources(root,configured.tokens);
 if(tokenResolution.problems.length)throw Error(`Invalid project Token source: ${tokenResolution.problems.map(item=>`${item.path} (${item.status})`).join(', ')}`);
 const tokenPaths=tokenResolution.sources;
 const candidates=[...new Set(['AGENTS.md','.context/AGENTS.md','planning/AGENTS.md','planning/changes/AGENTS.md',`planning/changes/${changeId}/AGENTS.md`,architecture,design,...tokenPaths].filter(Boolean))];
 async function readPolicy(file){let full=root;const parts=file.split('/');try{for(let i=0;i<parts.length;i++){full=path.join(full,parts[i]);const stat=await fs.lstat(full);if(stat.isSymbolicLink())throw Error(`Symlink policy source is not allowed: ${file}`);if(i<parts.length-1&&!stat.isDirectory())throw Error(`Policy source parent is not a directory: ${file}`);if(i===parts.length-1&&!stat.isFile())throw Error(`Policy source must be a regular file: ${file}`);}safe(root,file);return await fs.readFile(full,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 for(const file of candidates){const text=await readPolicy(file);if(text!==null)guidance[file]=text;}
 let count=0,scanned=0;const lines=[];
 let guidanceCount=0,standardBytes=0,standardsTruncated=false,guidanceTruncated=false,treeTruncated=false,standardsDirectoryPresent=false;
 async function walk(dir,depth){if(depth>8){treeTruncated=true;if(dir==='standards'||dir.startsWith('standards/'))standardsTruncated=true;return;}if(scanned>=2000){treeTruncated=true;return;}let entries;try{entries=await fs.readdir(safe(root,dir),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){if(excluded.has(entry.name))continue;scanned++;const relative=dir?`${dir}/${entry.name}`:entry.name;if(entry.isSymbolicLink()){if(entry.name==='AGENTS.md'||relative==='standards')throw Error(`Symlink policy source is not allowed: ${relative}`);if(count<250){count++;lines.push(`${'  '.repeat(depth)}[symlink omitted] ${relative}`);}continue;}if(relative==='standards'&&entry.isDirectory())standardsDirectoryPresent=true;if(entry.name==='AGENTS.md'&&guidanceCount<40&&!Object.hasOwn(guidance,relative)){const text=await readPolicy(relative);if(text!==null){guidance[relative]=text.length>12000?`${text.slice(0,12000)}\n[truncated; inspect full file before finalizing]`:text;guidanceTruncated ||= text.length>12000;guidanceCount++;}}if(relative.startsWith('standards/')&&entry.isFile()&&/\.(md|mdx|json|ya?ml)$/i.test(entry.name)){if(Object.keys(standards).length>=100||standardBytes>=160000){standardsTruncated=true;}else{const text=await readPolicy(relative);if(text!==null){const remaining=160000-standardBytes;standards[relative]=text.length>remaining?`${text.slice(0,remaining)}\n[truncated; inspect full file before finalizing]`:text;standardBytes+=text.length;if(text.length>remaining)standardsTruncated=true;}}}if(entry.name.startsWith('.'))continue;if(count<250){count++;lines.push(`${'  '.repeat(depth)}${entry.isDirectory()?'[dir] ':'      '}${relative}`);}if(entry.isDirectory())await walk(relative,depth+1);if(scanned>=2000){treeTruncated=true;break;}}}
 await walk('',0);guidanceTruncated ||= guidanceCount>=40;return {guidance,standards,tokenSources:tokenPaths.filter(file=>Object.hasOwn(guidance,file)),tokenResolution,availableSources:[...Object.keys(guidance),...Object.keys(standards)],absentSources:candidates.filter(file=>!Object.hasOwn(guidance,file)),standardsDirectoryPresent,projectTree:lines.join('\n'),treeTruncated:treeTruncated||count>=250,standardsTruncated,guidanceTruncated};
}
export function report(input){
 if(!input||typeof input!=='object')throw Error('report is required');requireText(input.summary,'report.summary');requireText(input.source,'report.source');
 if(!Array.isArray(input.issues)||!Array.isArray(input.unverified))throw Error('report needs issues and unverified arrays');
 for(const issue of input.issues){if(!['critical','warning','suggestion'].includes(issue.severity))throw Error('Invalid issue severity');requireText(issue.message,'issue.message');}
 for(const reason of input.unverified)requireText(reason,'unverified reason');return structuredClone(input);
}
