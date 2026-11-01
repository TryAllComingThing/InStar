import path from 'node:path';
import {access} from 'node:fs/promises';
import {run} from '../runtime/quality-controller/index.mjs';
import {readBoundedStdin} from '../runtime/shared/bounded-input.mjs';

let event;
try {
  event=JSON.parse(await readBoundedStdin());
  const eventName=event.hook_event_name;
  if(eventName==='PreToolUse') {
    // Bash is a broad matcher. Filter before any filesystem lookup so ordinary
    // tool calls have effectively zero InStar quality-hook work.
    const command=String(event.tool_input?.command ?? event.tool_input?.cmd ?? '').trim();
    const commitIntent=/\bgit\b[\s\S]*\bcommit\b/.test(command);
    const prIntent=/\bgh\s+pr\s+create\b/.test(command);
    if(!commitIntent && !prIntent) process.exit(0);
    const commit=/^git\s+commit\b/.test(command);
    const pr=/^gh\s+pr\s+create\b/.test(command);
    if(/[;&|\n`<>]|\$\(|--repo\b|\s-R\b/.test(command)) throw Error('Run a standalone git commit or gh pr create in the configured project root after quality verification');
    if(!path.isAbsolute(event.cwd || '')) throw Error('Hook cwd missing');
    const originalCwd=event.tool_input?.workdir || event.cwd;
    if(!path.isAbsolute(originalCwd || '')) throw Error('Hook workdir missing');
    let project=path.resolve(originalCwd);
    while(true) {
      try { await access(path.join(project,'.instar-quality.json')); break; }
      catch(e) { if(e.code!=='ENOENT') throw e; const parent=path.dirname(project); if(parent===project) process.exit(0); project=parent; }
    }
    if(path.resolve(originalCwd)!==project) throw Error('Run commit/PR from the configured repository root');
    await run({project,action:commit?'pre-commit-check':'pre-pr-check'});
  } else if(eventName==='SessionEnd') {
    if(!path.isAbsolute(event.cwd || '')) throw Error('Hook cwd missing');
    let project=path.resolve(event.cwd);
    while(true) {
      try { await access(path.join(project,'.instar-quality.json')); break; }
      catch(e) { if(e.code!=='ENOENT') throw e; const parent=path.dirname(project); if(parent===project) process.exit(0); project=parent; }
    }
    // SessionEnd only finalizes an explicit session-summary. Do not create an
    // empty audit file for every ordinary Codex session.
    try { await access(path.join(project,'logs','pending-session.json')); }
    catch(e) { if(e.code==='ENOENT') process.exit(0); throw e; }
    const result=await run({project,action:'session-close',sessionId:event.session_id});
    if(result.status==='WARN') console.error(`InStar session-close warning: ${result.reason}`);
  }
} catch(error) {
  if(event?.hook_event_name==='SessionEnd') console.error(`InStar session-close warning: ${error.message}`);
  else {
    console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:`InStar: ${error.message}. Run $frontend-verify (commit/full profile) and $quality-gate, then retry. Hooks do not launch networked AI review.`}}));
  }
}
