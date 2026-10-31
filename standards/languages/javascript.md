# JavaScript

Apply this guide to JavaScript code. Follow the repository's selected ECMAScript version, module format, runtime, and formatter.

- Prefer `const`; use `let` for reassignment and avoid `var` in new code.
- Use explicit module boundaries and match the repository's ESM or CommonJS convention.
- Validate values received from HTTP, storage, environment variables, and untyped libraries before relying on their shape.
- Handle rejected promises deliberately; do not leave floating promises or silently swallow failures.
- Use JSDoc for exported or complex APIs when it materially improves editor support, documentation, or static checking.
- Avoid implicit coercion and mutation of shared objects where they obscure behavior.
- Keep browser-only APIs behind an appropriate runtime boundary when code may also execute during SSR or in Node.js.

References: [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide), [ECMAScript specification](https://tc39.es/ecma262/).
