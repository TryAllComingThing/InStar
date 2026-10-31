# Error handling

- Handle errors at a boundary that can recover or add useful context.
- Preserve the original cause when translating an error.
- Do not swallow errors in empty catch blocks; explain intentional fallback behavior.
- Do not expose credentials, secrets, or sensitive user data in logs or user-facing messages.
- Make user-facing errors actionable without leaking implementation details.
