import {fs,path,safe,read,hash,requireText,exists,pluginRoot} from './files.mjs';
import {discoverSpecFiles} from '../openspec-min/src/utils/spec-discovery.js';
import {instructions} from '../openspec-min/src/engine/schema/index.js';
import {buildCodeFenceMask} from '../openspec-min/src/diff/parsers/code-fence.js';
import {resolveTokenSources} from '../shared/token-sources.mjs';
import {resolveDesignCheckSources} from '../shared/design-sources.mjs';
import {readBufferVerified} from '../shared/path-safety.mjs';
async function specs(root){const result={};for(const item of await discoverSpecFiles(root))result[item.id]=await read(root,path.relative(root,item.specFile));return result;}
export const changeDir=(root,id)=>safe(root,'planning','changes',id);
export async function prd(root,state){return read(root,state.prdPath);}
export async function specBundle(root,state){const dir=changeDir(root,state.changeId);return {prd:await prd(root,state),proposal:await read(dir,'proposal.md'),specs:await specs(safe(dir,'specs')),baseline:await specs(safe(root,'planning/specs'))};}
async function technicalDesign(root,dir){const current=await exists(safe(dir,'technical-design.md')),legacy=await exists(safe(dir,'design.md'));if(current&&legacy)throw Error('Both technical-design.md and legacy design.md exist; resolve the duplicate before continuing');return read(dir,current?'technical-design.md':'design.md');}
export async function compatibilityWarnings(root,state){
 const warnings=[],dir=changeDir(root,state.changeId);
 if(!await exists(safe(dir,'technical-design.md'))&&await exists(safe(dir,'design.md')))warnings.push({
  code:'legacy-design-document',
  path:`planning/changes/${state.changeId}/design.md`,
  replacement:`planning/changes/${state.changeId}/technical-design.md`,
  message:'Legacy design.md remains readable; migrate it to technical-design.md. Compatibility support is planned for removal in the next major release.'
 });
 if(Number(state.schemaVersion)<5)warnings.push({
  code:'legacy-workflow-schema',
  path:`planning/workflows/${state.changeId}.json`,
  current:state.schemaVersion,
  target:5,
  message:'Legacy workflow schema remains inspectable; run the explicit migrate action before continuing. Migration invalidates prior approvals.'
 });
 return warnings;
}
const sensitivePath=name=>/(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);
const generatedPath=name=>/(^|\/)(\.git|node_modules|\.instar|reports|logs|planning|dist|build|coverage|\.next|\.nuxt|vendor)(\/|$)/.test(name);
const documentationPath=name=>/(^|\/)(docs|documentation|\.github)(\/|$)/.test(name)||/\.(?:md|mdx|rst)$/i.test(name);
async function boundDesignReuse(root,items){
 if(!Array.isArray(items))return items;
 return Promise.all(items.map(async item=>({...item,...(item.path?{contentHash:hash(await readBufferVerified(root,item.path))}:{contentHash:null})})));
}
async function currentGovernance(root,state){
 const bundle=await specBundle(root,state),architecture=await projectArchitecture(root,state.changeId);
 const include=state.ui&&(state.stack==='frontend'||state.stack==='fullstack');
 const hasProject={design:architecture.design,designSystem:architecture.designSystem,directory:architecture.designSystemDirectory,tokens:architecture.tokens?.length};
 const mode=include?(hasProject.design||hasProject.designSystem||hasProject.directory||hasProject.tokens?'quality':'bootstrap'):false;
 const references=architecture.emptyProject?emptyReferences('empty-project'):await instarReferences(relevantReferences(selectableProjectTree(architecture.projectTree),referenceSignals({...bundle,current:{proposal:bundle.proposal,specs:bundle.specs}}),mode));
 return {constraintsHash:hash(architecture.guidance),standardsHash:hash(architecture.standards),referencesHash:references.fingerprint};
}
async function planBundle(root,state){
 const dir=changeDir(root,state.changeId),governance=await currentGovernance(root,state);
 return {...await specBundle(root,state),design:await technicalDesign(root,dir),tasks:(await read(dir,'tasks.md')).replace(/^- \[[ xX]\]/gm,'- [ ]'),designConstraintsHash:governance.constraintsHash,designStandardsHash:governance.standardsHash,designInStarReferencesHash:governance.referencesHash,...(state.designReuse?{designReuse:await boundDesignReuse(root,state.designReuse)}:{})};
}
export function taskItems(document){const lines=document.split('\n'),mask=buildCodeFenceMask(lines);const result=[];const ids=new Set();for(let i=0;i<lines.length;i++){
 if(mask[i])continue;const line=lines[i];if(/^\s*[-*+] \[/.test(line)){
  const m=line.match(/^- \[([ xX])\] (\d+\.\d+) (\S.*)$/);if(!m||ids.has(m[2]))throw Error('Malformed or duplicate numbered task');ids.add(m[2]);result.push({id:m[2],done:m[1]!==' ',line:i,description:m[3]});
 }}if(!result.length)throw Error('Task list is empty');return result;}
export async function approvalHash(root,state,kind){
 if(kind==='prd')return hash(await prd(root,state));
 if(kind==='spec')return hash(await specBundle(root,state));
 if(kind==='design'){
  const designCheck=state.designCheck?{constraints:state.designCheck.constraints,coverage:state.designCheck.coverage||null,sources:await resolveDesignCheckSources(root,state.designCheck.sources,{inferLegacy:true}),at:state.designCheck.at}:null;
  const governance=await currentGovernance(root,state);
  return hash({design:await technicalDesign(root,changeDir(root,state.changeId)),designCheck,designConstraintsHash:governance.constraintsHash,designStandardsHash:governance.standardsHash,designInStarReferencesHash:governance.referencesHash,...(state.designReuse?{designReuse:await boundDesignReuse(root,state.designReuse)}:{})});
 }
 if(kind==='tasks'){const governance=await currentGovernance(root,state);return hash({design:await technicalDesign(root,changeDir(root,state.changeId)),tasks:(await read(changeDir(root,state.changeId),'tasks.md')).replace(/^- \[[ xX]\]/gm,'- [ ]'),designConstraintsHash:governance.constraintsHash,designStandardsHash:governance.standardsHash,designInStarReferencesHash:governance.referencesHash,...(state.designReuse?{designReuse:await boundDesignReuse(root,state.designReuse)}:{})});}
 if(kind==='implementation'){
  if(state.schemaVersion>=5)return hash({plan:await planBundle(root,state),tasks:await read(changeDir(root,state.changeId),'tasks.md'),taskEvidence:state.taskEvidence,implementationReview:state.implementationReview||null});
  return hash(await planBundle(root,state));
 }
 if(kind==='acceptance')return hash({plan:await planBundle(root,state),tasks:await read(changeDir(root,state.changeId),'tasks.md'),verification:state.verification,taskEvidence:state.taskEvidence});
 throw Error('Unknown approval kind');
}
export async function assertApprovals(root,state,{spec=false,design=false,tasks=false,implementation=false}={}){
 for(const kind of ['prd',...(spec?['spec']:[]),...(design?['design']:[]),...(tasks?['tasks']:[]),...(implementation?['implementation']:[])]){
  if(!state.approvals[kind]||state.approvals[kind].hash!==await approvalHash(root,state,kind))throw Error(`${kind} approval missing or stale; reopen and review the changed documents`);
 }
}
export async function generationContext(root,state){
 let context;
 if(state.stage==='spec'){
  context={instruction:instructions.propose,prd:await prd(root,state),baseline:await specs(safe(root,'planning/specs')),projectArchitecture:await projectArchitecture(root,state.changeId)};
  context.emptyProject=context.projectArchitecture.emptyProject;
  context.explorationSkipped=context.emptyProject;
  context.instarReferences=context.emptyProject?emptyReferences('empty-project'):await instarReferences(relevantReferences(selectableProjectTree(context.projectArchitecture.projectTree),referenceSignals(context),false));
  try{const bundle=await specBundle(root,state);context.current={proposal:bundle.proposal,specs:bundle.specs};}catch(e){if(e.code!=='ENOENT')throw e;}
 }else if(state.stage==='design'||state.stage==='tasks'){
  context={...await specBundle(root,state),instruction:instructions[state.stage]};
  context.projectArchitecture=await projectArchitecture(root,state.changeId);
  context.emptyProject=context.projectArchitecture.emptyProject;
  context.explorationSkipped=context.emptyProject;
  const includeDesignReferences=state.ui&&(state.stack==='frontend'||state.stack==='fullstack');
  const hasProjectDesignSources=Boolean(context.projectArchitecture.design||context.projectArchitecture.designSystem||context.projectArchitecture.designSystemDirectory||context.projectArchitecture.tokens?.length);
  const designReferenceMode=includeDesignReferences?(hasProjectDesignSources?'quality':'bootstrap'):false;
  context.designReferenceMode=designReferenceMode;
  context.designWarnings=includeDesignReferences&&context.projectArchitecture.designSystemDirectory&&!context.projectArchitecture.designSystem?[{
   code:'project-design-system-manifest-missing',
   directory:context.projectArchitecture.designSystemDirectory,
   message:'A project design-system directory was found without a manifest. Configure context.designSystem or add DESIGN.md, README.md, or index.md so designCheck can bind the project-owned source.',
   suggestion:'Set context.designSystem in .instar-quality.json to the project-owned manifest.'
  }]:[];
  if(state.stage==='tasks')context.technicalDesign=await technicalDesign(root,changeDir(root,state.changeId));
  context.instarReferences=context.emptyProject?emptyReferences('empty-project'):await instarReferences(relevantReferences(selectableProjectTree(context.projectArchitecture.projectTree),referenceSignals(context),designReferenceMode));
  const constraintsHash=hash(context.projectArchitecture.guidance),standardsHash=hash(context.projectArchitecture.standards);
  if(state.stage==='tasks'&&(!state.designConstraintsHash||!state.designStandardsHash||!state.designInStarReferencesHash))throw Error('Technical design context fingerprints are missing; reopen design and review it again');
  if(state.stage==='tasks'&&state.designConstraintsHash!==constraintsHash)throw Error('Project architecture guidance changed after technical design; reopen design and review it again');
  if(state.stage==='tasks'&&state.designStandardsHash!==standardsHash)throw Error('Project standards changed after technical design; reopen design and review it again');
  if(state.stage==='tasks'&&state.designInStarReferencesHash!==context.instarReferences.fingerprint)throw Error('InStar reference guidance changed after technical design; reopen design and review it again');
 }else throw Error('Generation context is available only in spec, design or tasks stage');
 return {stage:state.stage,context,contextHash:hash({project:root,changeId:state.changeId,version:state.version,context})};
}
async function instarReferences(files){
 const documents={};
 for(const relative of files){const file=path.resolve(pluginRoot,relative);if(!file.startsWith(pluginRoot+path.sep))throw Error('Invalid InStar reference path');documents[relative]=await fs.readFile(file,'utf8');}
 return {precedence:'recommendation; user requirements and project-owned instructions take precedence',documents,fingerprint:hash(documents)};
}
function emptyReferences(reason){return {precedence:'recommendation; user requirements and project-owned instructions take precedence',skipped:true,reason,documents:{},fingerprint:hash({})};}
function selectableProjectTree(projectTree){return projectTree.split('\n').filter(line=>{const relative=line.replace(/^\s*(?:\[[^\]]+\]\s*)?/,'');return relative&&!generatedPath(relative)&&!documentationPath(relative);}).join('\n');}
function referenceSignals(context){
 const currentSpecs=context.current?.specs&&typeof context.current.specs==='object'?Object.values(context.current.specs):[];
 return [
  context.prd,
  context.proposal,
  ...Object.values(context.specs||{}),
  context.current?.proposal,
  ...currentSpecs
 ].filter(value=>typeof value==='string'&&value).join('\n').toLowerCase();
}
function relevantReferences(projectTree,changeSignals,designReferenceMode){
 const files=['standards/README.md','standards/architecture/overview.md'];
 if(designReferenceMode==='bootstrap')files.push('design-guidance/DESIGN.md','design-guidance/rules/visual-language.md','design-guidance/rules/components-and-interaction.md','design-guidance/rules/layout-and-responsive.md');
 if(designReferenceMode)files.push('design-guidance/rules/accessibility.md','design-guidance/rules/tokens.md','design-guidance/rules/review-checklist.md');
 const stack=`${projectTree}\n${changeSignals}`.toLowerCase();
 const token=words=>new RegExp(`(?:^|[/\\s._-])(?:${words})(?=$|[/\\s._-])`);
 const add=(condition,...references)=>{if(condition)files.push(...references)};
 add(/\.(?:ts|tsx|mts|cts)(?=$|[/\s._-])|tsconfig(?:\.[^/\s]+)?\.json|typescript/.test(stack),'standards/languages/typescript.md');
 add(/\.(?:js|jsx|mjs|cjs)(?=$|[/\s._-])|package\.json|javascript|node\.js/.test(stack),'standards/languages/javascript.md');
 add(/\.py(?=$|[/\s._-])|pyproject\.toml|setup\.py|setup\.cfg|requirements(?:[._-][^/\s]+)?\.txt|python/.test(stack),'standards/languages/python.md');
 add(/\.go(?=$|[/\s._-])|go\.mod|golang/.test(stack),'standards/languages/go.md');
 add(/\.java(?=$|[/\s._-])|pom\.xml|build\.gradle(?:\.kts)?|java\b/.test(stack),'standards/languages/java.md');
 add(/\.rs(?=$|[/\s._-])|cargo\.toml|\brust\b/.test(stack),'standards/languages/rust.md');
 add(/\.vue(?=$|[/\s._-])|vue\s*3\b/.test(stack),'standards/languages/vue3.md');
 add(/\.(?:css|scss|sass|less)(?=$|[/\s._-])/.test(stack),'standards/languages/css.md');
 add(token('api|apis|endpoint|endpoints|http|https|openapi|swagger|webhook|webhooks').test(stack)||/接口|服务端/.test(stack),'standards/api/api.md');
 add(token('database|databases|db|migration|migrations|sql|prisma|drizzle|knex|typeorm|sequelize|orm|persistence|persistent|postgres|postgresql|mysql|sqlite').test(stack)||/\.sql(?=$|[/\s._-])|数据库|数据表|迁移|持久化/.test(stack),'standards/database/schema.md','standards/database/query.md','standards/database/MIGRATIONS.md');
 add(token('postgres|postgresql').test(stack),'standards/database/postgresql.md');
 add(token('security|auth|authentication|authorization|credential|credentials|permission|permissions|oauth|jwt|session|sessions|rbac|tenant|tenants').test(stack)||/安全|鉴权|认证|权限/.test(stack),'standards/common/security.md');
 add(token('test|tests|testing|coverage|e2e|__tests__').test(stack)||/验收|测试/.test(stack),'standards/common/testing.md');
 return [...new Set(files)];
}
async function projectArchitecture(root,changeId){
 const excluded=new Set(['.git','node_modules','dist','build','coverage','.workflow','.next','.nuxt','vendor']);
 const guidance={},standards={};
 let configured={};
 try{if(await exists(safe(root,'.instar-quality.json'))){const config=JSON.parse(await read(root,'.instar-quality.json'));configured=config.context||{};}}catch(error){if(error.code!=='ENOENT')throw error;}
 async function choose(key,defaults){if(typeof configured[key]==='string')return configured[key];for(const file of defaults)if(await exists(safe(root,file)))return file;return null;}
 for(const key of ['architecture','design','designSystem'])if(typeof configured[key]==='string'&&(sensitivePath(configured[key])||generatedPath(configured[key])))throw Error(`Project ${key} source must not be sensitive or generated: ${configured[key]}`);
 if(configured.tokens!==undefined&&configured.tokens!==null){const files=Array.isArray(configured.tokens)?configured.tokens:[configured.tokens];for(const file of files)if(typeof file==='string'&&(sensitivePath(file)||generatedPath(file)))throw Error(`Project Token source must not be sensitive or generated: ${file}`);}
 const architecture=await choose('architecture',['ARCHITECTURE.md','docs/engineering/ARCHITECTURE.md','docs/architecture/ARCHITECTURE.md','docs/architecture.md','.context/ARCHITECTURE.md']);
 const design=await choose('design',['DESIGN.md','docs/engineering/DESIGN.md','docs/design/DESIGN.md','docs/design.md','.context/DESIGN.md']);
 const designSystem=await choose('designSystem',['design-system/DESIGN.md','design-system/README.md','design-system/index.md','docs/design-system/DESIGN.md','docs/design-system/README.md','docs/design-system/index.md','frontend/design-system/DESIGN.md','frontend/design-system/README.md','frontend/design-system/index.md','frontend/src/design-system/DESIGN.md','frontend/src/design-system/README.md','frontend/src/design-system/index.md','src/design-system/DESIGN.md','src/design-system/README.md','src/design-system/index.md']);
 let designSystemDirectory=null;
 for(const dir of ['design-system','docs/design-system','frontend/design-system','frontend/src/design-system','src/design-system']){try{const stat=await fs.lstat(safe(root,dir));if(stat.isDirectory()&&!stat.isSymbolicLink()){designSystemDirectory=dir;break;}}catch(error){if(error.code!=='ENOENT')throw error;}}
 const tokenResolution=await resolveTokenSources(root,configured.tokens);
 if(tokenResolution.problems.length)throw Error(`Invalid project Token source: ${tokenResolution.problems.map(item=>`${item.path} (${item.status})`).join(', ')}`);
 const tokenPaths=tokenResolution.sources;
 const candidates=[...new Set(['AGENTS.md','.context/AGENTS.md','planning/AGENTS.md','planning/changes/AGENTS.md',`planning/changes/${changeId}/AGENTS.md`,architecture,design,designSystem,...tokenPaths].filter(Boolean))];
 async function readPolicy(file){let full=root;const parts=file.split('/');try{for(let i=0;i<parts.length;i++){full=path.join(full,parts[i]);const stat=await fs.lstat(full);if(stat.isSymbolicLink())throw Error(`Symlink policy source is not allowed: ${file}`);if(i<parts.length-1&&!stat.isDirectory())throw Error(`Policy source parent is not a directory: ${file}`);if(i===parts.length-1&&!stat.isFile())throw Error(`Policy source must be a regular file: ${file}`);}safe(root,file);return await read(root,file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 for(const file of candidates){const text=await readPolicy(file);if(text!==null)guidance[file]=text;}
 let count=0,scanned=0,sourceFileCount=0;const lines=[];
 let guidanceCount=0,standardBytes=0,standardsTruncated=false,guidanceTruncated=false,treeTruncated=false,standardsDirectoryPresent=false;
 async function walk(dir,depth){if(depth>8){treeTruncated=true;if(dir==='standards'||dir.startsWith('standards/'))standardsTruncated=true;return;}if(scanned>=2000){treeTruncated=true;return;}let entries;try{entries=await fs.readdir(safe(root,dir),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){if(excluded.has(entry.name))continue;scanned++;const relative=dir?`${dir}/${entry.name}`:entry.name;if(entry.isSymbolicLink()){if(entry.name==='AGENTS.md'||relative==='standards')throw Error(`Symlink policy source is not allowed: ${relative}`);if(count<250){count++;lines.push(`${'  '.repeat(depth)}[symlink omitted] ${relative}`);}continue;}if(relative==='standards'&&entry.isDirectory())standardsDirectoryPresent=true;if(isProjectSource(relative,entry))sourceFileCount++;if(entry.name==='AGENTS.md'&&guidanceCount<40&&!Object.hasOwn(guidance,relative)){const text=await readPolicy(relative);if(text!==null){guidance[relative]=text.length>12000?`${text.slice(0,12000)}\n[truncated; inspect full file before finalizing]`:text;guidanceTruncated ||= text.length>12000;guidanceCount++;}}if(relative.startsWith('standards/')&&entry.isFile()&&/\.(md|mdx|json|ya?ml)$/i.test(entry.name)){if(Object.keys(standards).length>=100||standardBytes>=160000){standardsTruncated=true;}else{const text=await readPolicy(relative);if(text!==null){const remaining=160000-standardBytes;standards[relative]=text.length>remaining?`${text.slice(0,remaining)}\n[truncated; inspect full file before finalizing]`:text;standardBytes+=text.length;if(text.length>remaining)standardsTruncated=true;}}}if(entry.name.startsWith('.'))continue;if(count<250){count++;lines.push(`${'  '.repeat(depth)}${entry.isDirectory()?'[dir] ':'      '}${relative}`);}if(entry.isDirectory())await walk(relative,depth+1);if(scanned>=2000){treeTruncated=true;break;}}}
 await walk('',0);guidanceTruncated ||= guidanceCount>=40;const emptyProject=sourceFileCount===0;return {guidance,standards,design,designSystem,designSystemDirectory,tokens:tokenPaths,tokenSources:tokenPaths.filter(file=>Object.hasOwn(guidance,file)),tokenResolution,availableSources:[...Object.keys(guidance),...Object.keys(standards)],absentSources:candidates.filter(file=>!Object.hasOwn(guidance,file)),standardsDirectoryPresent,projectTree:lines.join('\n'),treeTruncated:treeTruncated||count>=250,standardsTruncated,guidanceTruncated,sourceFileCount,emptyProject};
}
function isProjectSource(relative,entry){
 if(!entry.isFile()||entry.name.startsWith('.'))return false;
 if(relative.startsWith('planning/')||relative.startsWith('reports/')||relative.startsWith('logs/')||relative.startsWith('docs/prd/')||relative.startsWith('.instar/'))return false;
 if(['AGENTS.md','DESIGN.md','ARCHITECTURE.md','README.md','CHANGELOG.md','LICENSE','LICENSE.md'].includes(relative))return false;
 if(/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|poetry\.lock|Pipfile\.lock)$/i.test(relative))return false;
 return /\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss|sass|less|html?|py|pyi|go|java|kt|kts|rs|rb|php|cs|swift|sql|sh|bash|zsh|ya?ml|toml)$/i.test(relative);
}
export function report(input){
 if(!input||typeof input!=='object')throw Error('report is required');requireText(input.summary,'report.summary');requireText(input.source,'report.source');
 if(!Array.isArray(input.issues)||!Array.isArray(input.unverified))throw Error('report needs issues and unverified arrays');
 for(const issue of input.issues){if(!['critical','warning','suggestion'].includes(issue.severity))throw Error('Invalid issue severity');requireText(issue.message,'issue.message');}
 for(const reason of input.unverified)requireText(reason,'unverified reason');return structuredClone(input);
}
