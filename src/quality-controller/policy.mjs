// Mandatory-check coverage is separate from the command runner. A waiver never changes raw execution results.
const categories=['Q-01','Q-02','Q-03','Q-04','Q-05','Q-06','Q-07'];
export function validateQualityPolicy(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schemaVersion!==1||!p.profiles||typeof p.profiles!=='object')throw Error('Invalid qualityPolicy');
 for(const profile of ['commit','full']){
  const items=p.profiles[profile];if(!Array.isArray(items)||!items.length)throw Error(`qualityPolicy.profiles.${profile} required`);
  const ids=new Set();for(const item of items){if(!categories.includes(item.category)||typeof item.checkId!=='string'||!item.checkId||ids.has(item.category))throw Error('Invalid or duplicate mandatory check category');ids.add(item.category);}
  if(!ids.has('Q-07'))throw Error('Q-07 evidence integrity must be configured');
  if(profile==='full' && categories.some(category=>!ids.has(category)))throw Error('Full profile must explicitly cover Q-01 through Q-07');
 }
 if(p.waivers!==undefined){if(!Array.isArray(p.waivers))throw Error('Invalid qualityPolicy waivers');for(const w of p.waivers){if(!w||typeof w.category!=='string'||w.category==='Q-07'||!categories.includes(w.category)||typeof w.reason!=='string'||!w.reason.trim()||typeof w.approvedBy!=='string'||!w.approvedBy.trim()||typeof w.expiresAt!=='string'||!Number.isFinite(Date.parse(w.expiresAt))||typeof w.scopeFingerprint!=='string'||!w.scopeFingerprint||typeof w.compensatingControl!=='string'||!w.compensatingControl.trim()||typeof w.risk!=='string'||!w.risk.trim())throw Error('Invalid waiver; Q-07 cannot be waived');}}
}
export function evaluateQualityPolicy(p,profile,checks,snapshot,clock=new Date()){
 validateQualityPolicy(p);const mandatory=p.profiles[profile],results=[],waivers=[];
 for(const entry of mandatory){
  const actual=checks.find(c=>c.id===entry.checkId);
  if(actual?.status==='PASS'){results.push({category:entry.category,checkId:entry.checkId,status:'PASS'});continue;}
  const sourceChanged=(snapshot.changed||[]).some(name=>!['.instar-quality.json','package.json','package-lock.json'].includes(name));
  const w=(p.waivers||[]).find(w=>w.category===entry.category&&w.checkId===entry.checkId&&((w.scopeFingerprint===snapshot.fingerprint)||(!sourceChanged&&w.scopeFingerprint===snapshot.head))&&Date.parse(w.expiresAt)>clock.getTime());
  if(w){waivers.push({category:w.category,checkId:w.checkId,reason:w.reason,approvedBy:w.approvedBy,expiresAt:w.expiresAt,scopeFingerprint:w.scopeFingerprint,risk:w.risk,compensatingControl:w.compensatingControl,rawStatus:actual?.status||'NOT_RUN'});results.push({category:entry.category,checkId:entry.checkId,status:'WAIVED',rawStatus:actual?.status||'NOT_RUN'});}
  else results.push({category:entry.category,checkId:entry.checkId,status:actual?.status==='BLOCK'?'FAIL':'BLOCKED',rawStatus:actual?.status||'NOT_RUN'});
 }
 const status=results.some(x=>x.status==='FAIL')?'FAIL':results.some(x=>x.status==='BLOCKED')?'BLOCK':waivers.length?'PASS_WITH_WAIVERS':'PASS';
 return {schemaVersion:1,status,mandatory:results,waivers,checkedAt:clock.toISOString(),snapshotFingerprint:snapshot.fingerprint};
}
