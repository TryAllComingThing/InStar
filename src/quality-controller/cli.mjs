import {run} from './index.mjs';
import {redactText} from '../shared/redaction.mjs';
import {parseFriendlyArgs} from './friendly-cli.mjs';
import {readBoundedFile,readBoundedStdin} from '../shared/bounded-input.mjs';
try {
  const args = process.argv.slice(2);
  const shortcut = await parseFriendlyArgs(args);
  if (shortcut) {
    const result = await run(shortcut);
    console.log(JSON.stringify(result,null,2));
    if(['FAIL','BLOCK'].includes(result.status)) process.exitCode=1;
  } else {
    const [file,...rest] = args;
    if (!file || rest.length) throw Error('Usage: instar <doctor|snapshot|verify|review|ci> [options] OR node <plugin>/runtime/quality-controller/cli.mjs <request.json|->');
  const text = file==='-' ? await readBoundedStdin() : await readBoundedFile(file);
  const result = await run(JSON.parse(text));
  console.log(JSON.stringify(result,null,2));
  if(['FAIL','BLOCK'].includes(result.status)) process.exitCode=1;
  }
} catch(error) { console.error(JSON.stringify({status:'BLOCK',error:redactText(error.message)})); process.exitCode=1; }
