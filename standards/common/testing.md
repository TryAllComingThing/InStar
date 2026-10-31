# Testing guidance

- Match test level to behavior: unit tests for isolated logic, integration tests for component boundaries and persistence, and end-to-end tests for critical user journeys.
- Test observable behavior and important invariants rather than private implementation details.
- Include success, invalid input, authorization, empty, failure, and relevant concurrency cases.
- Make tests deterministic and isolated; control clocks, randomness, network access, and external services explicitly.
- Keep fixtures representative and minimal. Avoid real credentials and production data.
- Use the project's existing test framework and coverage policy. Do not impose a universal coverage percentage without project agreement.
- For API and database changes, test contract compatibility, authorization, transaction behavior, and migrations using the repository's supported test environment.
