import { cp } from 'node:fs/promises';
// Keep runtime instructions identical to the independently installable skills.
await cp(new URL('../src/skills/', import.meta.url), new URL('../dist/src/skills/', import.meta.url), { recursive: true });
