/** Chars of a UUID kept as the id shown on the error page. */
const ERROR_ID_LENGTH = 24;

/**
 * The handle a user has on one error: it is what the error page shows them and
 * what the log line carries, so the id they report has to match something.
 *
 * Shared by both hooks. `crypto.randomUUID()` is available in every browser
 * the app supports and in Bun, so neither side needs its own `Math.random`
 * alphabet soup.
 */
export function makeErrorId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, ERROR_ID_LENGTH);
}
