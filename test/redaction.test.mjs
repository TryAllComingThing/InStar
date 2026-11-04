import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redactText,redactData} from '../runtime/shared/redaction.mjs';

test('redaction covers tokens, keys, JWTs, bearer headers and credential pairs',()=>{
 const secret='abcdefghijklmnop';
 const jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
 const samples=[
  `ghp_${'a'.repeat(36)}`,
  `AKIA${'A'.repeat(16)}`,
  `sk-${'a'.repeat(40)}`,
  `Authorization: Bearer ${secret}`,
  `Bearer ${secret}`,
  `access_token=${secret}`,
  `?token=${secret}`,
  jwt,
 ];
 for(const input of samples){
  const out=redactText(input);
  assert.match(out,/REDACTED/,`missing redaction marker for: ${input.slice(0,24)}...`);
  assert.doesNotMatch(out,new RegExp(secret));
  assert.doesNotMatch(out,/eyJhbGciOiJIUzI1NiJ9/);
 }
});

test('redactData masks secret-named keys and keeps visible values',()=>{
 const out=redactData({password:'hunter2',api_key:'topsecret',ok:'visible',nested:{token:'nested-secret',name:'x'}});
 assert.equal(out.password,'[REDACTED]');
 assert.equal(out.api_key,'[REDACTED]');
 assert.equal(out.nested.token,'[REDACTED]');
 assert.equal(out.ok,'visible');
 assert.equal(out.nested.name,'x');
});
