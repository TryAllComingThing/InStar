import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { identifier, safe, read, write, locked } from '../../store/index.js';
import { discoverSpecFiles } from '../../utils/spec-discovery.js';
import { buildUpdatedSpec, findSpecUpdates } from '../../diff/merge.js';
import { parseDeltaSpec } from '../../diff/parsers/requirement-blocks.js';
import { buildCodeFenceMask } from '../../diff/parsers/code-fence.js';
import { matchLineEnding } from '../../utils/line-endings.js';
import { instructions } from '../schema/index.js';
import type { ChangeRef, SpecPackage, GenerationContext, GateResult } from './types.js';

function change(ref:ChangeRef) { return safe(ref.root,'changes',identifier(ref.changeId)); }
async function specs(root:string) {
  const out:Record<string,string>={};
  for (const item of await discoverSpecFiles(root)) out[item.id]=await read(item.specFile);
  return out;
}
function digest(value:unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function context(ref:ChangeRef):Promise<GenerationContext> {
  const dir=change(ref);
  return {instruction:'',proposal:await read(safe(dir,'proposal.md')),specs:await specs(safe(dir,'specs')),baseline:await specs(safe(ref.root,'specs'))};
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
      for(const block of [...plan.added,...plan.modified]) {
        const lines=block.raw.split('\n'); const mask=buildCodeFenceMask(lines);
        const text=lines.filter((_,i)=>!mask[i]).join('\n');
        const body=text.split(/^####\s/m)[0].split('\n').slice(1).join('\n');
        if(!/\b(SHALL|MUST)\b/.test(body)) throw new Error(`${id}/${block.name}: SHALL or MUST required`);
        const scenarios=text.split(/^#### Scenario:\s*.+$/m).slice(1);
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
    await fs.mkdir(safe(input.root,'changes'),{recursive:true});
    const staging=safe(input.root,'changes',`.create-${randomUUID()}`); await fs.mkdir(staging);
    try {
      await write(staging,'proposal.md',output.proposal);
      for(const [id,doc] of Object.entries(output.specs)) await write(staging,`specs/${id}/spec.md`,doc);
      // mkdir reserves the destination without overwriting an existing change.
      await fs.mkdir(dir); try { await fs.rename(staging,dir); } catch(error) { await fs.rmdir(dir); throw error; }
    } finally { await fs.rm(staging,{recursive:true,force:true}); }
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
    const hasOutput=await fs.access(output).then(()=>true,()=>false);
    if(hasOutput) throw new Error('technical-design.md already exists; use the reviewed regeneration procedure');
    await write(change(input),'technical-design.md',doc);
    try {
      await write(change(input),'.review.json',JSON.stringify({spec:fingerprint,design:digest(doc)}));
      await fs.unlink(legacy).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});
    }
    catch(error) { await fs.unlink(output).catch(()=>{}); throw error; }
    return {path:output};
  });
}
async function reviewed(ref:ChangeRef) {
  const ctx=await context(ref); const review=JSON.parse(await read(safe(change(ref),'.review.json')));
  const current=safe(change(ref),'technical-design.md'),legacy=safe(change(ref),'design.md');
  const hasCurrent=await fs.access(current).then(()=>true,()=>false),hasLegacy=await fs.access(legacy).then(()=>true,()=>false);
  if(hasCurrent&&hasLegacy) throw new Error('Both technical-design.md and legacy design.md exist; resolve the duplicate before continuing');
  ctx.technicalDesign=await read(hasCurrent?current:legacy);
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
    try { await write(change(input),'.tasks.json',JSON.stringify({fingerprint:digest(doc.replace(/^- \[[ xX]\]/gm,'- [ ]'))})); }
    catch(error) { await fs.unlink(safe(change(input),'tasks.md')); throw error; }
    return {path:safe(change(input),'tasks.md')};
  });
}
export async function promoteToBaseline(input:ChangeRef & {accepted:true}) {
  return locked(input.root,async()=>{
    if(input.accepted!==true) throw new Error('Human acceptance is required');
    await requireGate(input); await reviewed(input);
    const tasks=await read(safe(change(input),'tasks.md'));validateTasks(tasks,true);
    const record=JSON.parse(await read(safe(change(input),'.tasks.json')));
    if(record.fingerprint!==digest(tasks.replace(/^- \[[ xX]\]/gm,'- [ ]'))) throw new Error('Task content changed; acceptance must use generated tasks');
    const archive=safe(input.root,'archive',input.changeId);
    try { await fs.lstat(archive); throw new Error('Archive already exists'); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
    const updates=await findSpecUpdates(change(input),safe(input.root,'specs'));
    const prepared=[];
    for(const update of updates) prepared.push({update,previous:update.exists?await read(update.target):undefined,merged:await buildUpdatedSpec(update,input.changeId)});
    const written:typeof prepared=[];
    try {
      for(const item of prepared) {
        safe(item.update.targetRoot,path.relative(item.update.targetRoot,item.update.target));
        await fs.mkdir(path.dirname(item.update.target),{recursive:true});
        written.push(item);await fs.writeFile(item.update.target,item.previous===undefined?item.merged.rebuilt:matchLineEnding(item.merged.rebuilt,item.previous));
      }
      await fs.mkdir(path.dirname(archive),{recursive:true});await fs.rename(change(input),archive);
    } catch(error) {
      const failures:unknown[]=[];
      for(const item of written.reverse()) {
        try { if(item.previous===undefined) await fs.rm(item.update.target,{force:true});else await fs.writeFile(item.update.target,item.previous); } catch(e) { failures.push(e); }
      }
      if(failures.length) throw new AggregateError([error,...failures],'Promotion and rollback failed; inspect baseline before retry');
      throw error;
    }
    return {archivePath:archive,updates:prepared.map(p=>({id:p.update.id,counts:p.merged.counts,warnings:p.merged.warnings}))};
  });
}
