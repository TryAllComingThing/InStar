# Module boundaries

Discover and respect the repository's package and directory boundaries. A module should own a coherent responsibility and expose a small public surface. Avoid importing another module's private files or using a catch-all shared directory for unrelated code.

When two modules need to communicate, first inspect existing APIs and data flow. Propose a new shared abstraction only when more than one real consumer needs it and ownership is clear.
