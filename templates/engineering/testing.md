# Testing

Discover actual commands from the target project. For behavior changes, use focused failing tests before implementation where supported, then run relevant tests and configured static/build checks. Do not claim tooling tests validate the application.
Verify critical user journeys in a browser, including applicable error, responsive, keyboard and focus behavior. For UI work, run an automated accessibility check such as Playwright + axe-core and a keyboard/focus journey; keep separate machine-readable JSON artifacts. A smoke test that only checks page load, a screenshot, or `{status:"passed"}` is not a browser, accessibility or keyboard pass. Record commands, results and evidence paths. Missing environments or unavailable checks are not passing results.

Use headless Playwright for mandatory functional regression and axe for mandatory accessibility. Headed Chrome is optional human visual/interaction evidence; a smoke script is optional fast feedback. Do not require all three as separate mandatory gates.
Submit test and browser evidence through the applicable stack verification Skill (`engineering-verify` for backend or cross-stack work; `frontend-verify` for legacy npm/Vite frontend work) before human acceptance. Keep tests proportional to the changed behavior.
