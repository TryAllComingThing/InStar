import path from 'node:path';
import {readBoundedFile,assertBoundedText} from '../shared/bounded-input.mjs';

const usage = 'Usage: instar <doctor|snapshot|verify|review|ci> [options]';

export async function parseFriendlyArgs(args, cwd = process.cwd()) {
  const [command, ...tokens] = args;
  const actions = {doctor:'doctor',snapshot:'snapshot',verify:'frontend-verify',review:'quality-gate',ci:'ci'};
  if (!actions[command]) return null;
  const input = {action:actions[command],project:path.resolve(cwd)};
  let phase;
  const values = new Map();
  const flags = new Set();
  for (let i=0;i<tokens.length;i++) {
    const token=tokens[i];
    if (!token.startsWith('--')) {
      if (command==='ci' && !phase && ['prepare','publish','status'].includes(token)) { phase=token; continue; }
      throw Error(`Unexpected argument: ${token}. ${usage}`);
    }
    if (['--confirm'].includes(token)) { flags.add(token); continue; }
    if (!['--project','--profile','--risk','--phase','--review-file','--title','--body','--body-file'].includes(token)) throw Error(`Unknown option: ${token}`);
    if (i+1>=tokens.length || tokens[i+1].startsWith('--')) throw Error(`Option requires a value: ${token}`);
    values.set(token,tokens[++i]);
  }
  const allowedValues={doctor:['--project'],snapshot:['--project'],verify:['--project','--profile','--risk'],review:['--project','--review-file','--risk'],ci:['--project','--phase','--title','--body','--body-file']};
  const allowedFlags={doctor:[],snapshot:[],verify:[],review:[],ci:['--confirm']};
  for(const option of values.keys())if(!allowedValues[command].includes(option))throw Error(`${option} is not supported by ${command}`);
  for(const flag of flags)if(!allowedFlags[command].includes(flag))throw Error(`${flag} is not supported by ${command}`);
  if (values.has('--project')) input.project=path.resolve(cwd,values.get('--project'));
  if (command==='verify') {
    input.profile=values.get('--profile') || 'full';
    if (!['commit','full'].includes(input.profile)) throw Error('profile must be commit or full');
    if (values.has('--risk')) input.riskLevel=values.get('--risk');
  }
  if (command==='review') {
    const reviewFile=values.get('--review-file');
    if (!reviewFile) throw Error('review requires --review-file <review.json>');
    const parsed=JSON.parse(await readBoundedFile(path.resolve(cwd,reviewFile)));
    input.review=parsed.review || parsed;
    if (values.has('--risk')) input.riskLevel=values.get('--risk');
  }
  if (command==='ci') {
    input.phase=values.get('--phase') || phase;
    if (!input.phase) throw Error('ci requires a phase: prepare, publish, or status');
    if (!['prepare','publish','status'].includes(input.phase)) throw Error('ci phase must be prepare, publish, or status');
    if (values.has('--title')) input.title=values.get('--title');
    if (values.has('--body') && values.has('--body-file')) throw Error('Choose only one of --body or --body-file');
    if (values.has('--body')) input.body=assertBoundedText(values.get('--body'),'--body');
    if (values.has('--body-file')) input.body=await readBoundedFile(path.resolve(cwd,values.get('--body-file')));
    if (input.phase==='prepare' && !input.title) throw Error('ci prepare requires --title <title>');
    if (input.phase==='publish') {
      if (!flags.has('--confirm')) throw Error('ci publish requires --confirm to authorize feature-branch push and PR publication');
      if (!input.title) throw Error('ci publish requires --title <title>');
      input.authorization='User explicitly confirmed via InStar CLI';
    }
  }
  return input;
}
