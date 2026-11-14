#!/usr/bin/env node
if (process.argv[2] === 'spec-discover') {
  const {main} = await import('../runtime/discovery-controller/cli.mjs');
  await main(process.argv.slice(3));
} else if (process.argv[2] === 'status') {
  const {main} = await import('../runtime/workflow-controller/status-cli.mjs');
  await main(process.argv.slice(3));
} else if (process.argv[2] === 'quick') {
  process.argv.splice(2, 1);
  if (!process.argv[2]) process.argv.push('-');
  await import('../runtime/quick-controller/cli.mjs');
} else if (process.argv[2] === 'micro') {
  process.argv.splice(2, 1);
  if (!process.argv[2]) process.argv.push('-');
  await import('../runtime/micro-controller/cli.mjs');
} else {
  await import('../runtime/quality-controller/cli.mjs');
}
