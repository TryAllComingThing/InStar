const stages=['prd','spec','design','tasks','implementation','verification','archive'];

export function renderWorkflow(state,traces=[]){
 const approvals=Object.keys(state.approvals||{});
 const stageIndex=stages.indexOf(state.stage);
 const lines=[
  `# Workflow: ${state.changeId}`,
  '',
  `- Stage: ${state.stage}`,
  `- Status: ${state.status}`,
  `- Version: ${state.version}`,
  `- Stack: ${state.stack}`,
  `- UI: ${state.ui}`,
  `- Pending approval: ${state.pendingApproval||'none'}`,
  `- Approvals: ${approvals.length?approvals.join(', '):'none'}`,
  `- Open clarifications: ${(state.clarifications||[]).filter(item=>!item.answer).length}`,
  '',
  '## Stage map',
  '',
  ...stages.map((stage,index)=>`${index<stageIndex?'✓':index===stageIndex?'→':'·'} ${stage}`),
  '',
  '## Recent traces',
  '',
  ...(traces.slice(-10).length?traces.slice(-10).map(item=>`- ${item.at||''} ${item.type||'event'}${item.action?`:${item.action}`:''}${item.skill?`:${item.skill}`:''}${item.role?`:${item.role}`:''}`):['- none'])
 ];
 return {markdown:lines.join('\n')+'\n',summary:{changeId:state.changeId,stage:state.stage,status:state.status,version:state.version,approvals,pendingApproval:state.pendingApproval||null,recentTraceCount:Math.min(traces.length,10)}};
}
