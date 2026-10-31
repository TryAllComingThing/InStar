# Discovery controller

Resolve `<plugin>` from this installed skill, not the target project's current
directory. Node >=20.19 is required. The release contains dependencies and compiled
code. This controller neither runs a model nor executes application code.

## Context

```sh
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project
node <plugin>/bin/instar.mjs spec-discover --project /absolute/project --scope src/orders --scope tests/orders
```

Equivalent JSON, passed as a file or stdin to the discovery controller:

```json
{"action":"context","project":"/absolute/project","scopes":["src/orders","tests/orders"]}
```

The read-only result includes `instruction` (adapted OpenSpec discovery method),
`inventory` (relative paths, line counts and raw file SHA-256 hashes), `baseline`
(complete loaded specs), `baselineIndex` (paths, hashes and requirement names for
all existing specs), `activeChanges` (workflow ID/stage/status summaries), `omitted`,
`scopes`, and `contextHash`. For projects with over 4 MiB of baseline documents,
context selects capabilities matching the source scope. Override selection with
`baselineCapabilities`, for example `"baselineCapabilities":["orders/search"]`;
include the same option in context and capture requests. It is required before
updating a capability omitted from the loaded full specs.
The complete baseline index remains fingerprinted, so any baseline change invalidates
the context. Source bodies are read by
the host agent's local file tools. Add dependency scopes before citing them. Ancestor
AGENTS.md and root package.json are included when present. Hidden files, symlinks,
dependencies, generated output, planning/openspec artifacts and known credential
files are excluded. Files over 1 MiB and unsupported formats are reported as omitted.
The snapshot is bounded to 30,000 visited entries, 10,000 text files / 64 MiB;
exceeding aggregate limits fails explicitly. Use narrower scopes, and report exclusions.

## Capture

Write request JSON to a temporary file OUTSIDE the project so it does not change
the source inventory after context capture. Do not interpolate source prose into
shell commands. `specs` contains complete main specs, not change deltas:

```json
{
  "action": "capture",
  "project": "/absolute/project",
  "scopes": ["src/orders", "tests/orders"],
  "contextHash": "<from context>",
  "preview": true,
  "specs": {"orders/search": "<complete Markdown>"},
  "evidence": {
    "orders/search": [{
      "requirement": "Search orders",
      "path": "src/orders/search.ts",
      "startLine": 12,
      "endLine": 16,
      "excerpt": "<exact nonempty substring within those source lines>"
    }]
  },
  "reviewedFiles": ["src/orders/search.ts", "tests/orders/search.test.ts"],
  "limitations": ["Remote API implementation is outside this repository"],
  "update": []
}
```

Each requirement needs evidence using its exact parsed name. Line numbers are
1-based; the excerpt is checked after CRLF normalization. Source and baseline changes
invalidate `contextHash`. Citations must reference inventoried, reviewed files.
Only locations and source hashes are persisted, not source excerpts.

```sh
node <plugin>/bin/instar.mjs spec-discover --input /tmp/discovery-request.json --preview
# After reviewing the preview, set preview:false (or omit it) in the request:
node <plugin>/bin/instar.mjs spec-discover --input /tmp/discovery-request.json
# Equivalent lower-level entry:
node <plugin>/runtime/discovery-controller/cli.mjs /tmp/discovery-request.json
```

Preview writes nothing. Capture writes `planning/specs/<capability>/spec.md` and
`planning/discovery/<uuid>.json` with evidence, limitations and reviewed/unreviewed
file lists. Nested capability paths are preserved. No `.instar.json`, PRD, proposal,
tasks or fake approval are created. The baseline remains `not-human-reviewed`;
it describes the observed implementation and is consumable by later delta workflows.

Existing capabilities fail unless listed in `update`, which requires an explicit
user update request. Supply their complete revised documents, preserving unaffected
requirements and manual sections. The controller protects files outside the package;
semantic preservation within an updated document is the author's responsibility.
Preview and final discovery reports list added, removed and modified requirement
names, plus scenario names under `requirementChanges.scenarios.added`, `.removed` and
`.modified`. Review both requirement and scenario lists: a scenario-only edit leaves
the requirement-level lists unchanged. Duplicate/empty requirement and scenario names
are rejected because update summaries use names as stable identifiers.
Context and the final report disclose active workflow IDs/stages/statuses; note when
a scope describes work in progress.
Existing tracked workflow reviews may become stale after baseline changes.

Capture uses the normal `.workflow/controller.lock` and transaction journal. Previous
planning/docs-prd trees remain in `.workflow/transactions/<uuid>/before`; ordinary
errors roll them back. Interrupted writes leave `.workflow/pending.json`; inspect it
and send `{"action":"recover","project":"/absolute/project","transactionId":"<pending id>","reason":"<actual reason>"}`
to this discovery controller. Recovery needs no initialization or change ID. Follow
the lock/backup cautions in the [recovery protocol](../../requirements-workflow/references/controller.md).
Do not remove a live lock or edit planning concurrently.
Backups may contain private documents. These are local integrity checks, not identity
authentication, semantic proof, or a guarantee of power-loss durability.
