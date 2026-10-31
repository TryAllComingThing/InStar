import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateQualityPolicy,validateQualityPolicy} from '../src/quality-controller/policy.mjs';
const snapshot={fingerprint:'snapshot-a',head:'commit-a'};
const full=['Q-01','Q-02','Q-03','Q-04','Q-05','Q-06','Q-07'].map((category,i)=>({category,checkId:category==='Q-07'?'evidence-report':`check-${i+1}`}));
const policy={schemaVersion:1,profiles:{commit:[full[0],full[6]],full}};
const checks=full.map(x=>({id:x.checkId,status:'PASS'}));
test('mandatory full matrix and fail closed',()=>{
 assert.doesNotThrow(()=>validateQualityPolicy(policy));
 assert.throws(()=>validateQualityPolicy({...policy,profiles:{...policy.profiles,full:full.slice(0,-2).concat(full[6])}}),/Q-01 through Q-07/);
 assert.equal(evaluateQualityPolicy(policy,'full',checks,snapshot).status,'PASS');
 assert.equal(evaluateQualityPolicy(policy,'full',checks.slice(1),snapshot).status,'BLOCK');
});
test('waiver must carry risk, compensating control, approver and scope; never Q-07',()=>{
 const waiver={category:'Q-01',checkId:'check-1',reason:'temporary exception',risk:'reduced lint coverage',compensatingControl:'manual review',approvedBy:'owner',expiresAt:'2099-01-01T00:00:00Z',scopeFingerprint:'commit-a'};
 assert.throws(()=>validateQualityPolicy({...policy,waivers:[{...waiver,category:'Q-07',checkId:'evidence-report'}]}),/Invalid waiver/);
 assert.throws(()=>validateQualityPolicy({...policy,waivers:[{...waiver,risk:''}]}),/Invalid waiver/);
 const p={...policy,waivers:[waiver]},failed=[{id:'check-1',status:'BLOCK'},...checks.slice(1)];
 const result=evaluateQualityPolicy(p,'full',failed,snapshot,new Date('2026-10-31'));
 assert.equal(result.status,'PASS_WITH_WAIVERS');assert.equal(result.waivers[0].rawStatus,'BLOCK');
 assert.equal(evaluateQualityPolicy(p,'full',failed,{...snapshot,head:'new'},new Date('2026-10-31')).status,'FAIL');
 assert.equal(evaluateQualityPolicy(p,'full',failed,snapshot,new Date('2100-01-01')).status,'FAIL');
});
