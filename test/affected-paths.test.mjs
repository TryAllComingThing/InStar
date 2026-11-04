import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expandAffectedPaths,validateChangedPathsCoverage} from '../runtime/shared/affected-paths.mjs';

test('changed source coverage expands coarse declarations before comparing',()=>{
 const projectTree='vue/src/views/Login.vue\npython/app/routers/auth.py\nREADME.md';
 const expansion=expandAffectedPaths({affectedPaths:['vue','python'],projectTree});
 assert.deepEqual(expansion.paths,['python/app/routers/auth.py','vue/src/views/Login.vue']);
 const result=validateChangedPathsCoverage({affectedPaths:['vue','python'],changed:['vue/src/views/Login.vue','python/app/routers/auth.py'],projectTree});
 assert.deepEqual(result.undeclared,[]);
});

test('changed source coverage rejects undeclared implementation paths',()=>{
 assert.throws(()=>validateChangedPathsCoverage({affectedPaths:['vue/src/views/Login.vue'],changed:['vue/src/views/Login.vue','python/app/routers/auth.py']}),/outside affectedPaths: python\/app\/routers\/auth\.py/);
 assert.throws(()=>validateChangedPathsCoverage({affectedPaths:['new-area'],changed:['src/new.js'],projectTree:'src/other.js'}),/outside affectedPaths: src\/new\.js/);
});
