---
description: Inspect or advance the reviewed InStar workflow through the friendly CLI.
---

Use `$requirements-workflow` for this change. Start with `instar flow status --project <path> [--change <id>]` and `instar flow next`; read `instar flow context --json` before generating any artifact. Use `instar flow start --change <id> --document <file> [--lane micro|quick|fast|standard|regulated]` only when starting a new tracked change, and `instar flow action <action> --input <request.json>` for advanced transitions. Preview mutating requests with `--dry-run`; never infer human approval.

Before design and implementation, inspect `instar find standards`, `instar find architecture`, and `instar find reuse`. Follow applicable project-owned rules before plugin references. Do not bypass controller fingerprints or fabricate approval evidence.
