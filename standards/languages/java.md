# Java

Apply this guide to Java code. Follow the repository's JDK baseline, build system, framework, and established conventions.

- Use types and visibility to express API contracts and ownership clearly; keep implementation details private by default.
- Prefer immutable value objects where practical, and avoid exposing mutable internal collections.
- Use structured resource management (`try`-with-resources) for closeable resources.
- Handle exceptions at the layer that can recover or add meaningful context; do not catch and ignore failures.
- Use parameterized queries or the project's safe ORM/query APIs for database access.
- Keep dependency injection, annotations, and framework abstractions consistent with the existing application.
- Add tests at the appropriate unit, integration, and API boundary; do not mock the behavior under test.

References: [Java Language Specification](https://docs.oracle.com/javase/specs/), [Java SE documentation](https://docs.oracle.com/en/java/javase/).
