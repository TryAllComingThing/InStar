# Vue 3 review guidance

Use this as a review checklist, not a mechanical style mandate. Follow the project's Vue version, compiler configuration, and existing patterns.

- Keep reactive state ownership clear; avoid copying derived state when a computed value is sufficient.
- Ensure asynchronous watchers and effects cancel or ignore stale work when their owner stops.
- Use stable keys for lists whose items can be inserted, removed, or reordered.
- Keep computed getters free of externally visible side effects.
- Clean up timers, subscriptions, and manually registered event listeners when their owner is disposed.
- Type component props and define defaults only for optional values that need them.
- Consider async components and lazy route imports when they improve loading behavior; do not split small or critical first-render components without a reason.
- Confirm that destructuring props preserves reactivity for the project's Vue/compiler version.
