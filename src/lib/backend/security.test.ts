import { beforeEach, describe, expect, it } from "vitest";
import {
	addToAllowlist,
	removeFromAllowlist,
	setLocked,
} from "#lib/admin/admin-data.js";
import { clientOptions } from "#lib/nuvio/backend.js";
import type { NuvioClient } from "#lib/nuvio/client.js";
import { deriveSigningKey, signAccessToken } from "./jwt.ts";
import { ADMIN_EMAIL, BASE_URL, SECRET, testBackend } from "./test-backend.ts";

let setup: ReturnType<typeof testBackend>;

beforeEach(() => {
	setup = testBackend();
});

async function signedIn(email: string): Promise<NuvioClient> {
	const client = setup.client();
	await client.signUp({ email, password: "correct horse" });
	return client;
}

function rest(
	path: string,
	{ token, body, key }: { token?: string; body?: unknown; key?: string } = {},
) {
	const headers: Record<string, string> = {
		apikey: key ?? setup.backend.publishableKey(),
		"content-type": "application/json",
	};
	if (token) {
		headers.authorization = `Bearer ${token}`;
	}
	return setup.request(path, {
		method: body === undefined ? "GET" : "POST",
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function base64url(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("apikey", () => {
	it("refuses a missing or wrong key with the gateway's 401", async () => {
		const missing = await setup.request("rest/v1/rpc/health_ping", {
			method: "POST",
		});
		expect(missing.status).toBe(401);
		expect(await missing.json()).toMatchObject({
			message: "No API key found in request",
		});
		const wrong = await rest("rest/v1/rpc/health_ping", {
			body: {},
			key: "sb_publishable_nope",
		});
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toMatchObject({ message: "Invalid API key" });
		const signup = await setup.request("auth/v1/signup", {
			method: "POST",
			headers: { apikey: "wrong" },
			body: JSON.stringify({
				email: "a@example.com",
				password: "correct horse",
			}),
		});
		expect(signup.status).toBe(401);
	});

	it("treats the key sent as a bearer as anonymous, like supabase-js does", async () => {
		const response = await rest("rest/v1/rpc/get_avatar_catalog", {
			body: {},
			token: setup.backend.publishableKey(),
		});
		expect(response.status).toBe(200);
		const denied = await rest("rest/v1/rpc/sync_pull_profiles", {
			body: {},
			token: setup.backend.publishableKey(),
		});
		expect(denied.status).toBe(401);
		expect(await denied.json()).toMatchObject({ code: "42501" });
	});
});

describe("access tokens", () => {
	let user: NuvioClient;
	let claims: { sub: string; email: string; session_id: string };

	beforeEach(async () => {
		user = await signedIn("user@example.com");
		const payload = user.session?.access_token.split(".")[1] as string;
		claims = JSON.parse(Buffer.from(payload, "base64url").toString());
	});

	async function profilesWith(token: string) {
		return await rest("rest/v1/rpc/sync_pull_profiles", { body: {}, token });
	}

	it("accepts its own token", async () => {
		expect(
			(await profilesWith(user.session?.access_token as string)).status,
		).toBe(200);
	});

	it("refuses an expired token", async () => {
		setup.clock.at += 3601 * 1000;
		const response = await profilesWith(user.session?.access_token as string);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: "PGRST303" });
	});

	it("refuses a token signed with another key", async () => {
		const forged = signAccessToken(
			deriveSigningKey("another secret"),
			claims,
			Math.floor(setup.clock.at / 1000),
		);
		expect((await profilesWith(forged)).status).toBe(401);
		const sameSecret = signAccessToken(
			deriveSigningKey(SECRET),
			claims,
			Math.floor(setup.clock.at / 1000),
		);
		expect((await profilesWith(sameSecret)).status).toBe(200);
	});

	it("refuses a tampered payload and alg=none", async () => {
		const token = user.session?.access_token ?? "";
		const [header, payload, signature] = token.split(".");
		const other = await signedIn("other@example.com");
		const otherSub = other.session?.user.id;
		const tampered = base64url({
			...JSON.parse(Buffer.from(payload as string, "base64url").toString()),
			sub: otherSub,
		});
		expect(
			(await profilesWith(`${header}.${tampered}.${signature}`)).status,
		).toBe(401);
		const none = base64url({ alg: "none", typ: "JWT" });
		expect((await profilesWith(`${none}.${payload}.`)).status).toBe(401);
		expect((await profilesWith(`${none}.${payload}.${signature}`)).status).toBe(
			401,
		);
		const hs512 = base64url({ alg: "HS512", typ: "JWT" });
		expect(
			(await profilesWith(`${hs512}.${payload}.${signature}`)).status,
		).toBe(401);
		expect((await profilesWith("not-a-jwt")).status).toBe(401);
	});

	it("refuses a token whose session was revoked", async () => {
		const token = user.session?.access_token as string;
		await user.signOut();
		expect((await profilesWith(token)).status).toBe(401);
	});
});

describe("isolation", () => {
	it("never shows one user another's data, same profile ids and all", async () => {
		const alice = await signedIn("alice@example.com");
		const bob = await signedIn("bob@example.com");
		for (const [client, name] of [
			[alice, "alice"],
			[bob, "bob"],
		] as const) {
			await client.profiles.replace({
				p_profiles: [{ profile_index: 1, name }],
			});
			await client.addons.replace({
				p_profile_id: 1,
				p_addons: [{ url: `https://${name}.example/m.json` }],
			});
			await client.library.upsertItems({
				p_profile_id: 1,
				p_items: [{ content_id: `${name}:1`, content_type: "movie" }],
			});
			await client.watchProgress.push({
				p_profile_id: 1,
				p_entries: [
					{
						content_id: `${name}:1`,
						content_type: "movie",
						video_id: `${name}:1`,
						position: 1,
						duration: 10,
						last_watched: 1,
					},
				],
			});
			await client.watchHistory.push({
				p_profile_id: 1,
				p_items: [
					{ content_id: `${name}:1`, content_type: "movie", watched_at: 1 },
				],
			});
			await client.settings.replace({
				p_profile_id: 1,
				p_settings_json: { owner: name },
			});
			await client.collections.replace({
				p_profile_id: 1,
				p_collections_json: [{ id: name, title: name, folders: [] }],
			});
		}
		await bob.library.deleteItems({
			p_profile_id: 1,
			p_keys: [{ content_id: "alice:1", content_type: "movie" }],
		});
		await bob.watchProgress.delete("alice:1", 1);
		await bob.watchHistory.delete([{ content_id: "alice:1" }], 1);

		const seen = JSON.stringify([
			await alice.profiles.list(),
			await alice.addons.list(1),
			await alice.library.pull({ p_profile_id: 1 }),
			await alice.library.pullDelta({ p_profile_id: 1 }),
			await alice.watchProgress.pull({ p_profile_id: 1 }),
			await alice.watchProgress.pullDelta({ p_profile_id: 1 }),
			await alice.watchHistory.pull({ p_profile_id: 1 }),
			await alice.watchHistory.pullDelta({ p_profile_id: 1 }),
			await alice.settings.pull({ p_profile_id: 1 }),
			await alice.collections.pull(1),
			await alice.getSyncOverview(),
		]);
		expect(seen).toContain("alice");
		expect(seen).not.toContain("bob");
		expect(await alice.library.pull({ p_profile_id: 1 })).toHaveLength(1);
		expect(await alice.watchProgress.pull({ p_profile_id: 1 })).toHaveLength(1);
		expect(await alice.watchHistory.pull({ p_profile_id: 1 })).toHaveLength(1);
	});
});

describe("injection", () => {
	const payloads = [
		"'; DROP TABLE backend_users; --",
		'" OR 1=1 --',
		"x' UNION SELECT password_hash FROM backend_users --",
		"%' OR '%'='",
	];

	it("stores every string parameter as data, never as SQL", async () => {
		const victim = await signedIn("victim@example.com");
		await victim.library.upsertItems({
			p_profile_id: 1,
			p_items: [{ content_id: "secret", content_type: "movie" }],
		});
		const attacker = await signedIn("attacker@example.com");
		for (const payload of payloads) {
			await attacker.profiles.replace({
				p_profiles: [
					{
						profile_index: 1,
						name: payload,
						avatar_id: payload,
						avatar_url: payload,
					},
				],
			});
			await attacker.addons.replace({
				p_profile_id: 1,
				p_addons: [{ url: payload, name: payload }],
			});
			await attacker.library.upsertItems({
				p_profile_id: 1,
				p_origin_client_id: payload,
				p_items: [
					{
						content_id: payload,
						content_type: payload as "movie",
						name: payload,
					},
				],
			});
			await attacker.library.deleteItems({
				p_profile_id: 1,
				p_keys: [{ content_id: payload, content_type: payload as "movie" }],
			});
			await attacker.watchProgress.push({
				p_profile_id: 1,
				p_entries: [
					{
						content_id: payload,
						content_type: payload as "movie",
						video_id: payload,
						position: 1,
						duration: 2,
						last_watched: 3,
					},
				],
			});
			await attacker.watchProgress.delete(payload, 1);
			await attacker.watchHistory.push({
				p_profile_id: 1,
				p_items: [
					{
						content_id: payload,
						content_type: payload as "movie",
						title: payload,
						watched_at: 1,
					},
				],
			});
			await attacker.watchHistory.delete([{ content_id: payload }], 1);
			await attacker.settings.replace({
				p_profile_id: 1,
				p_platform: payload,
				p_settings_json: { [payload]: payload },
			});
			expect(
				await attacker.settings.pull({ p_profile_id: 1, p_platform: payload }),
			).toEqual([
				expect.objectContaining({ settings_json: { [payload]: payload } }),
			]);
			await expect(
				setup
					.client()
					.signInWithPassword({ email: payload, password: payload }),
			).rejects.toMatchObject({ status: 400 });
			await expect(
				setup.client().refreshSession(payload),
			).rejects.toMatchObject({ status: 400 });
			expect(
				(await rest(`rest/v1/rpc/${encodeURIComponent(payload)}`, { body: {} }))
					.status,
			).toBe(404);
			expect(
				(
					await rest(
						`rest/v1/addons?profile_id=${encodeURIComponent(`eq.1${payload}`)}`,
						{ token: attacker.session?.access_token },
					)
				).status,
			).toBe(400);
		}
		expect((await attacker.profiles.list())[0]?.name).toBe(payloads.at(-1));
		expect(await victim.library.pull({ p_profile_id: 1 })).toEqual([
			expect.objectContaining({ content_id: "secret" }),
		]);
		expect(
			setup.db.query("SELECT COUNT(*) AS total FROM backend_users").get(),
		).toEqual({ total: 2 });
	});

	it("never resolves an inherited property as an RPC", async () => {
		const user = await signedIn("user@example.com");
		for (const name of [
			"__proto__",
			"constructor",
			"toString",
			"hasOwnProperty",
		]) {
			const response = await rest(`rest/v1/rpc/${name}`, {
				body: {},
				token: user.session?.access_token,
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({ code: "PGRST202" });
		}
	});
});

describe("request limits", () => {
	it("refuses a body over 1 MB and an oversized array", async () => {
		const user = await signedIn("user@example.com");
		const token = user.session?.access_token;
		const huge = await rest("rest/v1/rpc/sync_push_profile_settings_blob", {
			token,
			body: {
				p_profile_id: 1,
				p_settings_json: { blob: "x".repeat(1024 * 1024) },
			},
		});
		expect(huge.status).toBe(413);
		const many = await rest("rest/v1/rpc/sync_delete_watch_progress", {
			token,
			body: {
				p_profile_id: 1,
				p_keys: Array.from({ length: 2001 }, (_, index) => `k${index}`),
			},
		});
		expect(many.status).toBe(400);
		expect(await many.json()).toMatchObject({ code: "22023" });
	});

	it("validates parameters with PostgREST-style 400s", async () => {
		const user = await signedIn("user@example.com");
		const token = user.session?.access_token;
		for (const body of [
			{ p_profile_id: "1" },
			{ p_profile_id: 7 },
			{ p_profile_id: 1, p_items: [{ content_type: "movie" }] },
		]) {
			const response = await rest("rest/v1/rpc/sync_push_library_items", {
				token,
				body,
			});
			expect(response.status).toBe(400);
		}
		const notJson = await setup.request("rest/v1/rpc/sync_pull_profiles", {
			method: "POST",
			headers: {
				apikey: setup.backend.publishableKey(),
				authorization: `Bearer ${token}`,
			},
			body: "{",
		});
		expect(await notJson.json()).toMatchObject({ code: "PGRST102" });
		expect(
			(
				await rest("rest/v1/rpc/sync_delete_watch_progress", {
					token,
					body: { p_profile_id: 1 },
				})
			).status,
		).toBe(400);
		expect(
			(await rest("rest/v1/rpc/sync_pull_profiles", { token })).status,
		).toBe(405);
		expect((await rest("rest/v1/library", { token })).status).toBe(404);
	});

	it("serves only the addons query the client sends", async () => {
		const user = await signedIn("user@example.com");
		const token = user.session?.access_token;
		for (const query of [
			"select=*&profile_id=eq.1&order=sort_order",
			"select=*&profile_id=eq.1&order=sort_order.asc",
			"",
		]) {
			expect((await rest(`rest/v1/addons?${query}`, { token })).status).toBe(
				200,
			);
		}
		for (const query of [
			"select=url",
			"profile_id=gt.1",
			"profile_id=eq.1&profile_id=eq.2",
			"user_id=eq.x",
			"order=url",
		]) {
			const response = await rest(`rest/v1/addons?${query}`, { token });
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ code: "PGRST100" });
		}
		expect((await rest("rest/v1/addons?select=*")).status).toBe(401);
	});
});

describe("sign-up and sign-in policy", () => {
	function grant(
		email: string,
		password: string,
		address: string | null = null,
	) {
		return setup.request(
			"auth/v1/token?grant_type=password",
			{
				method: "POST",
				headers: {
					apikey: setup.backend.publishableKey(),
					"content-type": "application/json",
				},
				body: JSON.stringify({ email, password }),
			},
			address,
		);
	}

	it("rate-limits password grants per email and per address", async () => {
		await signedIn("user@example.com");
		for (let attempt = 0; attempt < 4; attempt++) {
			expect((await grant("user@example.com", "wrong horse")).status).toBe(400);
		}
		const limited = await grant("user@example.com", "correct horse");
		expect(limited.status).toBe(429);
		expect(await limited.json()).toMatchObject({
			error_code: "over_request_rate_limit",
		});

		for (let attempt = 0; attempt < 10; attempt++) {
			await grant(`spray${attempt}@example.com`, "whatever1", "198.51.100.1");
		}
		expect(
			(await grant("fresh@example.com", "whatever1", "198.51.100.1")).status,
		).toBe(429);
		expect(
			(await grant("fresh@example.com", "whatever1", "198.51.100.2")).status,
		).toBe(400);
		setup.clock.at += 16 * 60 * 1000;
		expect((await grant("user@example.com", "correct horse")).status).toBe(200);
	});

	it("validates sign-up input the way GoTrue does", async () => {
		const client = setup.client();
		await expect(
			client.signUp({ email: "not-an-email", password: "correct horse" }),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			client.signUp({ email: "a@example.com", password: "short" }),
		).rejects.toMatchObject({ status: 422 });
		await signedIn("taken@example.com");
		await expect(
			client.signUp({ email: "TAKEN@example.com", password: "correct horse" }),
		).rejects.toMatchObject({ status: 422 });
	});

	it("honours the instance lock and allowlist on sign-up, password grant and refresh", async () => {
		const existing = await signedIn("existing@example.com");
		setLocked(setup.db, true);
		await expect(signedIn("stranger@example.com")).rejects.toMatchObject({
			status: 403,
		});
		expect((await grant("existing@example.com", "wrong horse")).status).toBe(
			403,
		);
		await expect(existing.refreshSession()).rejects.toMatchObject({
			status: 403,
		});

		addToAllowlist(setup.db, "invited@example.com", ADMIN_EMAIL);
		const invited = await signedIn("invited@example.com");
		expect((await invited.refreshSession()).access_token).toBeTruthy();
		removeFromAllowlist(setup.db, "invited@example.com");
		await expect(invited.refreshSession()).rejects.toMatchObject({
			status: 403,
		});
	});

	it("reserves admin emails for the admin page", async () => {
		await expect(signedIn(ADMIN_EMAIL)).rejects.toMatchObject({ status: 403 });
		expect(
			await setup.backend.createAccount(ADMIN_EMAIL, "admin password"),
		).toBe(true);
		expect(
			await setup.backend.createAccount(ADMIN_EMAIL, "admin password"),
		).toBe(false);
		setLocked(setup.db, true);
		expect((await grant(ADMIN_EMAIL, "admin password")).status).toBe(200);
	});

	it("refuses an unknown grant and a malformed body", async () => {
		const headers = { apikey: setup.backend.publishableKey() };
		expect(
			(
				await setup.request("auth/v1/token?grant_type=id_token", {
					method: "POST",
					headers,
					body: "{}",
				})
			).status,
		).toBe(400);
		expect(
			(
				await setup.request("auth/v1/signup", {
					method: "POST",
					headers,
					body: "[]",
				})
			).status,
		).toBe(400);
		expect((await setup.request("auth/v1/user", { headers })).status).toBe(401);
	});
});

describe("in-process routing", () => {
	it("claims only the trusted default at its own mount with its own key", () => {
		const key = setup.backend.publishableKey();
		expect(
			setup.backend.owns({ url: BASE_URL, publishableKey: key, trusted: true }),
		).toBe(true);
		expect(
			setup.backend.owns({
				url: "https://elsewhere.example/api/nuvio",
				publishableKey: key,
				trusted: true,
			}),
		).toBe(true);
		expect(
			setup.backend.owns({
				url: BASE_URL,
				publishableKey: key,
				trusted: false,
			}),
		).toBe(false);
		expect(
			setup.backend.owns({
				url: BASE_URL,
				publishableKey: "sb_publishable_other",
				trusted: true,
			}),
		).toBe(false);
		expect(
			setup.backend.owns({
				url: "https://nuvio.example/api",
				publishableKey: key,
				trusted: true,
			}),
		).toBe(false);
	});

	it("hands clientOptions the in-process fetch for it, the guarded one otherwise", () => {
		const key = setup.backend.publishableKey();
		const own = clientOptions(
			{ url: BASE_URL, publishableKey: key, trusted: true },
			fetch,
			setup.backend,
		);
		expect(own.fetch).toBe(setup.backend.fetch);
		const custom = clientOptions(
			{ url: BASE_URL, publishableKey: key, trusted: false },
			fetch,
			setup.backend,
		);
		expect(custom.fetch).not.toBe(setup.backend.fetch);
	});

	it("answers a CORS preflight", async () => {
		const response = await setup.request("rest/v1/rpc/sync_pull_profiles", {
			method: "OPTIONS",
		});
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-headers")).toContain(
			"apikey",
		);
	});

	it("is a 404 outside the documented surface", async () => {
		expect((await setup.request("graphql/v1")).status).toBe(404);
		expect(
			(
				await setup.backend.handle(
					new Request("https://nuvio.example/elsewhere"),
					null,
				)
			).status,
		).toBe(404);
	});
});
