/**
 * The session secret the e2e server runs with (`playwright.config.ts`
 * `webServer.env`): it signs the session-id cookie and keys the encryption of
 * the tokens stored in the scratch data dir. Fixed so a run is reproducible.
 * Test-only: a production instance generates its own.
 */
export const E2E_SESSION_SECRET = "e2e-only-session-secret-not-for-production";
