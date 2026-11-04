---
description: Discover existing capabilities, project standards, architecture context or current specs before designing or coding.
---

Use `$reuse-discover`, `$project-discover` or `$spec-discover` according to the target, then run the matching read-only command:

```sh
instar find reuse --query "<needed capability>" --json
instar find standards --path <path> [--changed] --json
instar find architecture --json
instar find spec --scope <path> --json
```

Return matches with paths, summaries, freshness/hash and recommended next steps. Discovery is not adoption: do not rewrite project policy or treat a candidate as selected without an explicit design/reuse decision.
