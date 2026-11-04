const FILE_LIKE=/\.[a-z0-9][a-z0-9._-]*$/i;
const CONFIG_FILE=/(^|\/)(Dockerfile|Makefile|package\.json|pyproject\.toml|requirements[^/]*\.txt|tsconfig\.json|go\.mod|Cargo\.toml)$/i;
import {inferPathStack} from './stack-profiles.mjs';

function cleanPath(value){
 return String(value).trim().replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,'');
}

export function normalizeAffectedPaths(value=[]){
 if(!Array.isArray(value)||value.length>50)throw Error('affectedPaths must be a bounded list');
 const result=[];
 for(const item of value){
  if(typeof item!=='string'||!item.trim()||item.includes('..')||item.includes('\\')||item.startsWith('/'))throw Error('Invalid affectedPaths');
  const normalized=cleanPath(item);
  if(normalized&&!result.includes(normalized))result.push(normalized);
 }
 return result;
}

export function projectTreeFiles(projectTree=''){
 return String(projectTree||'').split(/\r?\n/).flatMap(line=>{
  const trimmed=line.trim();
  if(!trimmed||trimmed.startsWith('[dir]')||trimmed.startsWith('[symlink omitted]'))return [];
  const candidate=trimmed.replace(/^\[[^\]]+\]\s*/,'').replaceAll('\\','/');
  return FILE_LIKE.test(candidate)||CONFIG_FILE.test(candidate)?[candidate]:[];
 });
}

export function inferStack(paths=[]){
 const languages=new Set(),frameworks=new Set(),surfaces=new Set();
 const inferred=inferPathStack(paths);
 for(const language of inferred.languages)languages.add(language);
 for(const framework of inferred.frameworks)frameworks.add(framework);
 for(const value of paths){
  const file=cleanPath(value),extension=file.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if(extension==='.py'&&/(^|\/)(pyproject\.toml|requirements[^/]*\.txt)$/.test(file))frameworks.add('python');
  if(/(^|\/)(api|routers|routes|controllers)\//.test(file))surfaces.add('api');
  if(/(^|\/)(auth|authentication|authorization|login|session|token)([./_-]|$)/i.test(file))surfaces.add('auth');
  if(/(^|\/)(db|database|migrations?|models)\//.test(file))surfaces.add('database');
  if(/(^|\/)(components|views|pages)\//.test(file))surfaces.add('ui');
 }
 if(!languages.size&&!frameworks.size)surfaces.add('unknown-stack');
 return {
  observed:languages.size>0||frameworks.size>0,
  languages:[...languages].sort(),
  frameworks:[...frameworks].sort(),
  surfaces:[...surfaces].sort(),
 };
}

export function expandAffectedPaths({affectedPaths=[],projectTree='',limit=32}={}){
 const inputs=normalizeAffectedPaths(affectedPaths),tree=projectTreeFiles(projectTree),expanded=new Map(),unknownInputs=[];
 for(const input of inputs){
  if(FILE_LIKE.test(input)||CONFIG_FILE.test(input)){
   expanded.set(input,[input]);
   continue;
  }
  const prefix=`${input}/`,matches=tree.filter(file=>file.startsWith(prefix)).slice(0,limit);
  if(matches.length)expanded.set(input,matches);
  else unknownInputs.push(input);
 }
 const paths=[...new Set([...expanded.values()].flat())].sort();
 return {
  inputs,
  paths,
  expanded:[...expanded.entries()].map(([input,files])=>({input,files})),
  unknownInputs,
  stack:inferStack(paths),
 };
}

export function validateChangedPathsCoverage({affectedPaths=[],changed=[],projectTree=''}={}){
 const normalizedChanged=[...new Set((Array.isArray(changed)?changed:[]).map(cleanPath).filter(Boolean))].sort();
 const expansion=expandAffectedPaths({affectedPaths,projectTree});
 const covered=new Set(expansion.paths);
 const undeclared=normalizedChanged.filter(file=>!covered.has(file));
 if(undeclared.length)throw Error(`Changed source paths are outside affectedPaths: ${undeclared.slice(0,12).join(', ')}${undeclared.length>12?`; +${undeclared.length-12} more`:''}. Reopen PRD, review the scope and affectedPaths, then regenerate downstream artifacts`);
 return {...expansion,changed:normalizedChanged,undeclared};
}
