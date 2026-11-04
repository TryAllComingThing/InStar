const requirementId=/\b(?:REQ|NFR)-[A-Z0-9][A-Z0-9_.-]*\b/gi;
const requiredHeaders=['requirement','design','implementation','verification'];

export function extractRequirementIds(documents=[]){
 const values=Array.isArray(documents)?documents:[documents],result=new Set();
 for(const document of values){for(const match of String(document||'').matchAll(requirementId))result.add(match[0].replace(/[.-]+$/,'').toUpperCase());}
 return [...result].sort();
}

function section(document){
 const heading=/^#{2,4}\s+Requirement Traceability\s*$/im.exec(document);
 if(!heading)return null;
 const start=heading.index+heading[0].length,rest=document.slice(start),next=/\n#{1,4}\s+\S[^\n]*\n/.exec(rest);
 return rest.slice(0,next?next.index:rest.length);
}

function tableRows(text){
 const rows=[];
 for(const line of text.split(/\r?\n/)){
  if(!/^\s*\|/.test(line))continue;
  const cells=line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim().replace(/^`|`$/g,''));
  if(cells.every(cell=>/^:?-{3,}:?$/.test(cell)))continue;
  rows.push(cells);
 }
 return rows;
}

export function validateRequirementTraceability(document,requiredIds=[]){
 const required=[...new Set((Array.isArray(requiredIds)?requiredIds:[]).map(value=>String(value).toUpperCase()))].sort();
 if(!required.length)return {status:'NOT_REQUIRED',required:[],present:[]};
 const body=section(document);
 if(!body)throw Error(`Technical design must include a Requirement Traceability section for: ${required.join(', ')}`);
 const rows=tableRows(body);
 if(rows.length<2)throw Error('Requirement Traceability must contain a header and at least one requirement row');
 const headers=rows[0].map(value=>value.toLowerCase());
 for(const header of requiredHeaders)if(!headers.includes(header))throw Error(`Requirement Traceability must include a ${header} column`);
 const index=Object.fromEntries(requiredHeaders.map(header=>[header,headers.indexOf(header)]));
 const present=[],seenIds=[];
 for(const row of rows.slice(1)){
  const id=String(row[index.requirement]||'').replace(/`/g,'').trim().toUpperCase();
  if(id)seenIds.push(id);
 }
 for(const id of required)if(!seenIds.includes(id))throw Error(`Requirement Traceability is missing requirement: ${id}`);
 for(const row of rows.slice(1)){
  const id=String(row[index.requirement]||'').replace(/`/g,'').trim().toUpperCase();
  if(!id)continue;
  if(!required.includes(id))throw Error(`Requirement Traceability references an unknown requirement: ${id}`);
  const evidence=requiredHeaders.filter(header=>header!=='requirement').map(header=>({header,value:String(row[index[header]]||'').trim()}));
  if(evidence.some(item=>!item.value))throw Error(`Requirement Traceability ${id} requires design, implementation and verification evidence`);
  present.push({id,...Object.fromEntries(evidence.map(item=>[item.header,item.value]))});
 }
 return {status:'MAPPED',required,present};
}
