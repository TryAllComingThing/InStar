# TypeScript

Apply this guide to TypeScript code and extend [`../coding/typescript.md`](../coding/typescript.md) when present; otherwise use the project configuration as the source of truth.

- Preserve strict compiler checks already enabled. Avoid weakening compiler options to make a change pass.
- Give exported functions, shared data models, component props, and public boundaries explicit, useful types; let local expressions infer straightforward types.
- Treat network, storage, environment, and other untrusted values as `unknown` until validated and narrowed.
- Avoid `any`; if unavoidable at an interoperability boundary, contain it, document why, and prevent it from leaking into shared APIs.
- Model finite states with discriminated unions and exhaustive handling rather than loosely related booleans.
- Prefer readonly inputs and immutable updates when mutation would create shared-state or ownership ambiguity. Do not add needless cloning.
- Keep runtime validation at trust boundaries; compile-time types do not validate JSON or user input.
- Use the repository's formatter, lint rules, module system, and test conventions instead of adding competing tools.

References: [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html), [typescript-eslint](https://typescript-eslint.io/).
