const PROFILE_NAMES=Object.freeze(['commit','implementation','full']);
export const MAX_REPORT_BYTES=8*1024*1024;
export const MAX_ARTIFACT_BYTES=32*1024*1024;

export function assertProfileName(profile){
 if(!PROFILE_NAMES.includes(profile))throw Error(`profile must be ${PROFILE_NAMES.join(', ')}`);
 return profile;
}

export function verificationReportKind(profile){
 assertProfileName(profile);
 return `engineering-verify-${profile}`;
}

export function requiredWorkflowKinds(profile,ui=false){
 assertProfileName(profile);
 const base={commit:[],implementation:['lint','format','test'],full:['security']}[profile];
 if(profile==='implementation'&&ui)return [...base,'browser'];
 if(profile==='full'&&ui)return [...base,'accessibility','keyboard'];
 return base;
}
