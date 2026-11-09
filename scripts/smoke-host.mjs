// Verify the current release through the real Codex plugin host, in an isolated CODEX_HOME.
import assert from 'node:assert/strict';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import readline from 'node:readline';

const root=fileURLToPath(new URL('../',import.meta.url));
const release=path.join(root,'release');
const marketplace=path.join(release,'.agents/plugins/marketplace.json');
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
await access(marketplace);
const home=await mkdtemp(path.join(tmpdir(),'instar-host-'));
const env={...process.env,CODEX_HOME:home};
const hostVersion=spawnSync('codex',['--version'],{encoding:'utf8',env}).stdout.trim();
assert.match(hostVersion,/^codex-cli \d/,'Codex CLI must be available on PATH');
const commandNames=['design-check','doctor','extract-design-md','spec-discover'].map(name=>`instar:source-command-${name}`).sort();
let server;

function run(args){
 const result=spawnSync('codex',args,{encoding:'utf8',env,timeout:30000});
 assert.equal(result.status,0,`codex ${args.join(' ')} failed\n${result.stderr||result.stdout}`);
 return result.stdout;
}

function startServer(){
 server=spawn('codex',['app-server'],{env,stdio:['pipe','pipe','pipe']});
 let next=1;
 const pending=new Map();
 const timeout=setTimeout(()=>{server.kill();for(const item of pending.values())item.reject(Error('Codex app-server request timed out'));pending.clear();},30000);
 const lines=readline.createInterface({input:server.stdout});
 lines.on('line',line=>{
  let message;
  try{message=JSON.parse(line);}catch{return;}
  if(!message.id||!pending.has(message.id))return;
  const item=pending.get(message.id);
  pending.delete(message.id);
  message.error?item.reject(Error(`${item.method}: ${JSON.stringify(message.error)}`)):item.resolve(message.result);
 });
 server.on('exit',code=>{for(const item of pending.values())item.reject(Error(`Codex app-server exited (${code}) during ${item.method}`));pending.clear();});
 function send(method,params){
  const id=next++;
  server.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  return new Promise((resolve,reject)=>pending.set(id,{resolve,reject,method}));
 }
 return {send,stop(){clearTimeout(timeout);lines.close();server.stdin.end();server.kill();}};
}

try{
 run(['plugin','marketplace','add',release,'--json']);
 run(['plugin','add','instar@instar-local','--json']);
 const rpc=startServer();
 await rpc.send('initialize',{clientInfo:{name:'instar-host-smoke',version:'1.0.0'},capabilities:{experimentalApi:true}});
 const listed=await rpc.send('plugin/list',{cwds:[root]});
 assert.deepEqual(listed.marketplaceLoadErrors,[],'marketplace load errors');
 const detail=await rpc.send('plugin/read',{pluginName:'instar',marketplacePath:marketplace});
 const plugin=detail.plugin;
 assert.equal(plugin.summary.localVersion,version);
 assert.equal(plugin.summary.installed,true);
 assert.equal(plugin.summary.enabled,true);
 assert.equal(plugin.skills.length,21,'plugin Skill count');
 assert.equal(plugin.hooks.length,2,'plugin Hook count');
 assert.deepEqual(plugin.mcpServers,[]);
 const skills=await rpc.send('skills/list',{cwds:[root],forceReload:true});
 const entries=skills.data.flatMap(item=>item.skills??[]).filter(item=>item.pluginId==='instar@instar-local');
 const commands=entries.filter(item=>item.name.startsWith('instar:source-command-')).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(commands.map(item=>item.name),commandNames,'migrated command Skills');
 assert.ok(commands.every(item=>item.enabled),'migrated command Skills must be enabled');
 const doctor=commands.find(item=>item.name==='instar:source-command-doctor');
 const doctorSource=await readFile(doctor.path,'utf8');
 assert.doesNotMatch(doctorSource,/\.\.\//,'migrated command must not use depth-sensitive relative paths');
 assert.match(doctorSource,/插件包根目录的 `docs\/QUALITY\.md`/);
 rpc.stop();
 console.log(`PASS: ${hostVersion} installed InStar ${version} with 21 skills, 2 hooks and ${commands.length} migrated command Skills.`);
}finally{
 if(server&&!server.killed)server.kill();
 await rm(home,{recursive:true,force:true});
}
