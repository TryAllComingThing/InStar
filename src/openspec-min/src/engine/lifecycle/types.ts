export interface ChangeRef { root:string; changeId:string }
export interface SpecPackage { proposal:string; specs:Record<string,string> }
export interface GenerationContext {
  instruction:string;
  prd?:string;
  proposal?:string;
  specs:Record<string,string>;
  baseline:Record<string,string>;
  technicalDesign?:string;
}
export interface GateResult { valid:boolean; issues:string[] }
