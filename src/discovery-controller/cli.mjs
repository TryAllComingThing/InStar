import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './index.mjs';
import {redactText} from '../shared/redaction.mjs';
import {readBoundedFile,readBoundedStdin} from '../shared/bounded-input.mjs';

export async function parseDiscoveryArgs(args,cwd=process.cwd()) {
  if (!args.length) return {action:'context',project:path.resolve(cwd)};
  if (args.length === 1 && !args[0].startsWith('--')) {
    let data = '';
    if (args[0] === '-') data = await readBoundedStdin();
    else data = await readBoundedFile(path.resolve(cwd,args[0]));
    return JSON.parse(data);
  }
  const values = new Map(), scopes = [];
  let preview = false;
  for (let i=0;i<args.length;i++) {
    const flag = args[i];
    if (flag === '--preview') { preview = true; continue; }
    if (!['--project','--scope','--input'].includes(flag)) throw Error(`Unknown discovery option: ${flag}`);
    if (!args[i+1] || args[i+1].startsWith('--')) throw Error(`Option requires a value: ${flag}`);
    const value = args[++i];
    if (flag === '--scope') scopes.push(value);
    else { if (values.has(flag)) throw Error(`Duplicate option: ${flag}`); values.set(flag,value); }
  }
  if (values.has('--input')) {
    const input = JSON.parse(await readBoundedFile(path.resolve(cwd,values.get('--input'))));
    if (input.action !== 'capture') throw Error('--input expects an action:capture request');
    if (scopes.length || values.has('--project')) throw Error('Capture project/scopes come from --input; do not override them');
    if (preview) input.preview = true;
    return input;
  }
  if (preview) throw Error('--preview requires --input');
  return {action:'context',project:path.resolve(cwd,values.get('--project') || '.'),...(scopes.length?{scopes}:{})};
}

export async function main(args=process.argv.slice(2)) {
  try { console.log(JSON.stringify(await run(await parseDiscoveryArgs(args)),null,2)); }
  catch(error) { console.error(JSON.stringify({status:'BLOCK',error:redactText(error.message)})); process.exitCode=1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
