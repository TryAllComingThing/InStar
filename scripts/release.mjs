import {access,cp,mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const release=path.join(root,'release');
const staging=await mkdtemp(path.join(root,'.release-staging-'));
const plugin=path.join(staging,'plugins/instar');
const files=['LICENSE','THIRD-PARTY-NOTICES.md','README.md','runtime','skills','standards','docs','.codex-plugin','hooks','commands','assets','logs','bin'];
const hashTree=async directory=>{
 const entries=[];
 const walk=async current=>{
  const names=(await (await import('node:fs/promises')).readdir(current,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of names){
   if(entry.name==='.DS_Store')continue;
   const full=path.join(current,entry.name),relative=path.relative(directory,full).replaceAll(path.sep,'/');
   if(entry.isDirectory())await walk(full);
   else if(entry.isFile())entries.push([relative,createHash('sha256').update(await readFile(full)).digest('hex')]);
  }
 };
 await walk(directory);return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
};
const git=(...args)=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}catch{return null;}};
try {
 await mkdir(plugin,{recursive:true});
 for(const name of files)await cp(path.join(root,name),path.join(plugin,name),{recursive:true,filter:source=>!source.endsWith('.DS_Store')});
 await mkdir(path.join(staging,'.agents/plugins'),{recursive:true});
 await writeFile(path.join(staging,'.agents/plugins/marketplace.json'),JSON.stringify({name:'instar-local',interface:{displayName:'InStar'},plugins:[{name:'instar',source:{source:'local',path:'./plugins/instar'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Development'}]},null,2)+'\n');
 const packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 const provenance={schemaVersion:1,packageName:packageJson.name,packageVersion:packageJson.version,sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),nodeVersion:process.version,npmVersion:git('--version'),builtAt:new Date().toISOString(),runtimeHash:await hashTree(path.join(root,'runtime')),releasePluginHash:await hashTree(plugin)};
 await writeFile(path.join(plugin,'RELEASE-PROVENANCE.json'),JSON.stringify(provenance,null,2)+'\n');
 const backup=`${release}.backup-${randomUUID()}`;
 let moved=false;
 try {
  await access(release);await rename(release,backup);moved=true;
 } catch(error) {if(error.code!=='ENOENT')throw error;}
 try { await rename(staging,release); } catch(error) {
  if(moved)await rename(backup,release);
  throw error;
 }
 if(moved)await rm(backup,{recursive:true,force:true});
 console.log('Release: release/plugins/instar; marketplace: release/.agents/plugins/marketplace.json');
} catch(error) {
 await rm(staging,{recursive:true,force:true});
 throw error;
}
