import {normalizeUsage} from './usage-telemetry.mjs';

export const usageTotalsKeys=['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','billableTokens'];
const nonNegativeInteger=(value,label)=>{if(!Number.isInteger(value)||value<0)throw Error(`${label} must be a non-negative integer`);return value;};
export const emptyUsageTotals=()=>Object.fromEntries(usageTotalsKeys.map(key=>[key,0]));

export function validateUsageBudget(value){
 if(value===undefined)throw Error('usageBudget is required; pass null to clear the budget explicitly');
 if(value===null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('usageBudget must be an object');
 const budget={};
 for(const key of ['maxBillableTokens','maxTokens','maxApiCalls']){
  if(value[key]!==undefined)budget[key]=nonNegativeInteger(value[key],`usageBudget.${key}`);
 }
 if(value.enforce!==undefined){if(typeof value.enforce!=='boolean')throw Error('usageBudget.enforce must be a boolean');budget.enforce=value.enforce;}
 if(!Object.keys(budget).some(key=>key!=='enforce'))throw Error('usageBudget requires maxBillableTokens, maxTokens or maxApiCalls');
 return budget;
}

function reportTotals(report,label){
 if(!report||typeof report!=='object'||Array.isArray(report))throw Error(`${label} must be an object`);
 const raw=report.totals??{};
 if(typeof raw!=='object'||Array.isArray(raw))throw Error(`${label}.totals must be an object`);
 const totals=Object.fromEntries(usageTotalsKeys.map(key=>[key,nonNegativeInteger(raw[key]??0,`${label}.totals.${key}`)]));
 if(totals.cachedInputTokens>totals.inputTokens)throw Error(`${label}.totals.cachedInputTokens cannot exceed inputTokens`);
 if(totals.reasoningOutputTokens>totals.outputTokens)throw Error(`${label}.totals.reasoningOutputTokens cannot exceed outputTokens`);
 totals.totalTokens=Math.max(totals.totalTokens,totals.inputTokens+totals.outputTokens);
 totals.billableTokens=Math.max(totals.billableTokens,Math.max(0,totals.inputTokens-totals.cachedInputTokens+totals.outputTokens));
 if(Array.isArray(report.records)){
  const computed=emptyUsageTotals();let apiCalls=0;
  for(const [index,record] of report.records.entries()){
   if(!record||typeof record!=='object'||Array.isArray(record))throw Error(`${label}.records[${index}] must be an object`);
   if(record.changeId!==undefined&&report.changeId!==undefined&&record.changeId!==report.changeId)throw Error(`${label}.records[${index}].changeId does not match the report`);
   const usage=normalizeUsage(record.usage,`${label}.records[${index}].usage`);
   for(const key of usageTotalsKeys)computed[key]+=usage[key];
   apiCalls+=nonNegativeInteger(record.apiCalls??1,`${label}.records[${index}].apiCalls`);
  }
  for(const key of usageTotalsKeys){
   if(totals[key]<computed[key])throw Error(`${label}.totals.${key} cannot be less than the sum of its records`);
  }
  const reportedCalls=nonNegativeInteger(report.apiCalls??apiCalls,`${label}.apiCalls`);
  if(reportedCalls<apiCalls)throw Error(`${label}.apiCalls cannot be less than the sum of its records`);
  report.apiCalls=Math.max(reportedCalls,apiCalls);
 }
 if(report.apiCalls!==undefined)nonNegativeInteger(report.apiCalls,`${label}.apiCalls`);
 report.totals=totals;
 return report;
}

export function applyUsageBudget(report,budget=null){
 const checked=reportTotals(report,'usage report');
 if(budget){
  const validated=validateUsageBudget(budget);
  const exceeded=(validated.maxBillableTokens!==undefined&&checked.totals.billableTokens>validated.maxBillableTokens)||(validated.maxTokens!==undefined&&checked.totals.totalTokens>validated.maxTokens)||(validated.maxApiCalls!==undefined&&(checked.apiCalls||0)>validated.maxApiCalls);
  checked.budget={...validated,status:exceeded?'exceeded':'within',basis:validated.maxBillableTokens!==undefined?'billable-tokens':validated.maxTokens!==undefined?'total-tokens':'api-calls',enforced:validated.enforce===true,checkedAt:new Date().toISOString()};
 }else delete checked.budget;
 return checked;
}
