import type { BrowserContext } from "@playwright/test";

const API = "https://api.nuvio.tv";
const PUBLISHABLE_KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";

const EMAIL = process.env.NUVIO_TEST_EMAIL;
const PASSWORD = process.env.NUVIO_TEST_PASSWORD;

/** Signs the test account in against the real API and drops the session cookies onto the context. */
export async function signIn(
	context: BrowserContext,
	profileId = 1,
): Promise<void> {
	if (!EMAIL || !PASSWORD) {
		throw new Error(
			"Set NUVIO_TEST_EMAIL and NUVIO_TEST_PASSWORD (see .env.example)",
		);
	}

	const response = await fetch(`${API}/auth/v1/token?grant_type=password`, {
		method: "POST",
		headers: { apikey: PUBLISHABLE_KEY, "content-type": "application/json" },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
	});
	if (!response.ok) {
		throw new Error(`Test account sign-in failed: ${response.status}`);
	}
	const data = (await response.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		user: unknown;
	};

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
}
