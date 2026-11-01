import {spawnSync} from 'node:child_process';
import {redactData,boundedText} from '../shared/redaction.mjs';

function command(root, executable, args, input) {
  const result=spawnSync(executable,args,{cwd:root,input,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,env:{...process.env,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0'}});
  // Never persist raw CLI diagnostics: authentication failures can include secrets.
  if((result.status!==0 && !(executable==='gh' && args[0]==='pr' && args[1]==='checks' && [1,8].includes(result.status))) || result.error) throw Error(`${executable} ${args[0]} failed (${result.error?.code || result.status}); inspect the CLI locally`);
  return result.stdout.trim();
}
export function assessChecks(checks, required) {
  const findings=required.map(name=>{
    const entries=checks.filter(c=>c.name===name);
    if(entries.length!==1) return {name,status:'BLOCK',reason:entries.length?'Ambiguous duplicate check name':'Required check missing'};
    const c=entries[0];
    return {name,status:c.bucket==='pass'?'PASS':c.bucket==='pending'?'PENDING':'BLOCK',reason:c.state,url:c.link};
  });
  for(const c of checks.filter(c=>!required.includes(c.name))) findings.push({name:c.name,status:c.bucket==='pass'?'PASS':c.bucket==='pending'?'PENDING':'BLOCK',reason:c.state,url:c.link});
  return {status:findings.some(c=>c.status==='BLOCK')?'BLOCK':findings.some(c=>c.status==='PENDING')?'PENDING':'PASS',checks:findings};
}
export async function orchestrate(root,input,api,execute=(exe,args,body)=>command(root,exe,args,body)) {
  const {config,prePr,git,json,write,save}=api;
  const c=await config(root), ci=c.ci, phase=input.phase || 'prepare';
  if(!['prepare','publish','status'].includes(phase)) throw Error('ci phase must be prepare, publish or status');
  if(!ci) return save(root,'ci',{status:'WARN',phase,configured:false,reason:'CI/GitHub integration is not configured; local verification, Review and provenance remain available'});
  if(!/^[\w.-]+\/[\w.-]+$/.test(ci.repo || '') || !/^[a-z0-9.-]+$/.test(ci.host || '') || !/^[\w.-]+$/.test(ci.remote || '')) throw Error('Invalid ci configuration: configure repo, host and remote together');
  const branch=git(root,['branch','--show-current']);
  const base=ci.base;
  if(!base || !/^[a-zA-Z0-9][\w./-]*$/.test(base) || c.baseRef!==base) throw Error('ci.base must match baseRef');
  if(!branch || ['main','master',base].includes(branch)) throw Error('CI requires a feature branch');
  const evidence=await prePr(root), head=evidence.snapshot.head;
  if(head===evidence.snapshot.base) throw Error('No feature commit to publish');
  const ignored=name=>/^(reports|logs)\//.test(name) || /^\.instar\/session\//.test(name) || /^\.context\/(PROJECT_STATE|LESSONS)\.md$/.test(name);
  const modified=git(root,['diff','HEAD','--name-only','-z']).split('\0').filter(Boolean).filter(n=>!ignored(n));
  const untracked=git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean).filter(n=>!ignored(n));
  if(modified.length || untracked.length) throw Error('Commit reviewed source/config before CI; working tree must match HEAD');
  const title=typeof input.title==='string'?input.title.trim():'';
  const local=await json(root,`reports/${c.verification?'engineering':'frontend'}-verify-full.json`), review=await json(root,'reports/quality-gate.json');
  const payload=redactData({schemaVersion:1,head,base:evidence.snapshot.base,local,review,provenance:evidence.provenance});
  const serialized=JSON.stringify(payload);
  // A body is a real transport to GitHub, unlike an inaccessible local artifact path.
  const body=`${input.body?boundedText(input.body,6000):'Software change verified with InStar.'}\n\n## Validation\nHEAD: ${head}\nBase: ${base} (${evidence.snapshot.base})\n\n${evidence.snapshot.changed.map(n=>'- '+JSON.stringify(n)).join('\n')}\n\n## Session summary\n${boundedText(evidence.provenance.summary,6000)}\n\n<details><summary>InStar verification and Review evidence</summary>\n\n<!-- instar-evidence:start -->\n\`\`\`json\n${serialized}\n\`\`\`\n<!-- instar-evidence:end -->\n</details>\n`;
  if(body.length>60000) throw Error('PR evidence exceeds 60000 characters; reduce reviewed evidence before publishing');
  await write(root,'reports/pr-body.md',body);
  if(phase==='prepare') {
    if(!title) throw Error('PR title required');
    return save(root,'ci',{status:'PREPARED',head,base,branch,repo:ci.repo,title,bodyFile:'reports/pr-body.md',reportUrl:null});
  }
  if(!Array.isArray(ci.allowedHosts) || !ci.allowedHosts.includes(ci.host)) throw Error('CI host is not explicitly allowed');
  const requiredChecks=ci.requiredChecks;
  const riskLevel=evidence.riskLevel||'L1';
  const repoArg=`${ci.host}/${ci.repo}`;
  const gh=(args,body)=>execute('gh',args,body);
  const ghJson=args=>JSON.parse(gh(args));
  const endpoint=`repos/${ci.repo}`;
  const get=route=>ghJson(['api','--hostname',ci.host,`${endpoint}${route}`]);
  const verifyBranchProtection=()=>{
    const protection=get(`/branches/${encodeURIComponent(base)}/protection/required_status_checks`);
    const contexts=new Set([...(protection.contexts||[]),...(protection.checks||[]).map(check=>check.context||check.name).filter(Boolean)]);
    const missing=requiredChecks.filter(name=>!contexts.has(name));
    if(missing.length)throw Error(`L3 branch protection is missing required checks: ${missing.join(', ')}`);
  };
  let prUrl=null;
  try {
    const remote=git(root,['remote','get-url','--push','--all',ci.remote]);
    const allowed=[`https://${ci.host}/${ci.repo}`,`https://${ci.host}/${ci.repo}.git`,`git@${ci.host}:${ci.repo}.git`,`ssh://git@${ci.host}/${ci.repo}.git`];
    if(!allowed.includes(remote)) throw Error('Push remote must exactly match configured host/repository (one URL, no embedded credentials)');
    const repo=get('');
    if(branch===repo.default_branch) throw Error('Cannot push the remote default branch');
    const remoteBase=get(`/git/ref/heads/${encodeURIComponent(base)}`);
    if(remoteBase.object?.sha!==evidence.snapshot.base) throw Error('Remote base changed; fetch and reverify before publishing');
    if(!Array.isArray(requiredChecks) || !requiredChecks.length || !requiredChecks.includes(ci.secretCheck) || !ci.secretCheck) throw Error('Effective required checks must include the configured secretCheck');
    if(riskLevel==='L3'){
      const configuredL3Checks=c.riskPolicy?.l3?.requiredChecks||[];
      if(configuredL3Checks.some(name=>!requiredChecks.includes(name)))throw Error('L3 risk policy checks must be included in ci.requiredChecks');
      verifyBranchProtection();
    }
    const existing=ghJson(['pr','list','--repo',repoArg,'--head',branch,'--base',base,'--state','open','--json','number,url,headRefOid']);
    if(existing.length>1) throw Error('Multiple matching PRs; select manually');
    let pr=existing[0];
    if(phase==='publish') {
      if(typeof input.authorization!=='string' || !input.authorization.trim()) throw Error('Record user authorization for feature push and PR publication');
      if(!title) throw Error('PR title required');
      if(evidence.provenance.aiGenerated) await get('/labels/ai-generated'); // fail before push if label is unavailable
      await save(root,'ci-intent',{status:'PREPARED',head,base,branch,repo:ci.repo,existingPr:pr?.url || null});
      if((await api.snapshot(root)).fingerprint!==evidence.snapshot.fingerprint) throw Error('Workspace changed before push');
      execute('git',['push',remote,`${head}:refs/heads/${branch}`]); // explicit feature ref, never force
      const remoteHead=get(`/git/ref/heads/${encodeURIComponent(branch)}`);
      if(remoteHead.object?.sha!==head) throw Error('Pushed SHA differs from reviewed SHA');
      const bodyPath=await api.safe(root,'reports/pr-body.md');
      if(pr) {
        gh(['pr','edit',String(pr.number),'--repo',repoArg,'--title',title,'--body-file',bodyPath,...(evidence.provenance.aiGenerated?['--add-label','ai-generated']:[])]);
      } else {
        gh(['pr','create','--repo',repoArg,'--base',base,'--head',branch,'--title',title,'--body-file',bodyPath,...(evidence.provenance.aiGenerated?['--label','ai-generated']:[])]);
      }
      pr=ghJson(['pr','view',branch,'--repo',repoArg,'--json','number,url,headRefOid']);
    }
    if(!pr) throw Error('No matching open PR; publish first');
    prUrl=pr.url;
    // REST confirms identity; gh checks alone can refer to another head after a concurrent push.
    const detail=get(`/pulls/${pr.number}`);
    if(detail.head?.sha!==head || detail.base?.ref!==base) throw Error('PR head/base differs from local verification');
    if(!detail.body?.includes(serialized)) throw Error('Published Review payload missing or differs from local evidence');
    const checks=ghJson(['pr','checks',String(pr.number),'--repo',repoArg,'--json','name,state,bucket,link']);
    const assessment=assessChecks(checks,requiredChecks);
    const runs=ghJson(['run','list','--repo',repoArg,'--commit',head,'--json','databaseId,url,headSha,status,conclusion','--limit','30']);
    const failures=[];
    for(const run of runs.filter(r=>r.headSha===head && ['failure','cancelled','timed_out'].includes(r.conclusion))) {
      const detail=ghJson(['run','view',String(run.databaseId),'--repo',repoArg,'--json','jobs']);
      failures.push({runId:run.databaseId,url:run.url,jobs:(detail.jobs || []).filter(j=>j.conclusion!=='success').map(j=>({name:j.name,conclusion:j.conclusion,steps:(j.steps || []).filter(s=>['failure','cancelled'].includes(s.conclusion)).map(s=>({name:s.name,number:s.number,conclusion:s.conclusion}))}))});
    }
    // Recheck after reading checks to catch concurrent remote pushes.
    if(get(`/pulls/${pr.number}`).head?.sha!==head) throw Error('PR changed while reading CI');
    return save(root,'ci',{...assessment,head,base,branch,repo:ci.repo,prUrl,reportUrl:prUrl,reportTransport:'PR body',runs:runs.filter(r=>r.headSha===head),failures,note:'PR event triggers configured CI. Pending/missing checks never pass. Call status later; no unbounded polling.'});
  } catch(error) {
    await save(root,'ci',{status:'BLOCK',head,base,branch,repo:ci.repo,prUrl,reason:error.message,recovery:'Inspect existing feature branch/PR before retry; never force-push or recreate blindly'});
    throw error;
  }
}
