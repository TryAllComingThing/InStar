# Rust

Apply this guide to Rust code and follow the repository's toolchain, edition, and crate conventions.

- Make ownership and borrowing explicit through the type system; do not reach for shared mutability or cloning without a clear need.
- Return `Result` for recoverable failures and propagate with `?`; reserve panics for violated internal invariants or unrecoverable conditions.
- Keep `unwrap` and `expect` out of fallible production paths unless the invariant and consequence are clear.
- Use precise error types at library boundaries and add context at application boundaries.
- Minimize `unsafe`; document the safety invariant next to each unsafe block and keep its scope small.
- Avoid holding synchronous locks across `.await`; make cancellation and task ownership clear in async code.
- Use `cargo fmt`, `cargo clippy`, and tests as configured by the project.

References: [The Rust Programming Language](https://doc.rust-lang.org/book/), [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/).
