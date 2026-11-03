export const riskLevels=['L0','L1','L2','L3'];
export const riskRank=level=>riskLevels.indexOf(level);
export const builtInRiskRules=[
 {riskLevel:'L3',patterns:['.github/workflows/**','**/auth/**','**/authentication/**','**/authorization/**','**/migrations/**','**/migration/**','**/payments/**','**/payment/**','**/infrastructure/**','**/infra/**','**/terraform/**']},
 {riskLevel:'L2',patterns:['**/api/**','**/routes/**','**/database/**','**/db/**','**/permissions/**']},
];

export function normalizeRiskLevel(value='L1') {
 if (typeof value !== 'string' || !riskLevels.includes(value)) throw Error('riskLevel must be L0, L1, L2 or L3');
 return value;
}

function globRegex(pattern) {
 let escaped='';
 for(let index=0;index<pattern.length;index++){
  const char=pattern[index],next=pattern[index+1];
  if(char==='*'&&next==='*'&&pattern[index+2]==='/'){escaped+='(?:.*/)?';index+=2;continue;}
  if(char==='/'&&next==='*'&&pattern[index+2]==='*'){escaped+='(?:/.*)?';index+=2;continue;}
  if(char==='*'){escaped+='[^/]*';continue;}
  if(char==='?'){escaped+='[^/]';continue;}
  escaped+=('.+^${}()|[]\\'.includes(char)?`\\${char}`:char);
 }
 return new RegExp(`^${escaped}$`);
}

export function pathMatches(pattern,name) { return globRegex(pattern.replaceAll('\\','/')).test(String(name).replaceAll('\\','/')); }
export function riskRules(c={}) { return [...builtInRiskRules,...(c.riskPolicy?.rules||[])]; }
export function inferredRiskLevel(c={},changed=[]) {
 let level='L1';
 for(const rule of riskRules(c)) if(rule.patterns.some(pattern=>changed.some(name=>pathMatches(pattern,name))) && riskRank(rule.riskLevel)>riskRank(level)) level=rule.riskLevel;
 return level;
}
export function effectiveRiskLevel(c={},requested='L1',changed=[]) {
 const declared=normalizeRiskLevel(requested), inferred=inferredRiskLevel(c,changed);
 return riskRank(inferred)>riskRank(declared)?inferred:declared;
}
