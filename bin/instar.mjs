#!/usr/bin/env node
if (process.argv[2] === 'spec-discover') {
  const {main} = await import('../runtime/discovery-controller/cli.mjs');
  await main(process.argv.slice(3));
} else if (process.argv[2] === 'status') {
  const {main} = await import('../runtime/workflow-controller/status-cli.mjs');
  await main(process.argv.slice(3));
} else {
  await import('../runtime/quality-controller/cli.mjs');
}
