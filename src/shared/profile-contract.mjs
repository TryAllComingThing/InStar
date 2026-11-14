const PROFILE_NAMES=Object.freeze(['preflight','commit','implementation','full']);
const PROFILE_ALIASES=Object.freeze({commit:'preflight'});
export const MAX_REPORT_BYTES=8*1024*1024;
export const MAX_ARTIFACT_BYTES=32*1024*1024;

export function isProfileName(profile){
 return PROFILE_NAMES.includes(profile);
}

export function assertProfileName(profile){
 if(!PROFILE_NAMES.includes(profile))throw Error(`profile must be ${PROFILE_NAMES.join(', ')}`);
 return profile;
}

export function normalizeProfileName(profile){
 assertProfileName(profile);
 return PROFILE_ALIASES[profile]??profile;
}

export function verificationReportKind(profile){
 return `engineering-verify-${normalizeProfileName(profile)}`;
}

export function verificationReportVariants(profile){
 const canonical=normalizeProfileName(profile);
 const variants=[{profile:canonical,kind:`engineering-verify-${canonical}`}];
 if(canonical==='preflight')variants.push({profile:'commit',kind:'engineering-verify-commit'});
 return variants;
}

export function requiredWorkflowKinds(profile,ui=false){
 const normalized=normalizeProfileName(profile);
 const base={preflight:[],implementation:['lint','format','test'],full:['build','security']}[normalized];
 if(normalized==='implementation'&&ui)return [...base,'browser'];
 if(normalized==='full'&&ui)return [...base,'accessibility','keyboard'];
 return base;
}
