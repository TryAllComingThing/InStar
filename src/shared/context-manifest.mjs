import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids=items=>Array.isArray(items)?items.map(item=>typeof item==='string'?item:item?.id).filter(Boolean).sort():[];

export function buildContextManifest({state,architecture=null,standards=null,baseline=null,reuse=null,affectedPaths=null}={}){
 const resolved=affectedPaths||standards?.applicability||{inputs:[],paths:[],expanded:[],unknownInputs:[],stack:{observed:false,languages:[],frameworks:[],surfaces:['unknown-stack']}};
 const selected=Array.isArray(standards?.selected)?standards.selected:[];
 const payload={
  schemaVersion:1,
  changeId:state?.changeId||null,
  stage:state?.stage||null,
  affectedPaths:{
   declared:resolved.inputs||[],
   expanded:resolved.paths||[],
   expansion:resolved.expanded||[],
   unknown:resolved.unknownInputs||[],
   stack:resolved.stack||{observed:false,languages:[],frameworks:[],surfaces:['unknown-stack']},
  },
  guidance:architecture?{
   fingerprint:architecture.guidanceFingerprint||null,
   budget:architecture.guidanceBudget||null,
   standardsDirectoryPresent:architecture.standardsDirectoryPresent===true,
   projectStandards:architecture.standardsCatalog?{
    fingerprint:architecture.standardsCatalog.fingerprint||null,
    applicableFingerprint:architecture.standardsFingerprint||null,
    manifestPresent:architecture.standardsCatalog.manifestPresent===true,
    manifestPath:architecture.standardsCatalog.manifestPath||null,
    roots:architecture.standardsCatalog.roots||[],
    fileCount:architecture.standardsCatalog.fileCount||0,
    truncated:architecture.standardsCatalog.truncated===true,
   }:null,
   applicableStandardRules:ids(architecture.applicableStandards?.mandatoryEntries),
   unknownApplicableStandardRules:ids(architecture.applicableStandards?.unknownEntries),
    standardConflictIds:ids(architecture.applicableStandards?.conflicts),
    standardConflictStatus:architecture.applicableStandards?.conflictStatus||'NONE',
  }:null,
  baseline:baseline?{
   present:baseline.present===true,
   fingerprint:baseline.fingerprint||null,
   ruleCount:Array.isArray(baseline.rules)?baseline.rules.length:0,
  }:null,
  reuse:reuse?{
   state:reuse.state||(reuse.enabled?'enabled':'missing'),
   enabled:reuse.enabled===true,
   fingerprint:reuse.fingerprint||null,
   candidateCount:Array.isArray(reuse.capabilities)?reuse.capabilities.length:0,
  }:null,
  standards:standards?{
   fingerprint:standards.fingerprint||null,
   complete:standards.complete===true,
   required:ids(standards.mandatory),
   advisory:selected.filter(item=>item.mandatory!==true).map(item=>item.id).sort(),
   omitted:Array.isArray(standards.omitted)?standards.omitted:[],
   unknowns:Array.isArray(standards.unknowns)?standards.unknowns:[],
   budget:standards.budget||null,
  }:null,
 };
 payload.fingerprint=digest(payload);
 return payload;
}
