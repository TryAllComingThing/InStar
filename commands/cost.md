---
description: Show workflow cost lanes, observed usage and missing telemetry without treating missing values as zero.
---

Run `instar cost show --project <path> [--change <id>]` for the selected workflow and `instar cost lanes --json` for lane definitions. Use `micro` or `quick` only for small changes that still satisfy the risk floor; L2 changes require at least `standard`, and L3 requires `regulated`.

Report observed `activeMs`, `waitMs`, elapsed time, token usage, tool calls and model responses separately. `insufficient-telemetry` means metrics are missing, not that usage is zero. Budget warnings never authorize skipping review, verification, semantic evaluation or manual approval.
