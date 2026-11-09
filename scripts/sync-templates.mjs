import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const artifactTemplatePairs=[
 ['skills/spec-propose/assets/proposal.md','src/openspec-min/artifact-templates/proposal.md','src/openspec-min/src/skills/openspec-min-propose/assets/proposal.md'],
 ['skills/spec-propose/assets/spec.md','src/openspec-min/artifact-templates/spec.md','src/openspec-min/src/skills/openspec-min-propose/assets/spec.md'],
 ['skills/spec-tasks/assets/tasks.md','src/openspec-min/artifact-templates/tasks.md','src/openspec-min/src/skills/openspec-min-tasks/assets/tasks.md'],
 ['skills/spec-design/assets/technical-design.md','src/openspec-min/artifact-templates/technical-design.md','src/openspec-min/src/skills/openspec-min-design/assets/technical-design.md'],
];

const root=fileURLToPath(new URL('../',import.meta.url));

async function main(){
 const check=process.argv.includes('--check');
 const drift=[];
 for(const [source,...copies] of artifactTemplatePairs){
  const canonical=await readFile(path.join(root,source));
  for(const copy of copies){
   let current=null;
   try{current=await readFile(path.join(root,copy));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(current?.equals(canonical))continue;
   if(check){drift.push(`${source} != ${copy}`);continue;}
   await writeFile(path.join(root,copy),canonical);
  }
 }
 if(check&&drift.length){console.error(`Artifact template drift:\n${drift.join('\n')}`);process.exitCode=1;return;}
 console.log(check?`Artifact templates are synchronized from ${artifactTemplatePairs.length} canonical sources.`:`Synchronized ${artifactTemplatePairs.length} artifact template sets.`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
