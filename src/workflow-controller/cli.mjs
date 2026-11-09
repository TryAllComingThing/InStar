// Official JSON entrypoint for workflow automation. It is executed directly by
// docs/USAGE.md, test/cli.test.mjs and scripts/smoke-release.mjs; the absence of
// a static import from another controller module is expected. Do not remove.
import {run} from './index.mjs';
import {readBoundedFile,readBoundedStdin} from '../shared/bounded-input.mjs';
try {
 const args=process.argv.slice(2);if(args.length!==1)throw Error('Usage: node <plugin>/runtime/workflow-controller/cli.mjs <request.json|->');
 const data=args[0]==='-'?await readBoundedStdin():await readBoundedFile(args[0]);
 console.log(JSON.stringify(await run(JSON.parse(data)),null,2));
}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
