---
description: Inspect applicable project standards and validate a design Compliance Matrix.
---

Use project-owned standards before plugin references. Run `instar standards context --path <path> --json` to inspect the manifest, configured roots and applicable mandatory rules. Run `instar standards check --document <technical-design.md> --path <path>` to validate the `Compliance Matrix` before `write-design`.

For Review, cite every applicable mandatory rule in `standardsReferences` with `PASS/WARN/NA` and concrete evidence. Missing references block the quality gate; advisory rules do not become blocking merely because they exist in the plugin catalog.
