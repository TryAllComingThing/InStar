# Architecture review principles

- Discover the actual repository structure before proposing module boundaries.
- Describe dependencies in terms of modules that exist in this project.
- Prefer acyclic dependencies and stable public module APIs.
- Keep project constraints distinct from change-specific design decisions.
- Do not impose Feature-Sliced Design, layer names, package boundaries, or file paths unless project documentation adopts them.
- Treat the [`fsd-layers.md`](fsd-layers.md) document as an optional profile only.
