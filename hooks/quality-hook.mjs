import path from 'node:path';
import {access} from 'node:fs/promises';
import {run} from '../runtime/quality-controller/index.mjs';
import {readBoundedStdin} from '../runtime/shared/bounded-input.mjs';
async function findUp(start,file){
 let current=path.resolve(start);
 while(true){
  try{await access(path.join(current,file));return current;}
  catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(current);if(parent===current)return null;current=parent;}
 }
}
let event;
try {
  const text=await readBoundedStdin();
  event=JSON.parse(text);
  if(!path.isAbsolute(event.cwd || '')) throw Error('Hook cwd missing');
  // Resolve opt-in configuration from nested working directories.
  const originalCwd=event.tool_input?.workdir || event.cwd;
  const qualityProject=await findUp(originalCwd,'.instar-quality.json');
  const project=await findUp(originalCwd,'.instar.json')||qualityProject;
  if(!project)process.exit(0);
  if(event.hook_event_name==='SessionEnd') {
    // The host gives SessionEnd a very small budget. Keep the two independent
    // writes concurrent so one slow path does not prevent the other from running.
    const close=run({project,action:'session-close',sessionId:event.session_id}).then(result=>{
      if(result.status==='WARN') console.error(`InStar session-close warning: ${result.reason}`);
    }).catch(error=>console.error(`InStar session-close warning: ${error.message}`));
    const usage=(async()=>{
      await access(path.join(project,'.instar.json'));
      const {run:runWorkflow}=await import('../runtime/workflow-controller/index.mjs');
      const result=await runWorkflow({project,action:'import-session-usage',sessionId:event.session_id});
      if(result.status==='SKIPPED'&&result.reason)console.error(`InStar token telemetry skipped: ${result.reason}`);
    })().catch(error=>{if(error.code!=='ENOENT')console.error(`InStar token telemetry warning: ${error.message}`);});
    await Promise.allSettled([close,usage]);
  }
} catch(error) {
  console.error(`InStar session-close warning: ${error.message}`);
}
