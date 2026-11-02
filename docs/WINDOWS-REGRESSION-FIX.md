# Windows regression repair

## Changes

- Spec creation commits staging into an absent destination under the existing project lock, avoiding Windows directory replacement errors while preserving duplicate-create rejection.
- npm scripts run through a shared process adapter. Windows executes the installed npm JS entry using Node and argument arrays, without enabling a general shell.
- Schema 3 accepts native absolute executable paths while rejecting NUL/newline input.
- CLI tests convert file URLs with fileURLToPath; fault injection uses platform-native path joining.
- Build dependency pruning uses path.relative instead of URL pathname slicing.
- Symlink tests detect host support and explicitly skip when unavailable; temporary cleanup has bounded retries for Windows file locks.

## Validation

`npm test` completed successfully: 120 tests, 111 passed, 0 failed, 9 skipped.
The nine skips require symbolic-link support and must run on a capable CI worker;
they are not verified security passes. A further independent path-traversal test
was added during the run and passed separately (one pass, one symlink skip).
Build, static checks and git diff whitespace validation passed.

The preceding 67-failure baseline is superseded for this local environment by this
result. No production deployment, release publication or external GitHub checks
were performed. Windows timeout handling still depends on Node child-process
semantics; npm descendant process-tree supervision is not introduced by this fix.
