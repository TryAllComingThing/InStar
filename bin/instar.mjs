#!/usr/bin/env node
const command = process.argv[2];
if (command === 'spec-discover') {
  const {main} = await import('../runtime/discovery-controller/cli.mjs');
  await main(process.argv.slice(3));
} else if (['flow','doc','find','standards','cost','explain'].includes(command)) {
  const {main} = await import('../runtime/workflow-controller/friendly-cli.mjs');
  await main(process.argv.slice(2));
} else {
  await import('../runtime/quality-controller/cli.mjs');
}
