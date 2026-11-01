import {run} from './index.mjs';
import {readBoundedFile,readBoundedStdin} from '../shared/bounded-input.mjs';
function jsonError(error,text){
 const match=/position (\d+)/.exec(error.message);if(!match)return error.message;
 const position=Number(match[1]),before=text.slice(0,position),line=before.split('\n').length,column=position-(before.lastIndexOf('\n')+1)+1;
 return `${error.message} at line ${line}, column ${column}. Use a request file or stdin for long Markdown fields.`;
}
try {
 const args=process.argv.slice(2);if(args.length!==1)throw Error('Usage: node <plugin>/runtime/workflow-controller/cli.mjs <request.json|->');
 const data=args[0]==='-'?await readBoundedStdin():await readBoundedFile(args[0]);
 let request;try{request=JSON.parse(data);}catch(error){throw Error(jsonError(error,data));}
 console.log(JSON.stringify(await run(request),null,2));
}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
