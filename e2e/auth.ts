import process from "node:process";
import type { BrowserContext } from "@playwright/test";

const API = "https://api.nuvio.tv";
const PUBLISHABLE_KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";

const EMAIL = process.env.NUVIO_TEST_EMAIL;
const PASSWORD = process.env.NUVIO_TEST_PASSWORD;

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	user: unknown;
}

// One password grant per test run, shared by every test : the real auth endpoint
// rate-limits (429) and a full suite is dozens of `signIn` calls otherwise.
let tokenPromise: Promise<TokenResponse> | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<TokenResponse> {
	if (tokenPromise && Date.now() < tokenExpiresAt - 60_000) {
		return tokenPromise;
	}
	tokenPromise = (async () => {
		const response = await fetch(`${API}/auth/v1/token?grant_type=password`, {
			method: "POST",
			headers: { apikey: PUBLISHABLE_KEY, "content-type": "application/json" },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
		});
		if (!response.ok) {
			throw new Error(`Test account sign-in failed: ${response.status}`);
		}
		return (await response.json()) as TokenResponse;
	})();
	const data = await tokenPromise;
	tokenExpiresAt = Date.now() + data.expires_in * 1000;
	return data;
}

/** Signs the test account in against the real API and drops the session cookies onto the context. */
export async function signIn(
	context: BrowserContext,
	profileId = 1,
	{ seedDisclaimerAck = true }: { seedDisclaimerAck?: boolean } = {},
): Promise<void> {
	if (!(EMAIL && PASSWORD)) {
		throw new Error(
			"Set NUVIO_TEST_EMAIL and NUVIO_TEST_PASSWORD (see .env.example)",
		);
	}

	const data = await getToken();

	const session = encodeURIComponent(
		JSON.stringify({
			access_token: data.access_token,
			refresh_token: data.refresh_token,
			expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
			user: data.user,
		}),
	);

	await context.addCookies([
		{
			name: "nuvio_session",
			value: session,
			domain: "localhost",
			path: "/",
			httpOnly: true,
		},
		{
			name: "nuvio_profile",
			value: String(profileId),
			domain: "localhost",
			path: "/",
			httpOnly: true,
		},
	]);

	// Suppress the first-run disclaimer modal so it doesn't block interaction in
	// every spec. `first-run-notice.spec.ts` opts out to cover the modal itself.
	if (seedDisclaimerAck) {
		await context.addInitScript(() => {
			try {
				localStorage.setItem("nuvio:disclaimer-ack:v1", "1");
			} catch {
				// storage unavailable in this context
			}
		});
	}
}
