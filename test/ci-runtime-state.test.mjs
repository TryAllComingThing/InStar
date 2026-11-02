import test from 'node:test';
import assert from 'node:assert/strict';
import {orchestrate} from '../src/quality-controller/ci.mjs';
import {isRuntimeState} from '../src/shared/project-files.mjs';
test('CI prepare ignores workflow journals but rejects real source changes',async()=>{
 let dirty='.workflow/traces.jsonl\0planning/workflows/change.json\0';
 const api={config:async()=>({baseRef:'main',ci:{repo:'org/project',host:'github.com',remote:'origin',base:'main'}}),prePr:async()=>({snapshot:{head:'head',base:'base',changed:[]},provenance:{summary:'Fixture'}}),git:(_root,args)=>args[0]==='branch'?'feature':args[0]==='diff'?dirty:'',json:async()=>({}),write:async()=>{},save:async(_root,_kind,data)=>data};
 assert.equal((await orchestrate('/fixture',{phase:'prepare',title:'Change'},api)).status,'PREPARED');
 dirty+='src/app.js\0';await assert.rejects(orchestrate('/fixture',{phase:'prepare',title:'Change'},api),/working tree/);
 assert.equal(isRuntimeState('planning/changes/change/tasks.md'),false);
});
