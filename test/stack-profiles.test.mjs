import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  detectedStackFor,
  hasFrontendSurface,
  inferPathStack,
  reviewItemsForConfig,
  stackForConfig,
} from '../runtime/shared/stack-profiles.mjs';

test('stack registry selects framework and language review items',()=>{
 const react=reviewItemsForConfig({review:{language:'typescript',framework:'react'}});
 assert.ok(react.includes('hooks-rules'));
 assert.ok(react.includes('effect-cleanup'));
 assert.ok(react.includes('accessibility'));

 const svelte=reviewItemsForConfig({review:{language:'typescript',framework:'svelte'}});
 assert.ok(svelte.includes('reactivity'));
 assert.ok(svelte.includes('lifecycle-cleanup'));

 const angular=reviewItemsForConfig({review:{language:'typescript',framework:'angular'}});
 assert.ok(angular.includes('change-detection'));
 assert.ok(angular.includes('subscription-cleanup'));

 const rust=reviewItemsForConfig({review:{language:'rust',framework:'none'}});
 assert.ok(rust.includes('ownership-model'));
 assert.ok(rust.includes('unsafe-usage'));

 const dotnet=reviewItemsForConfig({review:{language:'csharp',framework:'dotnet'}});
 assert.ok(dotnet.includes('nullable-safety'));
 assert.ok(dotnet.includes('ef-migrations'));
});

test('path inference recognizes UI and backend project file types',()=>{
 assert.deepEqual(inferPathStack(['src/App.svelte']),{languages:['typescript'],frameworks:['svelte']});
 assert.deepEqual(inferPathStack(['src/Order.cs','src/App.csproj']),{languages:['csharp'],frameworks:['dotnet']});
 assert.deepEqual(inferPathStack(['web/App.vue','api/main.go']),{languages:['go','typescript'],frameworks:['vue']});
});

test('detected stacks and surfaces stay explicit for cross-stack and CLI projects',()=>{
 assert.equal(detectedStackFor({languages:['python','typescript'],frameworks:['vue'],hasPackageJson:true}),'full-stack');
 assert.equal(detectedStackFor({languages:['csharp'],frameworks:['dotnet']}),'dotnet');
 assert.equal(detectedStackFor({languages:['javascript'],frameworks:['node'],hasPackageJson:true}),'node');
 assert.deepEqual(stackForConfig({review:{language:'typescript'}}),['typescript','javascript']);
 assert.equal(hasFrontendSurface({review:{framework:'vue',surface:'cli'}}),false);
 assert.equal(hasFrontendSurface({review:{framework:'vue'}}),true);
 assert.equal(hasFrontendSurface({review:{framework:'node',surface:'browser'}}),true);
});
