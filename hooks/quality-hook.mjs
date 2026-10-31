import path from 'node:path';
import {access} from 'node:fs/promises';
import {run} from '../runtime/quality-controller/index.mjs';
import {readBoundedStdin} from '../runtime/shared/bounded-input.mjs';
let event;
try {
  const text=await readBoundedStdin();
  event=JSON.parse(text);
  if(!path.isAbsolute(event.cwd || '')) throw Error('Hook cwd missing');
  // Resolve opt-in configuration from nested working directories.
  const originalCwd=event.tool_input?.workdir || event.cwd;
  let project=path.resolve(originalCwd);
  while(true) {
    try { await access(path.join(project,'.instar-quality.json')); break; }
    catch(e) { if(e.code!=='ENOENT') throw e; const parent=path.dirname(project); if(parent===project) process.exit(0); project=parent; }
  }
  if(event.hook_event_name==='SessionEnd') {
    const result=await run({project,action:'session-close',sessionId:event.session_id});
    if(result.status==='WARN') console.error(`InStar session-close warning: ${result.reason}`);
  } else if(event.hook_event_name==='PreToolUse') {
    const command=event.tool_input?.command ?? event.tool_input?.cmd ?? '';
    const commit=/\bgit\b[\s\S]*\bcommit\b/.test(command);
    const pr=/\bgh\b[\s\S]*\bpr\s+create\b/.test(command);
    if(commit || pr) {
      // Only a simple invocation in the known cwd is inspectable. No cd, git -C,
      // pipes, substitutions, shell wrappers or combined mutating commands.
      if(!/^(git\s+commit\b|gh\s+pr\s+create\b)/.test(command.trim()) || /[;&|\n`<>]|\$\(|--repo\b|\s-R\b/.test(command)) throw Error('Run a standalone git commit or gh pr create in the configured project root after quality verification');
      if(path.resolve(originalCwd)!==project) throw Error('Run commit/PR from the configured repository root');
      await run({project,action:commit?'pre-commit-check':'pre-pr-check'});
    }
  }
} catch(error) {
  if(event?.hook_event_name==='SessionEnd') console.error(`InStar session-close warning: ${error.message}`);
  else {
    console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:`InStar: ${error.message}. Run $frontend-verify (commit/full profile) and $quality-gate, then retry. Hooks do not launch networked AI review.`}}));
  }
}
