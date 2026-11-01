import {mkdir,cp,writeFile,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),release=new URL('release/',root),plugin=new URL('plugins/instar/',release);
await rm(release,{recursive:true,force:true});await mkdir(plugin,{recursive:true});
for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md','README.md','runtime','skills','standards','docs','.codex-plugin','hooks','commands','assets','logs','bin'])await cp(new URL(name,root),new URL(name,plugin),{recursive:true,filter:source=>!source.endsWith('.DS_Store')});
await mkdir(new URL('.agents/plugins/',release),{recursive:true});
await writeFile(new URL('.agents/plugins/marketplace.json',release),JSON.stringify({name:'instar-local',interface:{displayName:'InStar'},plugins:[{name:'instar',source:{source:'local',path:'./plugins/instar'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Development'}]},null,2)+'\n');
console.log('Release: release/plugins/instar; marketplace: release/.agents/plugins/marketplace.json');
