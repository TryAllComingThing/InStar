# Optional Feature-Sliced Design profile

Use this profile only when the project explicitly adopts Feature-Sliced Design and records that decision in its architecture documentation.

Typical permitted direction is `app → pages → widgets → features → entities → shared`: an upper layer may depend on lower layers, and imports between distinct slices in the same layer should use public APIs or be prohibited by project policy. Adjust the exact layers and exceptions to the repository.

Do not create empty layers or move existing files merely to match this example. If adopted, encode the chosen constraints in the project's dependency-cruiser configuration; otherwise use the repository's actual architecture.
