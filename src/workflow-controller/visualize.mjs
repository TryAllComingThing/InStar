import {requiredVerificationLayers,riskFor} from '../shared/risk-policy.mjs';

const stages=['prd','spec','design','tasks','implementation','verification','archive'];

export function renderWorkflow(state,traces=[],freshness=null){
 const approvals=Object.keys(state.approvals||{});
 const stageIndex=stages.indexOf(state.stage);
 const risk=riskFor(state),verificationPlan=requiredVerificationLayers(risk);
 const lines=[
  `# Workflow: ${state.changeId}`,
  '',
  `- Stage: ${state.stage}`,
  `- Status: ${state.status}`,
  `- Version: ${state.version}`,
  `- Stack: ${state.stack}`,
  `- UI: ${state.ui}`,
  `- Risk: ${risk.tier}${risk.impact?.length?` (${risk.impact.join(', ')})`:''}`,
  `- Verification layers: ${verificationPlan.layers.join(' → ')}${verificationPlan.requireSecurityEvidence?' + governed security evidence':''}`,
  `- Pending approval: ${state.pendingApproval||'none'}`,
  `- Approvals: ${approvals.length?approvals.join(', '):'none'}`,
  `- Open clarifications: ${(state.clarifications||[]).filter(item=>!item.answer).length}`,
  `- Usage budget: ${state.usageBudget?`${state.usageBudget.maxBillableTokens??state.usageBudget.maxTokens??'∞'} ${state.usageBudget.maxBillableTokens!==undefined?'billable tokens':state.usageBudget.maxTokens!==undefined?'total tokens':'tokens'} / ${state.usageBudget.maxApiCalls??'∞'} calls${state.usageBudget.enforce?' (enforced)':' (advisory)'}`:'not configured'}`,
  '',
  '## Stage map',
  '',
  ...stages.map((stage,index)=>`${index<stageIndex?'✓':index===stageIndex?'→':'·'} ${stage}`),
  '',
  '## Recent traces',
  '',
  ...(traces.slice(-10).length?traces.slice(-10).map(item=>`- ${item.at||''} ${item.type||'event'}${item.action?`:${item.action}`:''}${item.skill?`:${item.skill}`:''}${item.role?`:${item.role}`:''}`):['- none']),
  ...(freshness?['','## Evidence freshness','',`- Source: ${freshness.sourceHash}`,`- Implementation: ${freshness.implementation?.status||'missing'}`,`- Verification: ${freshness.verification?.status||'missing'}`,...(freshness.qualityGate?[`- Quality gate: ${freshness.qualityGate.status}`]:[])]:[])
 ];
 return {markdown:lines.join('\n')+'\n',summary:{changeId:state.changeId,stage:state.stage,status:state.status,version:state.version,approvals,pendingApproval:state.pendingApproval||null,risk,verificationPlan,usageBudget:state.usageBudget||null,evidenceFreshness:freshness,recentTraceCount:Math.min(traces.length,10)}};
}
