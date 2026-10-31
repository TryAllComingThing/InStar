import {randomUUID,createHash} from 'node:crypto';
import {discoveryContext,sourcePath} from './context.mjs';
import {validateDiscoveredSpec,normalizeDiscoveredSpec} from '../openspec-min/src/discovery/validate.js';
import {fs,safe,read,json,hash,identifier,atomic,putJson,lock,transaction,restore,projectRoot,requireText,exists,now} from '../workflow-controller/files.mjs';
import {redactText} from '../shared/redaction.mjs';
import {MarkdownParser} from '../openspec-min/src/diff/parsers/markdown-parser.js';

export {discoveryContext};

function stringList(value,label) {
  if (!Array.isArray(value) || value.some(item=>typeof item !== 'string' || !item.trim())) throw Error(`${label} must be an array of non-empty strings`);
  return [...new Set(value)];
}

function hasSecretLikeValue(text) {
  // The shared redactor is intentionally broad and also masks ordinary schema
  // declarations. Normalize only unambiguous field types before checking the
  // remaining content for likely literal credentials.
  const declarations = /["']?\b(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|credential|secret|token)["']?\s*\??\s*:\s*["']?(string|number|boolean|null|unknown|any|opaque)["']?(?=[\s,;&"'.\]\)}]|$)/ig;
  const safeText = text.replace(declarations,(_,type)=>`field declaration: ${type}`);
  return redactText(safeText) !== safeText;
}

async function prepare(input,context) {
  if (input.contextHash !== context.contextHash) throw Error('Discovery context changed; read fresh context and recheck source and baseline');
  if (!input.specs || typeof input.specs !== 'object' || Array.isArray(input.specs) || !Object.keys(input.specs).length) throw Error('specs must contain at least one baseline document');
  const reviewedFiles = stringList(input.reviewedFiles,'reviewedFiles').map(sourcePath);
  if (!reviewedFiles.length) throw Error('Read source before generating specs; reviewedFiles is empty');
  for (const file of reviewedFiles) if (!Object.hasOwn(context.inventory,file)) throw Error(`Reviewed file is outside the source inventory: ${file}`);
  const limitations = stringList(input.limitations,'limitations');
  const update = stringList(input.update ?? [],'update');
  for (const id of update) if (!Object.hasOwn(input.specs,id)) throw Error(`Update target is absent from package: ${id}`);
  const documents = {}, evidence = {}, changes = [];
  const sourceCache = new Map();
  for (const [id,document] of Object.entries(input.specs)) {
    identifier(id,true); requireText(document,`specs.${id}`);
    if (hasSecretLikeValue(document)) throw Error(`${id}: remove secret-like values from the specification`);
    const parsed = validateDiscoveredSpec(id,document);
    const previousIndex = Object.hasOwn(context.baselineIndex,id) ? context.baselineIndex[id] : undefined;
    const previous = Object.hasOwn(context.baseline,id) ? context.baseline[id] : undefined;
    if (previousIndex?.invalid) throw Error(`Existing baseline cannot be parsed: ${id}; repair it before updating`);
    if (previousIndex && !update.includes(id)) throw Error(`Existing baseline protected: ${id}; explicitly include it in update after reviewing its full content`);
    if (previousIndex && !previous) throw Error(`Full baseline ${id} is not loaded; read fresh context with baselineCapabilities:[${JSON.stringify(id)}]`);
    const citations = input.evidence?.[id];
    if (!Array.isArray(citations) || !citations.length) throw Error(`${id}: source evidence is required`);
    const names = new Set(parsed.requirements.map(requirement=>requirement.name));
    const cited = new Set(); evidence[id] = [];
    for (const citation of citations) {
      const {requirement,path:source,startLine,endLine,excerpt} = citation;
      if (!names.has(requirement)) throw Error(`${id}: evidence names an unknown requirement: ${requirement}`);
      if (!reviewedFiles.includes(source)) throw Error(`${id}: evidence must cite a reviewed file: ${source}`);
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > context.inventory[source].lines) throw Error(`${id}: invalid evidence line range`);
      requireText(excerpt,'evidence.excerpt');
      if (!sourceCache.has(source)) {
        const raw = await read(context.project,source);
        const sourceHash = createHash('sha256').update(raw).digest('hex');
        if (sourceHash !== context.inventory[source].hash) throw Error(`Source changed while checking evidence: ${source}`);
        sourceCache.set(source,{text:raw.replace(/\r\n?/g,'\n'),sourceHash});
      }
      const selection = sourceCache.get(source).text.split('\n').slice(startLine-1,endLine).join('\n');
      if (!selection.includes(excerpt.replace(/\r\n?/g,'\n'))) throw Error(`${id}: evidence excerpt does not match ${source}:${startLine}-${endLine}`);
      cited.add(requirement);
      // Persist locations/hashes, not private source excerpts.
      evidence[id].push({requirement,path:source,startLine,endLine,sourceHash:sourceCache.get(source).sourceHash});
    }
    for (const name of names) if (!cited.has(name)) throw Error(`${id}/${name}: missing source evidence`);
    const generatedEvidence = evidence[id].map(item=>`- ${JSON.stringify(item.requirement)}: ${JSON.stringify(item.path)}:${item.startLine}-${item.endLine} (SHA-256 ${item.sourceHash})`).join('\n');
    const oldRequirements = previous ? new Map(new MarkdownParser(previous.document).parseSpec(id).requirements.map(item=>[item.name,item])) : new Map();
    const newRequirements = new Map(parsed.requirements.map(item=>[item.name,item]));
    const scenarioChanges = {added:[],removed:[],modified:[]};
    for (const name of newRequirements.keys()) {
      if (!oldRequirements.has(name)) continue;
      const oldScenarios = new Map(oldRequirements.get(name).scenarios.map(item=>[item.name,item.rawText]));
      const newScenarios = new Map(newRequirements.get(name).scenarios.map(item=>[item.name,item.rawText]));
      scenarioChanges.added.push(...[...newScenarios.keys()].filter(s=>!oldScenarios.has(s)).map(s=>`${name}/${s}`));
      scenarioChanges.removed.push(...[...oldScenarios.keys()].filter(s=>!newScenarios.has(s)).map(s=>`${name}/${s}`));
      scenarioChanges.modified.push(...[...newScenarios.keys()].filter(s=>oldScenarios.has(s)&&oldScenarios.get(s)!==newScenarios.get(s)).map(s=>`${name}/${s}`));
    }
    const requirementChanges = {
      added:[...newRequirements.keys()].filter(name=>!oldRequirements.has(name)),
      removed:[...oldRequirements.keys()].filter(name=>!newRequirements.has(name)),
      modified:[...newRequirements.keys()].filter(name=>oldRequirements.has(name)&&oldRequirements.get(name).text!==newRequirements.get(name).text),
      scenarios:scenarioChanges
    };
    const clean = normalizeDiscoveredSpec(document).replace(/\n<!-- instar:discovery -->[\s\S]*?<!-- \/instar:discovery -->\s*$/,'').trimEnd();
    documents[id] = `${clean}\n\n<!-- instar:discovery -->\n## Discovery evidence\n\nObserved implementation, not a human-approved product requirement. Sources were checked at capture time; semantic interpretation is agent-authored.\n\n${generatedEvidence}\n<!-- /instar:discovery -->\n`;
    changes.push({capability:id,path:`planning/specs/${id}/spec.md`,operation:previousIndex?'update':'create',previousHash:previousIndex?.hash ?? null,nextHash:hash(documents[id]),requirementChanges});
  }
  const unreviewedFiles = Object.keys(context.inventory).filter(file=>!reviewedFiles.includes(file));
  return {documents,changes,evidence,coverage:{scopes:context.scopes,reviewedFiles,unreviewedFiles,omitted:context.omitted,limitations,activeChanges:context.activeChanges},reviewStatus:'not-human-reviewed'};
}

export async function run(input) {
  if (!input || !['context','capture','recover'].includes(input.action)) throw Error('Discovery action must be context, capture or recover');
  if (input.action === 'recover') {
    const root = await projectRoot(input.project,{initialized:false});
    requireText(input.reason,'reason');
    return lock(root,async()=>{
      const record = await json(root,'.workflow/pending.json');
      if (record.id !== input.transactionId) throw Error('Recovery transaction mismatch');
      await restore(root,record);
      await putJson(root,`${record.backup}/result.json`,{...record,status:'recovered',reason:input.reason});
      await fs.unlink(safe(root,'.workflow/pending.json'));
      return {recovered:record.id};
    });
  }
  if (input.preview !== undefined && typeof input.preview !== 'boolean') throw Error('preview must be boolean');
  const context = await discoveryContext(input);
  if (input.action === 'context') return context;
  const prepared = await prepare(input,context);
  if (input.preview) return {status:'PREVIEW',project:context.project,contextHash:context.contextHash,...prepared};
  return lock(context.project,async()=>{
    // Match the normal workflow lock and recovery journal, without initializing it.
    // Re-scan under the lock before any write to detect changes during generation.
    const latest = await discoveryContext(input);
    if (latest.contextHash !== context.contextHash) throw Error('Discovery context changed before capture');
    for (const file of new Set(Object.values(prepared.evidence).flat().map(item=>item.path))) {
      const currentHash = createHash('sha256').update(await read(context.project,file)).digest('hex');
      if (currentHash !== context.inventory[file].hash) throw Error(`Evidence source changed before capture: ${file}`);
    }
    return transaction(context.project,async()=>{
      const discoveryId = randomUUID();
      const reportPath = `planning/discovery/${discoveryId}.json`;
      for (const change of prepared.changes) {
        const destination = safe(context.project,change.path);
        const current = await exists(destination) ? hash(await fs.readFile(destination,'utf8')) : null;
        if (current !== change.previousHash) throw Error(`Baseline changed before write: ${change.capability}`);
        await atomic(context.project,change.path,prepared.documents[change.capability]);
      }
      const journal = await json(context.project,'.workflow/pending.json');
      const report = {schemaVersion:1,discoveryId,at:now(),contextHash:context.contextHash,backupPath:`${journal.backup}/before`,...prepared};
      delete report.documents;
      await putJson(context.project,reportPath,report);
      return {status:'PASS',project:context.project,reportPath,...report};
    });
  });
}
