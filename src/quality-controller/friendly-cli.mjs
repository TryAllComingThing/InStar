import path from 'node:path';
import {readBoundedFile} from '../shared/bounded-input.mjs';
import {normalizeProfileName} from '../shared/profile-contract.mjs';

const usage = 'Usage: instar <doctor|snapshot|verify|review> [options]';
const commandUsage = {
  doctor:'Usage: instar doctor [--project <path>]',
  snapshot:'Usage: instar snapshot [--project <path>]',
  verify:'Usage: instar verify [--project <path>] [--profile preflight|implementation|full] [--layer L1|L2|L3] [--files a,b] [--no-cache] (legacy alias: commit)',
  review:'Usage: instar review [--project <path>] --review-file <review.json>'
};

export function usageFor(command) {
  return commandUsage[command] || usage;
}

export async function parseFriendlyArgs(args, cwd = process.cwd()) {
  const [command, ...tokens] = args;
  const actions = {doctor:'doctor',snapshot:'snapshot',verify:'frontend-verify',review:'quality-gate'};
  if (!actions[command]) return null;
  const input = {action:actions[command],project:path.resolve(cwd)};
  const values = new Map();
  const flags = new Set();
  for (let i=0;i<tokens.length;i++) {
    const token=tokens[i];
    if (!token.startsWith('--')) {
      throw Error(`Unexpected argument: ${token}. ${usage}`);
    }
    if (['--no-cache'].includes(token)) { flags.add(token); continue; }
    if (!['--project','--profile','--layer','--files','--review-file'].includes(token)) throw Error(`Unknown option: ${token}`);
    if (i+1>=tokens.length || tokens[i+1].startsWith('--')) throw Error(`Option requires a value: ${token}`);
    values.set(token,tokens[++i]);
  }
  const allowedValues={doctor:['--project'],snapshot:['--project'],verify:['--project','--profile','--layer','--files'],review:['--project','--review-file']};
  const allowedFlags={doctor:[],snapshot:[],verify:['--no-cache'],review:[]};
  for(const option of values.keys())if(!allowedValues[command].includes(option))throw Error(`${option} is not supported by ${command}`);
  for(const flag of flags)if(!allowedFlags[command].includes(flag))throw Error(`${flag} is not supported by ${command}`);
  if (values.has('--project')) input.project=path.resolve(cwd,values.get('--project'));
  if (command==='verify') {
    const layerValue=String(values.get('--layer') || '').toLowerCase();
    input.profile=normalizeProfileName(values.get('--profile') || (values.has('--layer')&&!['l3','frozen-full'].includes(layerValue)?'implementation':'full'));
    if (values.has('--layer')) input.layer=values.get('--layer');
    if (values.has('--files')) input.files=values.get('--files').split(',').map(item=>item.trim()).filter(Boolean);
    input.cache=!flags.has('--no-cache');
  }
  if (command==='review') {
    const reviewFile=values.get('--review-file');
    if (!reviewFile) throw Error('review requires --review-file <review.json>');
    const parsed=JSON.parse(await readBoundedFile(path.resolve(cwd,reviewFile)));
    input.review=parsed.review || parsed;
  }
  return input;
}
