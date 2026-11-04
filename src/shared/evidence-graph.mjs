import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export const EVIDENCE_GRAPH_SCHEMA_VERSION=1;
export const EVIDENCE_GRAPH_ROOT='.workflow/evidence-graphs';
const MAX_NODES=200,MAX_EDGES=600,MAX_GRAPH_BYTES=2*1024*1024;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value,label,max=512)=>{if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value)>max)throw Error(`${label} must be non-empty text up to ${max} bytes`);return value.trim();};
const identifier=(value,label)=>{const normalized=text(value,label,160);if(!/^[a-z0-9][a-z0-9._-]*$/.test(normalized))throw Error(`${label} contains unsupported characters`);return normalized;};
const sha256=(value,label)=>{const normalized=text(value,label,64);if(!/^[a-f0-9]{64}$/.test(normalized))throw Error(`${label} must be a SHA-256 digest`);return normalized;};
const positiveInteger=(value,label)=>{if(!Number.isInteger(value)||value<1)throw Error(`${label} must be a positive integer`);return value;};
const reference=value=>{
 if(value===undefined||value===null)return null;
 const normalized=text(value,'node.reference',600).replaceAll('\\','/');
 if(path.isAbsolute(normalized)||normalized.split('/').includes('..'))throw Error('node.reference must stay inside the workspace');
 return normalized;
};

function graphBody(graph){
 return {
  schemaVersion:EVIDENCE_GRAPH_SCHEMA_VERSION,
  changeId:graph.changeId,
  lineageId:graph.lineageId,
  evidenceEpoch:graph.evidenceEpoch,
  generationId:graph.generationId,
  snapshotFingerprint:graph.snapshotFingerprint,
  nodes:graph.nodes,
  edges:graph.edges,
 };
}

export function validateEvidenceGraph(graph,{expectedSnapshotFingerprint=null,expectedEvidenceEpoch=null,requiredNodeIds=[]}={}){
 if(!graph||typeof graph!=='object'||Array.isArray(graph))throw Error('Evidence graph must be an object');
 if(graph.schemaVersion!==EVIDENCE_GRAPH_SCHEMA_VERSION)throw Error(`Evidence graph must use schemaVersion ${EVIDENCE_GRAPH_SCHEMA_VERSION}`);
 identifier(graph.changeId,'graph.changeId');identifier(graph.lineageId,'graph.lineageId');
 positiveInteger(graph.evidenceEpoch,'graph.evidenceEpoch');
 if(!/^[a-f0-9-]{36}$/.test(graph.generationId||''))throw Error('graph.generationId must be a UUID');
 sha256(graph.snapshotFingerprint,'graph.snapshotFingerprint');
 if(!Array.isArray(graph.nodes)||!graph.nodes.length||graph.nodes.length>MAX_NODES)throw Error(`Evidence graph nodes must contain 1-${MAX_NODES} entries`);
 if(!Array.isArray(graph.edges)||graph.edges.length>MAX_EDGES)throw Error(`Evidence graph edges must contain at most ${MAX_EDGES} entries`);
 const ids=new Set();
 for(const node of graph.nodes){
  if(!node||typeof node!=='object'||Array.isArray(node))throw Error('Evidence graph node must be an object');
  identifier(node.id,'node.id');if(ids.has(node.id))throw Error(`Duplicate evidence node: ${node.id}`);ids.add(node.id);
  identifier(node.kind,'node.kind');sha256(node.hash,'node.hash');
  if(node.snapshotFingerprint!==graph.snapshotFingerprint)throw Error(`Evidence node ${node.id} belongs to a different source snapshot`);
  if(node.evidenceEpoch!==graph.evidenceEpoch)throw Error(`Evidence node ${node.id} belongs to a different evidence epoch`);
  reference(node.reference);
 }
 const edgeKeys=new Set();
 for(const edge of graph.edges){
  if(!edge||typeof edge!=='object'||Array.isArray(edge))throw Error('Evidence graph edge must be an object');
  identifier(edge.from,'edge.from');identifier(edge.to,'edge.to');identifier(edge.kind,'edge.kind');
  if(!ids.has(edge.from)||!ids.has(edge.to))throw Error(`Dangling evidence edge: ${edge.from} -> ${edge.to}`);
  const key=`${edge.from}\0${edge.to}\0${edge.kind}`;if(edgeKeys.has(key))throw Error(`Duplicate evidence edge: ${edge.from} -> ${edge.to} (${edge.kind})`);edgeKeys.add(key);
 }
 const outgoing=new Map([...ids].map(id=>[id,[]]));
 for(const edge of graph.edges)outgoing.get(edge.from).push(edge.to);
 const visiting=new Set(),visited=new Set();
 const visit=id=>{
  if(visiting.has(id))throw Error(`Evidence graph contains a cycle at ${id}`);
  if(visited.has(id))return;
  visiting.add(id);for(const next of outgoing.get(id))visit(next);visiting.delete(id);visited.add(id);
 };
 for(const id of ids)visit(id);
 const body=graphBody(graph),fingerprint=digest(body);
 if(graph.fingerprint!==undefined&&graph.fingerprint!==fingerprint)throw Error('Evidence graph fingerprint mismatch');
 if(graph.graphId!==undefined&&graph.graphId!==`evidence-${fingerprint.slice(0,24)}`)throw Error('Evidence graph identity mismatch');
 if(expectedSnapshotFingerprint!==null&&graph.snapshotFingerprint!==expectedSnapshotFingerprint)throw Error('Evidence graph belongs to a different source snapshot');
 if(expectedEvidenceEpoch!==null&&graph.evidenceEpoch!==expectedEvidenceEpoch)throw Error('Evidence graph belongs to a different evidence epoch');
 for(const id of requiredNodeIds)if(!ids.has(id))throw Error(`Required evidence node is missing: ${id}`);
 return {...graph,fingerprint,graphId:`evidence-${fingerprint.slice(0,24)}`};
}

export function buildEvidenceGraph({changeId,lineageId,evidenceEpoch,generationId,snapshotFingerprint,nodes=[],edges=[]}={}){
 const graph={
  schemaVersion:EVIDENCE_GRAPH_SCHEMA_VERSION,
  changeId,lineageId,evidenceEpoch,generationId,snapshotFingerprint,
  nodes:nodes.map(node=>({
   id:node.id,kind:node.kind,hash:node.hash,
   snapshotFingerprint:node.snapshotFingerprint??snapshotFingerprint,
   evidenceEpoch:node.evidenceEpoch??evidenceEpoch,
   ...(node.reference?{reference:node.reference}:{}),
  })),
  edges:edges.map(edge=>({from:edge.from,to:edge.to,kind:edge.kind})),
 };
 const fingerprint=digest(graphBody(graph));
 return validateEvidenceGraph({...graph,fingerprint,graphId:`evidence-${fingerprint.slice(0,24)}`});
}

export const evidenceGraphDirectory=changeId=>`${EVIDENCE_GRAPH_ROOT}/${identifier(changeId,'changeId')}`;
export const evidenceGraphPath=graph=>`${evidenceGraphDirectory(graph.changeId)}/${graph.evidenceEpoch}-${graph.generationId}.json`;

async function assertSafeParent(root,relative){
 let current=path.resolve(root);
 for(const part of relative.split('/').slice(0,-1)){
  current=path.join(current,part);
  try{const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe evidence graph path: ${relative}`);}
  catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(current);}
 }
}

export async function writeEvidenceGraph(root,graph){
 const validated=validateEvidenceGraph(graph);
 const relative=evidenceGraphPath(validated);
 const file=path.resolve(root,relative),rootPath=path.resolve(root);
 if(!file.startsWith(rootPath+path.sep))throw Error('Evidence graph path escapes the workspace');
 await assertSafeParent(root,relative);
 const temp=path.resolve(root,`${relative}.${randomUUID()}.tmp`);
 try{await fs.writeFile(temp,JSON.stringify(validated,null,2)+'\n',{flag:'wx'});await fs.rename(temp,file);}
 finally{await fs.rm(temp,{force:true});}
 return {path:relative,fingerprint:validated.fingerprint,graphId:validated.graphId,evidenceEpoch:validated.evidenceEpoch,generationId:validated.generationId,snapshotFingerprint:validated.snapshotFingerprint};
}

export async function readEvidenceGraph(root,relative){
 const normalized=text(relative,'graph.path',700).replaceAll('\\','/');
 if(!normalized.startsWith(`${EVIDENCE_GRAPH_ROOT}/`)||normalized.split('/').includes('..'))throw Error('Evidence graph path must stay under .workflow/evidence-graphs/');
 const file=path.resolve(root,normalized),rootPath=path.resolve(root);
 if(!file.startsWith(rootPath+path.sep))throw Error('Evidence graph path escapes the workspace');
 const stat=await fs.lstat(file);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_GRAPH_BYTES)throw Error('Evidence graph must be a regular file up to 2 MiB');
 return validateEvidenceGraph(JSON.parse(await fs.readFile(file,'utf8')));
}
