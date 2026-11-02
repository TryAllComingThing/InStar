# P1 registry and integration

Keep INDEX.md and the six domain documents as the normal reading interface. Add
`docs/project-baseline/rules.json` for controller consumption:

```json
{"schemaVersion":1,"rules":[{"id":"ARCH-001","statement":"Use the orders public entry","scope":["src/orders/**"],"status":"observed","document":"docs/project-baseline/architecture.md"}]}
```

Scopes support literal paths, `*` within a path segment and `**` across segments.
Use repository-relative forward-slash paths. Maximum 500 rules; each registry or
referenced document is bounded to 512 KiB. IDs must match the domain documents.
Registry status is the machine-readable authority for adoption; Markdown should
refer to it and be updated consistently, not claim a second independent approval.

Call workflow-controller JSON CLI with an absolute external project root:

```json
{"action":"baseline-context","project":"/absolute/project","paths":["src/orders/service.ts"]}
```

Omit paths to list all summaries. Responses include rules, document routing and a
fingerprint; document bodies/evidence are deliberately not loaded. Read only
documents relevant to the task. Before introducing files, query their planned paths.

After explicit user agreement, adopt selected observed/proposed entries:

```json
{"action":"baseline-adopt","project":"/absolute/project","fingerprint":"fresh-context-fingerprint","confirm":true,"by":"maintainer","reason":"Approved boundary","ids":["ARCH-001"]}
```

Metadata is a local record, not identity authentication. Conflicted/deprecated rules
cannot be adopted this way. Discovery never calls adoption implicitly. Edits to
canonical rules remain subject to project authorization.

When a registry exists, create/save-spec and write-design require `ruleReferences`:

```json
{"ruleReferences":[{"id":"ARCH-001","status":"PASS","evidence":"Design uses the public entry; see Architecture section"}]}
```

Supply `affectedPaths` when starting a workflow to select planning rules consistently
with the intended files; omission retains whole-project planning. Only relevant
rule documents enter its scoped fingerprint. All adopted rules in scope require a reference in planning; unrelated rules can use NA with
a reason. Include IDs in the authored Spec/design as well. Registry summaries enter
generation context, while bodies stay on demand. Baseline changes invalidate task
generation after design and implementation approval fingerprints.

Quality-gate Review uses the same ruleReferences field, filtered against changed
paths; missing adopted-rule evidence or BLOCK is rejected. The snapshot hashes
registry and referenced documents, including ignored files. This validates evidence
presence and freshness, not its semantic truth. Existing project verification
commands remain the executable checks; cite their real result in rule evidence.
No command is executed merely because it appears in an extracted document.

No registry preserves existing projects' behavior. This release supports adoption,
not a full approval UI or exception-expiration engine. Status/ID consistency between
Markdown and registry must be checked during generation and review.

Read-only workflow action `baseline-check` checks domain rule IDs, optional rule
`evidence` JSON paths (findings ID/status/source excerpts), and INDEX links. Missing
structured evidence or INDEX yields WARN; mismatched IDs/excerpts yield BLOCK.
It does not prove semantic compliance or update/adopt anything.
