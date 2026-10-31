# Go

Apply this guide to Go code and use the repository's Go version and standard tooling.

- Run `gofmt` and follow idiomatic package and identifier naming.
- Keep interfaces small and generally define them at the consuming boundary when that improves substitutability.
- Handle errors explicitly. Add context when returning an error across a boundary; do not discard errors without a documented reason.
- Pass `context.Context` as the first parameter for cancellation-aware operations; do not store request contexts in long-lived structs.
- Make goroutine lifetime, cancellation, synchronization, and ownership explicit. Avoid goroutine leaks and unsynchronized shared state.
- Keep constructors and abstractions proportionate to actual use; prefer simple concrete types until substitution is needed.
- Test behavior with focused table-driven tests where they improve clarity; avoid brittle assertions on implementation details.

References: [Go specification](https://go.dev/ref/spec), [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments), [Effective Go](https://go.dev/doc/effective_go).
