# Python

Apply this guide to Python code and follow the repository's supported Python version, formatter, linter, and package manager.

- Use clear names, small cohesive functions, and conventional Python formatting; do not reformat unrelated files.
- Add type annotations at public boundaries and for complex data flows. Treat annotations as static guidance, not runtime validation.
- Use context managers for resources that require cleanup, including files, locks, and transactions.
- Catch specific exceptions where recovery is possible; preserve exception context when translating errors and avoid broad silent catches.
- Prefer standard-library or project-approved dependencies over adding a new package for a small utility.
- Keep mutable defaults out of function signatures; avoid shared mutable state unless explicitly designed.
- Put input validation at trust boundaries and keep domain invariants close to the domain operation.
- Isolate tests and use the test framework already configured by the repository.

References: [Python Tutorial](https://docs.python.org/3/tutorial/), [PEP 8](https://peps.python.org/pep-0008/), [Python typing](https://docs.python.org/3/library/typing.html).
