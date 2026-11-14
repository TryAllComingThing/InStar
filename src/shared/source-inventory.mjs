import {constants as fsConstants} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openVerified,readHandleVerified,readDirectoryVerified,lstatVerified} from './path-safety.mjs';
import {readBoundedVerified} from './bounded-input.mjs';

const DEFAULT_LIMITS=Object.freeze({maxFiles:50000,maxBytes:512*1024*1024,maxDepth:64,maxDirectoryEntries:10000,maxDirectories:10000});
const MAX_IGNORE_BYTES=1024*1024;
const EXCLUDED_SEGMENTS=new Set(['.git','.hg','.svn','node_modules','dist','build','coverage','reports','logs','.workflow','planning','.next','.nuxt','vendor']);
const EXCLUDED_PATHS=['docs/prd','.instar/session','.instar/baselines'];
const PROTECTED_INPUT_PATHS=['.git','.hg','.svn','.workflow','planning','reports','logs','docs/prd','.instar/session','.instar/baselines'];
const METADATA_NAMES=new Set(['.DS_Store','Thumbs.db','desktop.ini']);
const SENSITIVE_PATH=/(^|\/)(?:\.ssh|\.aws)(?:\/|$)|(^|\/)\.docker\/config\.json$|(^|\/)\.kube\/config$|(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.git-credentials|id_rsa|id_ed25519|credentials\.json|service-account[^/]*\.json|secrets?(?:\.[^/]*)?|.*\.(?:pem|key|p12|pfx|jks))$/i;
const BROAD_IGNORE_PATTERNS=new Set(['*','**','**/*','/*','/**']);
const RISKY_IGNORE_ROOTS=new Set(['src','app','packages','lib','server','client','frontend','backend']);
const SOURCE_EXTENSIONS=/\.(?:[cm]?[jt]sx?|vue|svelte|py|go|rs|java|kt|kts|rb|php|cs|swift|scala|sh|bash|ps1|json|ya?ml|toml|ini|conf|xml|gradle|properties)$/i;
const SECURITY_SEGMENTS=new Set(['auth','authentication','authorization','security','secrets','credentials']);

function slash(value){return value.replaceAll('\\','/');}
function normalizeRelative(value,label='path'){
 if(typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.includes('\0')||value.split(/[\\/]/).includes('..'))throw Error(`${label} must be a safe workspace-relative path`);
 return slash(value).replace(/^\.\//,'').replace(/\/+$/,'');
}
function escapeRegex(text){return text.replace(/[|\\{}()[\]^$+?.]/g,'\\$&');}
function globRegex(pattern,{directory=false}={}){
 let out='';
 for(let index=0;index<pattern.length;index++){
  const char=pattern[index];
  if(char==='*'){
   if(pattern[index+1]==='*'){
    index++;
    if(pattern[index+1]==='/'){index++;out+='(?:.*/)?';}
    else out+='.*';
   }else out+='[^/]*';
  }else if(char==='?')out+='[^/]';
  else out+=escapeRegex(char);
 }
 return new RegExp(`^${out}${directory?'(?:/|$)':'(?:$|/)'}`);
}
function ruleMatcher(raw){
 let pattern=slash(raw.trim());
 if(!pattern||pattern.startsWith('#'))return null;
 const negate=pattern.startsWith('!');
 if(negate)pattern=pattern.slice(1);
 const directory=pattern.endsWith('/');
 pattern=pattern.replace(/^\/+|\/+$/g,'');
 if(!pattern)return null;
 const hasSlash=pattern.includes('/');
 return {negate,directory,regex:globRegex(pattern,{directory}),hasSlash,pattern};
}
function defaultExcluded(relative){
 const parts=relative.split('/');
 if(parts.some(part=>EXCLUDED_SEGMENTS.has(part)))return true;
 if(METADATA_NAMES.has(parts.at(-1)))return true;
 return EXCLUDED_PATHS.some(prefix=>relative===prefix||relative.startsWith(`${prefix}/`));
}
function customIgnored(relative,rules,isDirectory=false){
 let ignored=false;
 for(const rule of rules){
  if(!rule||rule.directory&&!isDirectory)continue;
  const target=relative.split('/').at(-1);
  const matched=rule.hasSlash?rule.regex.test(relative):rule.regex.test(target)||rule.regex.test(relative);
  if(!matched)continue;
  ignored=!rule.negate;
 }
 return ignored;
}
function sourceHidingRule(rule){
 if(rule.negate)return false;
 const pattern=rule.pattern;
 const segments=pattern.split('/').filter(Boolean);
 const hasWildcard=/[*?]/.test(pattern);
 if(RISKY_IGNORE_ROOTS.has(pattern))return true;
 if(RISKY_IGNORE_ROOTS.has(segments[0])&&hasWildcard)return true;
 if(segments.some(segment=>SECURITY_SEGMENTS.has(segment.replace(/[*?].*$/,'')))&&hasWildcard)return true;
 if(hasWildcard&&SOURCE_EXTENSIONS.test(pattern))return true;
 return false;
}
function ignorePolicyFor(text){
 const present=text!==null;
 const rawRules=present?text.split(/\r?\n/).map(value=>value.trim()).filter(value=>value&&!value.startsWith('#')):[];
 const unsupportedRules=rawRules.filter(value=>/[\[\]]/.test(value));
 const rules=present?text.split(/\r?\n/).map(ruleMatcher).filter(Boolean):[];
 const negations=rules.filter(rule=>rule.negate);
 const broad=rules.filter(rule=>BROAD_IGNORE_PATTERNS.has(rule.pattern));
 const riskyRoots=rules.filter(rule=>!rule.negate&&RISKY_IGNORE_ROOTS.has(rule.pattern.replace(/\/+$/,'')));
 const sourceHiding=rules.filter(sourceHidingRule);
 const selfIgnored=present&&customIgnored('.instarignore',rules,false);
 const warnings=[];
 if(broad.length&&!negations.length)warnings.push('Ignore rules hide the entire workspace unless verification inputs force-include files.');
 else if(broad.length)warnings.push('Ignore rules contain a workspace-wide pattern; verify that negated rules preserve all required source paths.');
 if(selfIgnored)warnings.push('The .instarignore policy ignores its own file; its content hash is still bound into the inventory.');
 if(sourceHiding.length)warnings.push(`Ignore rules can hide source or security-sensitive paths: ${[...new Set(sourceHiding.map(rule=>rule.pattern))].join(', ')}.`);
 if(unsupportedRules.length)warnings.push(`Unsupported .instarignore glob syntax must be resolved explicitly: ${unsupportedRules.join(', ')}.`);
 const blocked=(broad.length&&!negations.length)||sourceHiding.length||unsupportedRules.length;
 const risk=blocked?'BLOCK':warnings.length?'WARN':'PASS';
 return {
  policy:{present,hash:present?digest(Buffer.from(text,'utf8')):null,ruleCount:rules.length,negatedRuleCount:negations.length,broadRules:[...new Set(broad.map(rule=>rule.pattern))],riskyRoots:[...new Set(riskyRoots.map(rule=>rule.pattern))],sourceHidingRules:[...new Set(sourceHiding.map(rule=>rule.pattern))],unsupportedRules,selfIgnored,warnings,risk},
  rules
 };
}
async function ignoreRules(root){
 let text=null;
 try{text=await readBoundedVerified(root,'.instarignore',MAX_IGNORE_BYTES);}
 catch(error){if(error.code!=='ENOENT')throw error;}
 return ignorePolicyFor(text);
}
function within(relative,prefix){return relative===prefix||relative.startsWith(`${prefix}/`);}
export function validateInventoryInclude(value,label='inventory include'){
 const relative=normalizeRelative(value,label);
 if(PROTECTED_INPUT_PATHS.some(prefix=>within(relative,prefix)||within(prefix,relative)))throw Error(`${label} cannot reference managed or generated path: ${relative}`);
 return relative;
}
function forceIncluded(relative,include){
 return include.some(prefix=>within(relative,prefix)||within(prefix,relative));
}
function linesFor(buffer){
 if(buffer.includes(0))return {binary:true,lines:0};
 const text=buffer.toString('utf8');
 return {binary:false,lines:text?text.split(/\r\n|\r|\n/).length:0};
}
function digest(buffer){return createHash('sha256').update(buffer).digest('hex');}

/**
 * Build a deterministic workspace inventory without invoking a VCS.
 * Sensitive files are never opened; their paths are omitted from the inventory.
 */
export async function scanSourceInventory(root,{include=[],limits={},label='source inventory'}={}){
 const caps={...DEFAULT_LIMITS,...limits};
 const normalizedInclude=[...new Set(include.map(item=>validateInventoryInclude(item,`${label} include`)))];
 const {rules,policy:ignorePolicy}=await ignoreRules(root);
 if(ignorePolicy.risk==='BLOCK')throw Error(`${label} has an unsafe .instarignore policy: ${ignorePolicy.warnings.join(' ')}`);
 const entries=[],seen=new Set();let bytes=0,directories=0;
 async function add(relative,depth=0){
  if(seen.has(relative))return;
  if(depth>caps.maxDepth)throw Error(`${label} exceeds maximum directory depth of ${caps.maxDepth}`);
  if(entries.length>=caps.maxFiles)throw Error(`${label} exceeds ${caps.maxFiles} files`);
  const forced=relative==='.instarignore'||forceIncluded(relative,normalizedInclude);
  if(relative===''){
   directories++;
   if(directories>caps.maxDirectories)throw Error(`${label} exceed ${caps.maxDirectories.toLocaleString('en-US')} directories`);
   const items=(await readDirectoryVerified(root,'',{maxEntries:caps.maxDirectoryEntries,label:`${label}: .`})).sort((a,b)=>a.name.localeCompare(b.name));
   for(const item of items)await add(item.name,depth+1);
   return;
  }
  if(SENSITIVE_PATH.test(relative)){
   if(forced)throw Error(`${label} cannot include sensitive path: ${relative}`);
   return;
  }
  if(!forced&&(defaultExcluded(relative)||customIgnored(relative,rules,false)))return;
  let stat;
  try{stat=await lstatVerified(root,relative||'.');}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(stat.isDirectory()){
   if(!forced&&(defaultExcluded(relative)||customIgnored(relative,rules,true)))return;
   directories++;
   if(directories>caps.maxDirectories)throw Error(`${label} exceed ${caps.maxDirectories.toLocaleString('en-US')} directories`);
   const items=(await readDirectoryVerified(root,relative||'.',{maxEntries:caps.maxDirectoryEntries,label:`${label}: ${relative||'.'}`})).sort((a,b)=>a.name.localeCompare(b.name));
   for(const item of items)await add(relative?`${relative}/${item.name}`:item.name,depth+1);
   return;
  }
  if(!stat.isFile())throw Error(`Unsupported ${label} entry: ${relative}`);
  const handle=await openVerified(root,relative,fsConstants.O_RDONLY);
  let buffer,opened;
  try{opened=await handle.stat();buffer=await readHandleVerified(root,relative,handle,{maxBytes:caps.maxBytes});}
  finally{await handle.close();}
  bytes+=buffer.length;
  if(bytes>caps.maxBytes)throw Error(`${label} exceeds ${caps.maxBytes} bytes`);
  const lineInfo=linesFor(buffer);
  seen.add(relative);
  entries.push({path:relative,hash:digest(buffer),bytes:opened.size,mode:opened.mode&0o777,lines:lineInfo.lines,binary:lineInfo.binary});
 }
 await add('',0);
 entries.sort((a,b)=>a.path.localeCompare(b.path));
 const policyFingerprint={present:ignorePolicy.present,hash:ignorePolicy.hash,ruleCount:ignorePolicy.ruleCount,negatedRuleCount:ignorePolicy.negatedRuleCount,broadRules:ignorePolicy.broadRules,riskyRoots:ignorePolicy.riskyRoots,sourceHidingRules:ignorePolicy.sourceHidingRules,unsupportedRules:ignorePolicy.unsupportedRules,selfIgnored:ignorePolicy.selfIgnored,warnings:ignorePolicy.warnings,risk:ignorePolicy.risk};
 return {fingerprint:digest(Buffer.from(JSON.stringify({entries,ignorePolicy:policyFingerprint}))),entries,ignorePolicy,files:entries.length,bytes,directories,trust:{mode:'local-evidence',cryptographic:false,scope:'current-workspace'}};
}

export {DEFAULT_LIMITS,SENSITIVE_PATH,defaultExcluded,ignorePolicyFor};
