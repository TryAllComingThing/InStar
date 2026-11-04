import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {buildEvidenceGraph,validateEvidenceGraph,writeEvidenceGraph,readEvidenceGraph} from '../runtime/shared/evidence-graph.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const snapshot=hash('snapshot');
const base=()=>({
 changeId:'oa-login',lineageId:'oa-login-lineage',evidenceEpoch:1,generationId:randomUUID(),snapshotFingerprint:snapshot,
 nodes:[
  {id:'artifact.prd',kind:'artifact',hash:hash('prd'),reference:'docs/prd/oa-login.md'},
  {id:'artifact.spec',kind:'artifact',hash:hash('spec'),reference:'planning/changes/oa-login/proposal.md'},
  {id:'artifact.design',kind:'artifact',hash:hash('design'),reference:'planning/changes/oa-login/technical-design.md'},
  {id:'artifact.tasks',kind:'artifact',hash:hash('tasks'),reference:'planning/changes/oa-login/tasks.md'},
 ],
 edges:[
  {from:'artifact.prd',to:'artifact.spec',kind:'derives'},
  {from:'artifact.spec',to:'artifact.design',kind:'derives'},
  {from:'artifact.design',to:'artifact.tasks',kind:'derives'},
 ],
});

test('evidence graph accepts an acyclic graph within one snapshot and epoch',()=>{
 const graph=buildEvidenceGraph(base());
 assert.match(graph.fingerprint,/^[a-f0-9]{64}$/);assert.match(graph.graphId,/^evidence-/);
 assert.deepEqual(validateEvidenceGraph(graph,{expectedSnapshotFingerprint:snapshot,expectedEvidenceEpoch:1,requiredNodeIds:['artifact.prd']}),graph);
});

test('evidence graph rejects dangling edges, cycles and duplicate nodes',()=>{
 assert.throws(()=>buildEvidenceGraph({...base(),edges:[...base().edges,{from:'artifact.prd',to:'missing',kind:'derives'}]}),/Dangling/);
 assert.throws(()=>buildEvidenceGraph({...base(),edges:[...base().edges,{from:'artifact.tasks',to:'artifact.prd',kind:'derives'}]}),/cycle/);
 const duplicate=base();duplicate.nodes=[...duplicate.nodes,duplicate.nodes[0]];
 assert.throws(()=>buildEvidenceGraph(duplicate),/Duplicate evidence node/);
});

test('evidence graph rejects cross-snapshot and cross-epoch nodes',()=>{
 const otherSnapshot=base();otherSnapshot.nodes=otherSnapshot.nodes.map((node,index)=>index?node:{...node,snapshotFingerprint:hash('other')});
 assert.throws(()=>buildEvidenceGraph(otherSnapshot),/different source snapshot/);
 const otherEpoch=base();otherEpoch.nodes=otherEpoch.nodes.map((node,index)=>index?node:{...node,evidenceEpoch:2});
 assert.throws(()=>buildEvidenceGraph(otherEpoch),/different evidence epoch/);
});

test('persisted evidence graph is readable and detects content tampering',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'instar-evidence-graph-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const graph=buildEvidenceGraph(base());const ref=await writeEvidenceGraph(root,graph);const loaded=await readEvidenceGraph(root,ref.path);
 assert.equal(loaded.fingerprint,graph.fingerprint);
 assert.throws(()=>validateEvidenceGraph({...graph,fingerprint:hash('forged')}),/fingerprint mismatch/);
 assert.throws(()=>validateEvidenceGraph(graph,{expectedSnapshotFingerprint:hash('other')}),/different source snapshot/);
 assert.throws(()=>validateEvidenceGraph(graph,{expectedEvidenceEpoch:2}),/different evidence epoch/);
});
