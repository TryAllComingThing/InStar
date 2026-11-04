import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractRequirementIds,validateRequirementTraceability} from '../runtime/shared/requirement-traceability.mjs';

const design='# Design\n\n## Requirement Traceability\n\n| Requirement | Design | Implementation | Verification |\n| --- | --- | --- | --- |\n| `REQ-001` | Token rotation decision | `src/auth/session.js`; task 1.1 | Auth rotation test |\n| `NFR-002` | Timing budget | `src/auth/session.js` | Load test threshold |\n';

test('requirement IDs are extracted and normalized from PRD and specs',()=>{
 assert.deepEqual(extractRequirementIds(['REQ-001 and nfr-002.','### REQ-003']),['NFR-002','REQ-001','REQ-003']);
 assert.deepEqual(extractRequirementIds(['No numbered requirements']),[]);
});

test('traceability is optional without IDs and complete when IDs exist',()=>{
 assert.equal(validateRequirementTraceability('plain design',[]).status,'NOT_REQUIRED');
 const result=validateRequirementTraceability(design,['REQ-001','NFR-002']);
 assert.equal(result.status,'MAPPED');
 assert.deepEqual(result.required,['NFR-002','REQ-001']);
 assert.equal(result.present.length,2);
 assert.throws(()=>validateRequirementTraceability('plain design',['REQ-001']),/Requirement Traceability section/);
 assert.throws(()=>validateRequirementTraceability(design,['REQ-001','REQ-404']),/missing requirement: REQ-404/);
});
