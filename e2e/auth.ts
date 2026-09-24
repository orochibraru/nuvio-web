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

/** Calls a Nuvio RPC as the test account, for specs that seed their own data. */
export async function nuvioRpc<Result>(
	name: string,
	params: Record<string, unknown> = {},
): Promise<Result> {
	const { access_token } = await getToken();
	const response = await fetch(`${API}/rest/v1/rpc/${name}`, {
		method: "POST",
		headers: {
			apikey: PUBLISHABLE_KEY,
			authorization: `Bearer ${access_token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(params),
	});
	if (!response.ok) {
		throw new Error(
			`${name} failed: ${response.status} ${await response.text()}`,
		);
	}
	const text = await response.text();
	return (text ? JSON.parse(text) : undefined) as Result;
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

	// The server keeps the tokens and hands back a cookie holding only the
	// session id; going through the context's own request API is what lands
	// that cookie in the browser. The route exists only under `NUVIO_E2E`, so a
	// server you started yourself on :3000 without it 404s here : stop it
	// before a run.
	const response = await context.request.post("/dev/e2e-session", {
		data: {
			access_token: data.access_token,
			refresh_token: data.refresh_token,
			// The grant is memoised: send what is left of it, not its original life.
			expires_in: Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000)),
			user: data.user,
		},
	});
	if (!response.ok()) {
		throw new Error(`Could not start an e2e session: ${response.status()}`);
	}

	await context.addCookies([
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
