// Mandatory-check coverage is separate from the command runner. A waiver never changes raw execution results.
const categories=['Q-01','Q-02','Q-03','Q-04','Q-05','Q-06','Q-07'];
const checkId = value => typeof value==='string' && value.trim() ? value : null;
const checkIdsFor = entry => entry.checkIds ? [...entry.checkIds] : [entry.checkId];
export function validateQualityPolicy(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schemaVersion!==1||!p.profiles||typeof p.profiles!=='object')throw Error('Invalid qualityPolicy');
 for(const profile of ['commit','full']){
  const items=p.profiles[profile];if(!Array.isArray(items)||!items.length)throw Error(`qualityPolicy.profiles.${profile} required`);
  const ids=new Set();for(const item of items){
   const hasSingle=checkId(item?.checkId)!==null,hasMany=Array.isArray(item?.checkIds);
   const listed=hasMany?item.checkIds:hasSingle?[item.checkId]:[];
   if(!categories.includes(item?.category)||ids.has(item.category)||hasSingle===hasMany||!listed.length||listed.some(id=>checkId(id)===null)||new Set(listed).size!==listed.length)throw Error('Invalid or duplicate mandatory check category');
   ids.add(item.category);
  }
  if(!ids.has('Q-07'))throw Error('Q-07 evidence integrity must be configured');
  if(profile==='full' && categories.some(category=>!ids.has(category)))throw Error('Full profile must explicitly cover Q-01 through Q-07');
 }
 if(p.waivers!==undefined){if(!Array.isArray(p.waivers))throw Error('Invalid qualityPolicy waivers');for(const w of p.waivers){if(!w||typeof w.category!=='string'||w.category==='Q-07'||!categories.includes(w.category)||typeof w.checkId!=='string'||!w.checkId.trim()||typeof w.reason!=='string'||!w.reason.trim()||typeof w.approvedBy!=='string'||!w.approvedBy.trim()||typeof w.expiresAt!=='string'||!Number.isFinite(Date.parse(w.expiresAt))||typeof w.scopeFingerprint!=='string'||!w.scopeFingerprint||typeof w.compensatingControl!=='string'||!w.compensatingControl.trim()||typeof w.risk!=='string'||!w.risk.trim())throw Error('Invalid waiver; Q-07 cannot be waived');}}
}
export function evaluateQualityPolicy(p,profile,checks,snapshot,clock=new Date()){
 validateQualityPolicy(p);const mandatory=p.profiles[profile],results=[],waivers=[];
 for(const entry of mandatory){
  const sourceChanged=(snapshot.changed||[]).some(name=>!['.instar-quality.json','package.json','package-lock.json'].includes(name));
  const required=checkIdsFor(entry),details=[];let failed=false,blocked=false,waived=false;
  for(const id of required){
   const actual=checks.find(c=>c.id===id);
   if(actual?.status==='PASS'){details.push({checkId:id,status:'PASS',rawStatus:'PASS'});continue;}
   const w=(p.waivers||[]).find(w=>w.category===entry.category&&w.checkId===id&&((w.scopeFingerprint===snapshot.fingerprint)||(!sourceChanged&&w.scopeFingerprint===snapshot.head))&&Date.parse(w.expiresAt)>clock.getTime());
   if(w){waived=true;waivers.push({category:w.category,checkId:w.checkId,reason:w.reason,approvedBy:w.approvedBy,expiresAt:w.expiresAt,scopeFingerprint:w.scopeFingerprint,risk:w.risk,compensatingControl:w.compensatingControl,rawStatus:actual?.status||'NOT_RUN'});details.push({checkId:id,status:'WAIVED',rawStatus:actual?.status||'NOT_RUN'});continue;}
   if(actual?.status==='BLOCK')failed=true;else blocked=true;
   details.push({checkId:id,status:actual?.status==='BLOCK'?'FAIL':'BLOCKED',rawStatus:actual?.status||'NOT_RUN'});
  }
  const status=failed?'FAIL':blocked?'BLOCKED':waived?'WAIVED':'PASS';
  const identity=entry.checkIds?{checkIds:[...entry.checkIds],checks:details}:{checkId:entry.checkId,rawStatus:details[0].rawStatus};
  results.push({category:entry.category,...identity,status});
 }
 const status=results.some(x=>x.status==='FAIL')?'FAIL':results.some(x=>x.status==='BLOCKED')?'BLOCK':waivers.length?'PASS_WITH_WAIVERS':'PASS';
 return {schemaVersion:1,status,mandatory:results,waivers,checkedAt:clock.toISOString(),snapshotFingerprint:snapshot.fingerprint};
}
