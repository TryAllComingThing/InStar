---
name: initialize-project
description: Initialize a project for InStar, installing workflow guidance, conventions, planning directories and reviewer templates. Use when setting up or repairing the plugin integration.
---

Resolve the target project’s existing absolute directory from the user’s task. Read the [controller protocol](../requirements-workflow/references/controller.md). Invoke initialize with preview:true and inspect the result, then invoke initialize to apply the already-authorized setup. No extra confirmation is needed for requested initialization.

Preserve existing project files. The initializer adds a marked AGENTS.md block and creates missing rules/reviewer templates. It registers six roles under `.codex/config.toml`: architect, developer, ui-reviewer, code-reviewer, spec-reviewer, and frontend-reviewer. The first four also have adjacent Markdown role contracts; the latter two define their instructions in TOML. Merge missing registrations into valid TOML while preserving existing settings. Invalid TOML or same-name roles pointing elsewhere are reported without overwrite; report the final `agents.status`, registered and missing roles. Codex loads project-level configuration only for trusted projects, so remind the user to trust the project if registered agents do not appear. Explain conflicts and reconcile only within the user’s authorized scope. It does not select a frontend framework, install application dependencies, overwrite rules, or approve requirements.

Verify created files and re-run initialization to check idempotence. Report conflicts and the target project path. Continue requirements-workflow when requirements work was requested. Reviewer TOML templates are installed into the target project’s .codex/agents directory; the plugin templates folder is not itself an autoloaded agent registry.
