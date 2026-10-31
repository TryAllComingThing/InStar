import {cp, mkdir, writeFile, rm} from 'node:fs/promises';
const root = new URL('../',import.meta.url);
await rm(new URL('runtime/',root),{recursive:true,force:true});
await mkdir(new URL('runtime/',root),{recursive:true});
await cp(new URL('src/openspec-min/dist/',root),new URL('runtime/openspec-min/',root),{recursive:true});
await cp(new URL('src/openspec-min/artifact-templates/',root),new URL('runtime/openspec-min/artifact-templates/',root),{recursive:true});
await cp(new URL('src/workflow-controller/',root),new URL('runtime/workflow-controller/',root),{recursive:true});
await cp(new URL('src/shared/',root),new URL('runtime/shared/',root),{recursive:true});
await cp(new URL('src/discovery-controller/',root),new URL('runtime/discovery-controller/',root),{recursive:true});
await cp(new URL('src/openspec-min/LICENSE',root),new URL('runtime/openspec-min/LICENSE',root));
// Ship only runtime JavaScript and package metadata; omit TypeScript sources,
// declaration files, tests, and build inputs from the standalone runtime.
await cp(new URL('node_modules/zod/',root),new URL('runtime/openspec-min/node_modules/zod/',root),{recursive:true,filter:source=>{
 const relative=source.slice(new URL('node_modules/zod/',root).pathname.length).replaceAll('\\','/');
 if(/(^|\/)(src|tests|__tests__)(\/|$)/.test(relative)||/\.d\.(?:ts|mts|cts)$|\.map$/.test(relative))return false;
 return true;
}});
await cp(new URL('node_modules/smol-toml/',root),new URL('runtime/node_modules/smol-toml/',root),{recursive:true});
await writeFile(new URL('runtime/package.json',root),' {"type":"module"}\n');
console.log('Built standalone runtime, including skill resources and dependency.');

await cp(new URL('src/quality-controller/',root),new URL('runtime/quality-controller/',root),{recursive:true});
