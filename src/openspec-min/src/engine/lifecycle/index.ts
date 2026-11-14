import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { identifier, safe, read, write, locked } from '../../store/index.js';
import { discoverSpecFiles } from '../../utils/spec-discovery.js';
import { buildUpdatedSpec, findSpecUpdates } from '../../diff/merge.js';
import { parseDeltaSpec } from '../../diff/parsers/requirement-blocks.js';
import { buildCodeFenceMask } from '../../diff/parsers/code-fence.js';
import { extractRequirementBody, LEVEL_FOUR_HEADER, SCENARIO_HEADER } from '../../diff/parsers/requirement-text.js';
import { validateDiscoveredSpec } from '../../discovery/validate.js';
import { matchLineEnding } from '../../utils/line-endings.js';
import { instructions } from '../schema/index.js';
import type { ChangeRef, SpecPackage, GenerationContext, GateResult } from './types.js';
import {
  createDirectoryVerified,
  ensureDirectoryVerified,
  lstatVerified,
  pathExistsVerified,
  removeDirectoryVerified,
  removeFileVerified,
  removeTreeVerified,
  renameDirectoryVerified,
  sameDirectoryIdentity,
  writeFileVerified,
} from '../../../../shared/path-safety.mjs';

function change(ref:ChangeRef) { return safe(ref.root,'changes',identifier(ref.changeId)); }
function relativeTo(root:string,file:string):string {
  const relative=path.relative(path.resolve(root),path.resolve(file));
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Path escapes root');
  return relative.split(path.sep).join('/');
}
async function specs(root:string) {
  const out:Record<string,string>={};
  for (const item of await discoverSpecFiles(root)) out[item.id]=await read(root,item.specFile);
  return out;
}
function digest(value:unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function context(ref:ChangeRef):Promise<GenerationContext> {
  const dir=change(ref);
  return {instruction:'',proposal:await read(dir,safe(dir,'proposal.md')),specs:await specs(safe(dir,'specs')),baseline:await specs(safe(ref.root,'specs'))};
}
function sections(doc:string, names:string[]) {
  const lines=doc.replace(/\r\n?/g,'\n').split('\n'); const mask=buildCodeFenceMask(lines);
  for (const name of names) {
    const at=lines.findIndex((line,i)=>!mask[i] && line.trim()===`## ${name}`);
    const end=lines.findIndex((line,i)=>i>at && !mask[i] && /^##\s/.test(line));
    if(at<0 || !lines.slice(at+1,end<0?undefined:end).some((line,i)=>!mask[at+1+i] && line.trim() && !line.trim().startsWith('<!--'))) throw new Error(`Missing or empty section: ${name}`);
  }
}
async function gate(ref:ChangeRef):Promise<GateResult> {
  const issues:string[]=[];
  try {
    const ctx=await context(ref);
    sections(ctx.proposal!,['Why','What Changes','Capabilities','Impact']);
    if(!Object.keys(ctx.specs).length) throw new Error('At least one delta spec is required');
    for(const [id,doc] of Object.entries(ctx.specs)) {
      identifier(id,true); const plan=parseDeltaSpec(doc);
      if(!plan.added.length&&!plan.modified.length&&!plan.removed.length&&!plan.renamed.length) throw new Error(`${id}: empty delta`);
      if(plan.unpairedRenames.length) throw new Error(`${id}: RENAMED line ${plan.unpairedRenames[0].line} has no matching ${plan.unpairedRenames[0].side==='FROM'?'TO':'FROM'}`);
      if(plan.malformedRenames.length) throw new Error(`${id}: unrecognized RENAMED content on line ${plan.malformedRenames[0].line}: ${plan.malformedRenames[0].text}`);
      if(plan.orphanedRequirements.length) throw new Error(`${id}: requirement "${plan.orphanedRequirements[0].name}" on line ${plan.orphanedRequirements[0].line} is outside every delta section`);
      if(plan.skippedHeaders.length) throw new Error(`${id}: non-canonical heading "### ${plan.skippedHeaders[0].header}" on line ${plan.skippedHeaders[0].line}; use "### Requirement:"`);
      for(const block of [...plan.added,...plan.modified]) {
        const lines=block.raw.split('\n'); const mask=buildCodeFenceMask(lines);
        const body=extractRequirementBody(lines.slice(1));
        if(!/\b(SHALL|MUST)\b/.test(body)) throw new Error(`${id}/${block.name}: SHALL or MUST required`);
        const malformed=lines.findIndex((line,index)=>!mask[index]&&LEVEL_FOUR_HEADER.test(line)&&!SCENARIO_HEADER.test(line));
        if(malformed>=0) throw new Error(`${id}/${block.name}: use "#### Scenario: <name>" instead of "${lines[malformed].trim()}"`);
        const text=lines.filter((_,i)=>!mask[i]).join('\n');
        const scenarios=text.split(/^####[ \t]+Scenario:[ \t]*\S.*$/m).slice(1);
        if(!scenarios.length || scenarios.some(s=>! /\bWHEN\b/.test(s)||! /\bTHEN\b/.test(s))) throw new Error(`${id}/${block.name}: WHEN/THEN scenario required`);
      }
      for(const name of plan.removed) {
        const block=plan.removedBlocks.find(b=>b.name===name);
        if(!block || !/Reason\*?\*?:\s*\S/.test(block.raw) || !/Migration\*?\*?:\s*\S/.test(block.raw)) throw new Error(`${id}/${name}: removal needs Reason and Migration`);
      }
      if(!ctx.baseline[id]) sections(doc,['Purpose']);
    }
    for(const update of await findSpecUpdates(change(ref),safe(ref.root,'specs'))) {
      const merged=await buildUpdatedSpec(update,ref.changeId);
      if(merged.noRequirementBlocks) throw new Error(`${update.id}: removing the last requirement is unsupported`);
      validateDiscoveredSpec(update.id,merged.rebuilt);
    }
  } catch(error) { issues.push(error instanceof Error?error.message:String(error)); }
  return {valid:issues.length===0,issues};
}
async function requireGate(ref:ChangeRef) { const result=await gate(ref); if(!result.valid) throw new Error(result.issues.join('\n')); }
export async function runSpecVerifyGate(ref:ChangeRef):Promise<GateResult> { return locked(ref.root,()=>gate(ref)); }

export async function createSpecChange(input:ChangeRef & {prd:string; generate:(context:GenerationContext)=>Promise<SpecPackage>}) {
  return locked(input.root,async()=>{
    const dir=change(input);
    if(!input.prd.trim()) throw new Error('PRD is required');
    const baseline=await specs(safe(input.root,'specs'));
    const output=await input.generate({instruction:instructions.propose,prd:input.prd,specs:{},baseline});
    if(!output.proposal?.trim() || !Object.keys(output.specs).length) throw new Error('Generator returned an empty change');
    for(const id of Object.keys(output.specs)) identifier(id,true);
    await ensureDirectoryVerified(input.root,'changes',{mode:0o700});
    const stagingRelative=`changes/.create-${randomUUID()}`;
    const staging=safe(input.root,stagingRelative);
    const stagingStat=await createDirectoryVerified(input.root,stagingRelative,{mode:0o700});
    const destinationRelative=relativeTo(input.root,dir);
    let reservation:any=null;
    try {
      await write(staging,'proposal.md',output.proposal);
      for(const [id,doc] of Object.entries(output.specs)) await write(staging,`specs/${id}/spec.md`,doc);
      // The reservation gives rename a known empty destination; its identity is
      // rechecked so a child change can never silently replace another writer.
      reservation=await createDirectoryVerified(input.root,destinationRelative,{mode:0o700});
      await renameDirectoryVerified(input.root,stagingRelative,destinationRelative,stagingStat,{replaceExpected:reservation});
      reservation=null;
    } finally {
      if(reservation)await removeDirectoryVerified(input.root,destinationRelative,reservation).catch(()=>{});
      await removeTreeVerified(input.root,stagingRelative,{expected:stagingStat,label:'failed spec change staging cleanup'}).catch(()=>{});
    }
    return {changeId:input.changeId,path:dir};
  });
}
function specFingerprint(ctx:GenerationContext) { return digest({proposal:ctx.proposal,specs:ctx.specs,baseline:ctx.baseline}); }
export async function generateDesignDoc(input:ChangeRef & {specReviewed:true; generate:(context:GenerationContext)=>Promise<string>}) {
  return locked(input.root,async()=>{
    if(input.specReviewed!==true) throw new Error('Human Spec review is required');
    await requireGate(input); const ctx=await context(input); const fingerprint=specFingerprint(ctx);
    const doc=await input.generate({...ctx,instruction:instructions.design});
    sections(doc,['Context','Goals / Non-Goals','Decisions','Project Constraints','Architecture','File Change Plan','Risks / Trade-offs','Migration Plan']);
    if(fingerprint!==specFingerprint(await context(input))) throw new Error('Documents changed during generation');
    const output=safe(change(input),'technical-design.md');
    const legacy=safe(change(input),'design.md');
    const hasOutput=await pathExistsVerified(change(input),'technical-design.md');
    if(hasOutput) throw new Error('technical-design.md already exists; use the reviewed regeneration procedure');
    const outputStat=await writeFileVerified(change(input),'technical-design.md',doc,{overwrite:false});
    try {
      await write(change(input),'.review.json',JSON.stringify({spec:fingerprint,design:digest(doc)}));
      await removeFileVerified(change(input),'design.md');
    }
    catch(error) { await removeFileVerified(change(input),'technical-design.md',{expected:outputStat}).catch(()=>{}); throw error; }
    return {path:output};
  });
}
async function reviewed(ref:ChangeRef) {
  const ctx=await context(ref); const review=JSON.parse(await read(change(ref),safe(change(ref),'.review.json')));
  const current=safe(change(ref),'technical-design.md'),legacy=safe(change(ref),'design.md');
  const hasCurrent=await pathExistsVerified(change(ref),'technical-design.md'),hasLegacy=await pathExistsVerified(change(ref),'design.md');
  if(hasCurrent&&hasLegacy) throw new Error('Both technical-design.md and legacy design.md exist; resolve the duplicate before continuing');
  ctx.technicalDesign=await read(change(ref),hasCurrent?current:legacy);
  if(review.spec!==specFingerprint(ctx)||review.design!==digest(ctx.technicalDesign)) throw new Error('Reviewed documents or baseline changed');
  return ctx;
}
function validateTasks(doc:string,complete=false) {
  const lines=doc.split('\n');const mask=buildCodeFenceMask(lines);
  const checklist=lines.filter((line,i)=>!mask[i] && /^\s*[-*+] \[/.test(line));
  const tasks=checklist.filter(line=>/^- \[[ xX]\] \d+\.\d+ \S/.test(line));
  if(tasks.length!==checklist.length) throw new Error('Malformed task checkbox');
  if(!tasks.length || (complete&&tasks.some(t=>t.startsWith('- [ ]')))) throw new Error('A numbered task checklist is required; all tasks must be complete before promotion');
}
export async function generateTaskList(input:ChangeRef & {generate:(context:GenerationContext)=>Promise<string>}) {
  return locked(input.root,async()=>{
    await requireGate(input);const ctx=await reviewed(input);const fingerprint=digest(ctx);
    const doc=await input.generate({...ctx,instruction:instructions.tasks});validateTasks(doc);
    if(fingerprint!==digest(await reviewed(input))) throw new Error('Documents changed during generation');
    await write(change(input),'tasks.md',doc);
    const taskStat=await lstatVerified(change(input),'tasks.md');
    try { await write(change(input),'.tasks.json',JSON.stringify({fingerprint:digest(doc.replace(/^- \[[ xX]\]/gm,'- [ ]'))})); }
    catch(error) { await removeFileVerified(change(input),'tasks.md',{expected:taskStat}); throw error; }
    return {path:safe(change(input),'tasks.md')};
  });
}
export async function promoteToBaseline(input:ChangeRef & {accepted:true}) {
  return locked(input.root,async()=>{
    if(input.accepted!==true) throw new Error('Human acceptance is required');
    await requireGate(input); await reviewed(input);
    const tasks=await read(change(input),safe(change(input),'tasks.md'));validateTasks(tasks,true);
    const record=JSON.parse(await read(change(input),safe(change(input),'.tasks.json')));
    if(record.fingerprint!==digest(tasks.replace(/^- \[[ xX]\]/gm,'- [ ]'))) throw new Error('Task content changed; acceptance must use generated tasks');
    const archive=safe(input.root,'archive',input.changeId);
    if(await pathExistsVerified(input.root,`archive/${input.changeId}`))throw new Error('Archive already exists');
    const changeRelative=relativeTo(input.root,change(input));
    const changeStat=await lstatVerified(input.root,changeRelative);
    const updates=await findSpecUpdates(change(input),safe(input.root,'specs'));
    const prepared=[];
    for(const update of updates) prepared.push({update,previous:update.exists?await read(update.targetRoot,update.target):undefined,merged:await buildUpdatedSpec(update,input.changeId)});
    const written:{item:(typeof prepared)[number];stat:any}[]=[];
    try {
      await ensureDirectoryVerified(input.root,'specs',{mode:0o700});
      for(const item of prepared) {
        safe(item.update.targetRoot,path.relative(item.update.targetRoot,item.update.target));
        const targetRelative=relativeTo(item.update.targetRoot,item.update.target);
        const stat=await writeFileVerified(item.update.targetRoot,targetRelative,item.previous===undefined?item.merged.rebuilt:matchLineEnding(item.merged.rebuilt,item.previous),{overwrite:item.previous!==undefined});
        written.push({item,stat});
      }
      await ensureDirectoryVerified(input.root,'archive',{mode:0o700});
      await renameDirectoryVerified(input.root,changeRelative,`archive/${input.changeId}`,changeStat);
    } catch(error) {
      const failures:unknown[]=[];
      for(const {item,stat} of written.reverse()) {
        try {
          const targetRelative=relativeTo(item.update.targetRoot,item.update.target);
          if(item.previous===undefined){if(!await removeFileVerified(item.update.targetRoot,targetRelative,{expected:stat}))throw new Error(`Rollback target changed: ${item.update.target}`);}
          else {
            const current=await lstatVerified(item.update.targetRoot,targetRelative);
            if(!sameDirectoryIdentity(current,stat))throw new Error(`Rollback target changed: ${item.update.target}`);
            await writeFileVerified(item.update.targetRoot,targetRelative,item.previous,{overwrite:true});
          }
        } catch(e) { failures.push(e); }
      }
      if(failures.length) throw new AggregateError([error,...failures],'Promotion and rollback failed; inspect baseline before retry');
      throw error;
    }
    return {archivePath:archive,updates:prepared.map(p=>({id:p.update.id,counts:p.merged.counts,warnings:p.merged.warnings}))};
  });
}
