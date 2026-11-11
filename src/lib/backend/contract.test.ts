import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
	testBackend as probeBackend,
	setEmailConfirmationRequired,
} from "#lib/admin/backends-data.js";
import { isAuthSession } from "#lib/nuvio/backend.js";
import type { NuvioClient } from "#lib/nuvio/client.js";
import type { AuthSession } from "#lib/nuvio/types.js";
import { DatabaseService } from "#lib/services/database.service.js";
import { BASE_URL, testBackend } from "./test-backend.ts";

// This app's own `NuvioClient`, pointed at the built-in backend in-process:
// every method the app calls, checked against the shapes the snapshot documents.

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const fightClub = {
	content_id: "tmdb:550",
	content_type: "movie" as const,
	name: "Fight Club",
	poster: "https://image.example/fc.jpg",
	poster_shape: "POSTER" as const,
	background: "https://image.example/fc-bg.jpg",
	description: "An insomniac office worker...",
	release_info: "1999",
	imdb_rating: 8.8,
	genres: ["Drama", "Thriller"],
	addon_base_url: "https://catalog.example.com",
	added_at: 1_711_600_000_000,
};

let setup: ReturnType<typeof testBackend>;
let client: NuvioClient;

async function signedIn(email = "user@example.com"): Promise<NuvioClient> {
	const fresh = setup.client();
	await fresh.signUp({ email, password: "correct horse" });
	return fresh;
}

beforeEach(async () => {
	setup = testBackend();
	client = await signedIn();
});

describe("auth", () => {
	it("signs up with the Supabase session shape the app stores", () => {
		const session = client.session;
		expect(isAuthSession(session)).toBe(true);
		expect(session).toMatchObject({
			token_type: "bearer",
			expires_in: 3600,
			user: {
				id: expect.stringMatching(UUID),
				email: "user@example.com",
				aud: "authenticated",
				created_at: expect.stringMatching(ISO),
			},
		});
		expect(session?.access_token.split(".")).toHaveLength(3);
	});

	it("signs in with a password, case-insensitive email", async () => {
		const other = setup.client();
		const session = await other.signInWithPassword({
			email: "  USER@example.com ",
			password: "correct horse",
		});
		expect(session.user.id).toBe(client.session?.user.id);
		await expect(
			setup.client().signInWithPassword({
				email: "user@example.com",
				password: "wrong horse",
			}),
		).rejects.toMatchObject({ status: 400 });
	});

	it("rotates the refresh token and revokes the family on reuse", async () => {
		const first = client.session?.refresh_token as string;
		const rotated = await client.refreshSession();
		expect(rotated.refresh_token).not.toBe(first);
		expect(await client.getUser()).toMatchObject({ email: "user@example.com" });

		setup.clock.at += 11_000;
		await expect(setup.client().refreshSession(first)).rejects.toMatchObject({
			status: 400,
		});
		await expect(
			setup.client().refreshSession(rotated.refresh_token),
		).rejects.toMatchObject({ status: 400 });
		await expect(client.getUser()).rejects.toMatchObject({ status: 403 });
	});

	it("answers a refresh retried within 10 s with the same new token", async () => {
		const first = client.session?.refresh_token as string;
		const rotated = await client.refreshSession();
		setup.clock.at += 9000;
		const retried = await setup.client().refreshSession(first);
		expect(retried.refresh_token).toBe(rotated.refresh_token);
		expect(retried.access_token).not.toBe(first);
		const next = await setup.client().refreshSession(rotated.refresh_token);
		expect(next.refresh_token).not.toBe(rotated.refresh_token);
	});

	it("signs out this session only", async () => {
		const elsewhere = setup.client();
		await elsewhere.signInWithPassword({
			email: "user@example.com",
			password: "correct horse",
		});
		const token = client.session?.access_token as string;
		await client.signOut();
		expect(client.session).toBeNull();
		const stale = setup.client();
		stale.setSession({
			...(elsewhere.session as AuthSession),
			access_token: token,
		});
		await expect(stale.getUser()).rejects.toMatchObject({ status: 403 });
		expect(await elsewhere.getUser()).toMatchObject({
			email: "user@example.com",
		});
	});

	it("answers the auth settings probe the admin tab's Test button uses", async () => {
		expect(
			await probeBackend(
				{ url: BASE_URL, publishableKey: setup.backend.publishableKey() },
				setup.backend.fetch,
			),
		).toBe(true);
	});
});

describe("password reset", () => {
	beforeEach(() => {
		setup.makeDefault();
	});

	it("emails a single-use link whose session sets a new password", async () => {
		await setup.client().requestPasswordRecovery("USER@example.com");
		const token = setup.linkToken("user@example.com") as string;
		expect(setup.mail.sent[0]?.text).toContain(
			`https://nuvio.example/auth/reset-password?token=${token}`,
		);

		const recovering = setup.client();
		const session = await recovering.verifyEmailLink("recovery", token);
		expect(isAuthSession(session)).toBe(true);
		expect(await recovering.updatePassword("a brand new one")).toMatchObject({
			email: "user@example.com",
		});

		await expect(
			setup.client().verifyEmailLink("recovery", token),
		).rejects.toMatchObject({ status: 403, code: "otp_expired" });
		await expect(
			setup.client().signInWithPassword({
				email: "user@example.com",
				password: "correct horse",
			}),
		).rejects.toMatchObject({ status: 400 });
		await setup.client().signInWithPassword({
			email: "user@example.com",
			password: "a brand new one",
		});
		// Every other session ends with the old password.
		await expect(client.getUser()).rejects.toMatchObject({ status: 403 });
		expect(await recovering.getUser()).toMatchObject({
			email: "user@example.com",
		});
	});

	it("refuses the same password and a short one", async () => {
		await expect(client.updatePassword("correct horse")).rejects.toMatchObject({
			status: 422,
			code: "same_password",
		});
		await expect(client.updatePassword("short")).rejects.toMatchObject({
			status: 422,
			code: "weak_password",
		});
	});
});

describe("email confirmation", () => {
	beforeEach(() => {
		setup.makeDefault();
		setEmailConfirmationRequired(setup.db, true);
	});

	it("is reported by the auth settings", async () => {
		const settings = await setup.request("auth/v1/settings", {
			headers: { apikey: setup.backend.publishableKey() },
		});
		expect(await settings.json()).toMatchObject({ mailer_autoconfirm: false });
		setEmailConfirmationRequired(setup.db, false);
		const off = await setup.request("auth/v1/settings", {
			headers: { apikey: setup.backend.publishableKey() },
		});
		expect(await off.json()).toMatchObject({ mailer_autoconfirm: true });
	});

	it("signs up without a session, refuses sign-in until the link is followed", async () => {
		const pending: unknown = await setup
			.client()
			.signUp({ email: "new@example.com", password: "correct horse" });
		expect(pending).not.toHaveProperty("access_token");
		expect(pending).toMatchObject({
			email: "new@example.com",
			email_confirmed_at: null,
		});
		const credentials = { email: "new@example.com", password: "correct horse" };
		await expect(
			setup.client().signInWithPassword(credentials),
		).rejects.toMatchObject({ status: 400, code: "email_not_confirmed" });

		const token = setup.linkToken("new@example.com") as string;
		expect(setup.mail.sent[0]?.text).toContain(
			`https://nuvio.example/auth/confirm-email?token=${token}`,
		);
		const session = await setup.client().verifyEmailLink("signup", token);
		expect(session.user).toMatchObject({
			email: "new@example.com",
			email_confirmed_at: expect.stringMatching(ISO),
		});
		await setup.client().signInWithPassword(credentials);
	});

	it("keeps accounts that existed before it was turned on confirmed", async () => {
		await setup.client().signInWithPassword({
			email: "user@example.com",
			password: "correct horse",
		});
	});

	it("counts the accounts of a database from before it as confirmed", async () => {
		const db = DatabaseService.migrate(new Database(":memory:"));
		db.run(`CREATE TABLE backend_users (
			id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_sign_in_at INTEGER
		)`);
		db.run(`CREATE TABLE backend_refresh_tokens (
			token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL,
			revoked INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
		)`);
		db.query(
			"INSERT INTO backend_users VALUES ('00000000-0000-4000-8000-000000000001', 'old@example.com', ?, 1, 1, NULL)",
		).run(await globalThis.Bun.password.hash("correct horse"));
		const upgraded = testBackend(db);
		upgraded.makeDefault();
		setEmailConfirmationRequired(db, true);
		const old = upgraded.client();
		await old.signInWithPassword({
			email: "old@example.com",
			password: "correct horse",
		});
		expect((await old.refreshSession()).refresh_token).toBeTruthy();
	});

	it("is confirmed by a password reset too", async () => {
		await setup
			.client()
			.signUp({ email: "lost@example.com", password: "correct horse" });
		await setup.client().requestPasswordRecovery("lost@example.com");
		const session = await setup
			.client()
			.verifyEmailLink(
				"recovery",
				setup.linkToken("lost@example.com") as string,
			);
		expect(session.user.email).toBe("lost@example.com");
		await setup.client().signInWithPassword({
			email: "lost@example.com",
			password: "correct horse",
		});
	});
});

describe("account deletion", () => {
	it("deletes the caller's account and everything it stored, behind its password", async () => {
		const other = await signedIn("other@example.com");
		for (const owner of [client, other]) {
			await owner.profiles.replace({
				p_profiles: [{ profile_index: 1, name: "Main" }],
			});
			await owner.library.upsertItems({
				p_profile_id: 1,
				p_items: [fightClub],
			});
			await owner.addons.replace({
				p_profile_id: 1,
				p_addons: [{ url: "https://a.example/manifest.json" }],
			});
			await owner.settings.replace({
				p_profile_id: 1,
				p_settings_json: { theme: "dark" },
			});
		}
		const userId = client.session?.user.id as string;

		await expect(client.deleteAccount("wrong horse")).rejects.toMatchObject({
			status: 400,
			code: "invalid_credentials",
		});
		await client.deleteAccount("correct horse");

		const tables = setup.db
			.query<{ name: string }, []>(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'backend_%'",
			)
			.all()
			.map((table) => table.name)
			.filter((table) => table !== "backend_refresh_tokens");
		for (const table of tables) {
			const column = table === "backend_users" ? "id" : "user_id";
			expect(
				setup.db
					.query<{ total: number }, [string]>(
						`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} = ?`,
					)
					.get(userId)?.total,
				table,
			).toBe(0);
		}
		expect(
			setup.db
				.query<{ total: number }, []>(
					"SELECT COUNT(*) AS total FROM backend_refresh_tokens",
				)
				.get()?.total,
		).toBe(1);
		await expect(
			setup.client().signInWithPassword({
				email: "user@example.com",
				password: "correct horse",
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(await other.library.pull({ p_profile_id: 1 })).toHaveLength(1);
		expect(await other.addons.list(1)).toHaveLength(1);
	});
});

describe("profiles", () => {
	it("replaces within the declared range and keeps avatar ids when omitted", async () => {
		await client.profiles.replace({
			p_client_max_profiles: 6,
			p_profiles: [
				{
					profile_index: 1,
					name: "Main",
					avatar_color_hex: "#1E88E5",
					avatar_id: "builtin_sun",
				},
				{ profile_index: 2, name: "Kids", uses_primary_addons: true },
			],
		});
		const profiles = await client.profiles.list();
		expect(profiles).toEqual([
			{
				id: expect.stringMatching(UUID),
				user_id: client.session?.user.id,
				profile_index: 1,
				name: "Main",
				avatar_color_hex: "#1E88E5",
				uses_primary_addons: false,
				avatar_id: "builtin_sun",
				avatar_url: null,
				pin_enabled: false,
				pin_locked_until: null,
				created_at: expect.stringMatching(ISO),
				updated_at: expect.stringMatching(ISO),
			},
			expect.objectContaining({
				profile_index: 2,
				uses_primary_addons: true,
			}),
		]);

		await client.profiles.replace({
			p_client_max_profiles: 6,
			p_profiles: [{ profile_index: 1, name: "Renamed" }],
		});
		const [main, ...rest] = await client.profiles.list();
		expect(rest).toEqual([]);
		expect(main).toMatchObject({
			id: profiles[0]?.id,
			name: "Renamed",
			avatar_id: "builtin_sun",
		});

		await client.profiles.replace({
			p_profiles: [
				{
					profile_index: 1,
					name: "Renamed",
					avatar_url: "https://a.example/me.png",
				},
			],
		});
		expect((await client.profiles.list())[0]).toMatchObject({
			avatar_id: null,
			avatar_url: "https://a.example/me.png",
		});
	});

	it("keeps slots past p_client_max_profiles (default 4)", async () => {
		await client.profiles.replace({
			p_client_max_profiles: 6,
			p_profiles: [
				{ profile_index: 1, name: "One" },
				{ profile_index: 5, name: "Five" },
			],
		});
		await client.profiles.replace({
			p_profiles: [{ profile_index: 1, name: "One" }],
		});
		expect((await client.profiles.list()).map((p) => p.profile_index)).toEqual([
			1, 5,
		]);
	});

	it("deletes a profile's data and the row, with delete events for its items", async () => {
		await client.profiles.replace({
			p_profiles: [
				{ profile_index: 1, name: "One" },
				{ profile_index: 2, name: "Two" },
			],
		});
		await client.library.upsertItems({ p_profile_id: 2, p_items: [fightClub] });
		await client.addons.replace({
			p_profile_id: 2,
			p_addons: [{ url: "https://a.example/manifest.json" }],
		});
		await client.settings.replace({
			p_profile_id: 2,
			p_settings_json: { theme: "dark" },
		});
		const cursor = await client.library.deltaCursor(2);

		await client.profiles.deleteData(2);

		expect((await client.profiles.list()).map((p) => p.profile_index)).toEqual([
			1,
		]);
		expect(await client.library.pull({ p_profile_id: 2 })).toEqual([]);
		expect(await client.addons.list(2)).toEqual([]);
		expect(await client.settings.pull({ p_profile_id: 2 })).toEqual([]);
		expect(
			await client.library.pullDelta({
				p_profile_id: 2,
				p_since_event_id: cursor,
			}),
		).toEqual([
			expect.objectContaining({ operation: "delete", content_id: "tmdb:550" }),
		]);
	});
});

describe("addons", () => {
	it("lists through the PostgREST query the client sends, ordered", async () => {
		await client.addons.replace({
			p_profile_id: 1,
			p_addons: [
				{ url: "https://b.example/manifest.json", name: "B", sort_order: 1 },
				{
					url: "https://a.example/manifest.json",
					name: "A",
					sort_order: 0,
					enabled: false,
				},
			],
		});
		const addons = await client.addons.list(1);
		expect(addons).toEqual([
			{
				id: expect.stringMatching(UUID),
				user_id: client.session?.user.id,
				profile_id: 1,
				url: "https://a.example/manifest.json",
				name: "A",
				enabled: false,
				sort_order: 0,
				created_at: expect.stringMatching(ISO),
				updated_at: expect.stringMatching(ISO),
			},
			expect.objectContaining({ name: "B", enabled: true, sort_order: 1 }),
		]);
		expect(await client.addons.list(2)).toEqual([]);
	});

	it("fully replaces, and leaves an unchanged row alone", async () => {
		const push = (addons: { url: string; name?: string }[]) =>
			client.addons.replace({ p_profile_id: 1, p_addons: addons });
		await push([
			{ url: "https://a.example/m.json", name: "A" },
			{ url: "https://b.example/m.json" },
		]);
		const [before] = await client.addons.list(1);
		setup.clock.at += 60_000;
		await push([{ url: "https://a.example/m.json", name: "A" }]);
		const after = await client.addons.list(1);
		expect(after).toHaveLength(1);
		expect(after[0]?.updated_at).toBe(before?.updated_at);
		expect(after[0]?.id).toBe(before?.id);
	});
});

describe("library", () => {
	it("bootstraps with cursor, snapshot and delta", async () => {
		expect(await client.library.deltaCursor(1)).toBe(0);
		await client.library.upsertItems({
			p_profile_id: 1,
			p_origin_client_id: "test-install",
			p_items: [
				fightClub,
				{
					content_id: "tmdb:1396",
					content_type: "series",
					name: "Breaking Bad",
					added_at: 1,
				},
			],
		});
		const snapshot = await client.library.pull({
			p_profile_id: 1,
			p_limit: 500,
			p_offset: 0,
		});
		expect(snapshot.map((item) => item.content_id)).toEqual([
			"tmdb:550",
			"tmdb:1396",
		]);
		expect(snapshot[0]).toEqual({
			id: expect.stringMatching(UUID),
			user_id: client.session?.user.id,
			profile_id: 1,
			...fightClub,
			created_at: expect.stringMatching(ISO),
			updated_at: expect.stringMatching(ISO),
		});
		expect(snapshot[1]).toMatchObject({
			poster: null,
			poster_shape: "POSTER",
			genres: [],
		});
		expect(
			await client.library.pull({ p_profile_id: 1, p_limit: 1, p_offset: 1 }),
		).toEqual([expect.objectContaining({ content_id: "tmdb:1396" })]);

		const cursor = await client.library.deltaCursor(1);
		await client.library.deleteItems({
			p_profile_id: 1,
			p_keys: [{ content_id: "tmdb:1396", content_type: "series" }],
		});
		const delta = await client.library.pullDelta({
			p_profile_id: 1,
			p_since_event_id: cursor,
			p_limit: 500,
		});
		expect(delta).toEqual([
			{
				event_id: cursor + 1,
				operation: "delete",
				...{
					content_id: "tmdb:1396",
					content_type: "series",
					name: "Breaking Bad",
				},
				poster: null,
				poster_shape: "POSTER",
				background: null,
				description: null,
				release_info: null,
				imdb_rating: null,
				genres: [],
				addon_base_url: null,
				added_at: 1,
			},
		]);
		expect(await client.library.deltaCursor(1)).toBe(cursor + 1);
	});

	it("orders delta events by a monotonic event_id and pages them", async () => {
		for (const name of ["a", "b", "c"]) {
			await client.library.upsertItems({
				p_profile_id: 1,
				p_items: [{ content_id: name, content_type: "movie", name }],
			});
		}
		await client.library.upsertItems({
			p_profile_id: 1,
			p_items: [{ content_id: "a", content_type: "movie", name: "a2" }],
		});
		const all = await client.library.pullDelta({ p_profile_id: 1 });
		const ids = all.map((event) => event.event_id);
		expect(ids).toEqual([...ids].sort((x, y) => x - y));
		expect(all.map((event) => event.name)).toEqual(["b", "c", "a2"]);
		const page = await client.library.pullDelta({
			p_profile_id: 1,
			p_limit: 2,
		});
		expect(page).toHaveLength(2);
		const next = await client.library.pullDelta({
			p_profile_id: 1,
			p_since_event_id: page[1]?.event_id,
		});
		expect(next.map((event) => event.name)).toEqual(["a2"]);
	});

	it("keeps added_at on an upsert that omits it", async () => {
		await client.library.upsertItems({ p_profile_id: 1, p_items: [fightClub] });
		const { added_at: _added, ...withoutDate } = fightClub;
		await client.library.upsertItems({
			p_profile_id: 1,
			p_items: [{ ...withoutDate, name: "Fight Club (1999)" }],
		});
		expect((await client.library.pull({ p_profile_id: 1 }))[0]).toMatchObject({
			name: "Fight Club (1999)",
			added_at: fightClub.added_at,
		});
	});

	it("legacy push deletes whatever it omits", async () => {
		await client.library.upsertItems({
			p_profile_id: 1,
			p_items: [fightClub, { content_id: "x", content_type: "movie" }],
		});
		await client.library.replaceLegacy({
			p_profile_id: 1,
			p_items: [fightClub],
		});
		expect(
			(await client.library.pull({ p_profile_id: 1 })).map(
				(item) => item.content_id,
			),
		).toEqual(["tmdb:550"]);
		const events = await client.library.pullDelta({ p_profile_id: 1 });
		expect(events.at(-1)).toMatchObject({
			operation: "delete",
			content_id: "x",
		});
	});
});

describe("watch progress", () => {
	const episode = {
		content_id: "tmdb:1396",
		content_type: "series" as const,
		video_id: "tmdb:1396:1:1",
		season: 1,
		episode: 1,
		position: 1_800_000,
		duration: 3_480_000,
		last_watched: 1_711_600_000_000,
	};
	const movie = {
		content_id: "tmdb:550",
		content_type: "movie" as const,
		video_id: "tmdb:550",
		position: 3_600_000,
		duration: 7_920_000,
		last_watched: 1_711_600_000_500,
	};

	it("computes the progress key, pulls newest first, and pulls since a time", async () => {
		await client.watchProgress.push({
			p_profile_id: 1,
			p_entries: [episode, movie],
		});
		const rows = await client.watchProgress.pull({ p_profile_id: 1 });
		expect(rows).toEqual([
			{
				id: expect.stringMatching(UUID),
				user_id: client.session?.user.id,
				profile_id: 1,
				...movie,
				season: null,
				episode: null,
				progress_key: "tmdb:550",
			},
			expect.objectContaining({ progress_key: "tmdb:1396_s1e1" }),
		]);
		expect(
			await client.watchProgress.pull({
				p_profile_id: 1,
				p_since_last_watched: episode.last_watched,
			}),
		).toEqual([expect.objectContaining({ progress_key: "tmdb:550" })]);
	});

	it("caps a pull without a since cursor at 200 rows", async () => {
		const entries = Array.from({ length: 250 }, (_, index) => ({
			...movie,
			content_id: `tmdb:${index}`,
			video_id: `tmdb:${index}`,
			last_watched: index,
		}));
		await client.watchProgress.push({ p_profile_id: 1, p_entries: entries });
		expect(
			await client.watchProgress.pull({ p_profile_id: 1, p_limit: 500 }),
		).toHaveLength(200);
		expect(
			await client.watchProgress.pull({
				p_profile_id: 1,
				p_since_last_watched: 0,
				p_limit: 500,
			}),
		).toHaveLength(249);
	});

	it("deletes one key or many, as delta delete events", async () => {
		await client.watchProgress.push({
			p_profile_id: 1,
			p_entries: [
				episode,
				movie,
				{ ...movie, content_id: "tmdb:1", video_id: "tmdb:1" },
			],
		});
		const cursor = await client.watchProgress.deltaCursor(1);
		await client.watchProgress.delete("tmdb:550", 1);
		await client.watchProgress.deleteMany(["tmdb:1396_s1e1", "tmdb:1"], 1);
		expect(await client.watchProgress.pull({ p_profile_id: 1 })).toEqual([]);
		const delta = await client.watchProgress.pullDelta({
			p_profile_id: 1,
			p_since_event_id: cursor,
		});
		expect(delta.map((event) => [event.operation, event.progress_key])).toEqual(
			[
				["delete", "tmdb:550"],
				["delete", "tmdb:1396_s1e1"],
				["delete", "tmdb:1"],
			],
		);
		expect(delta[0]).toMatchObject({
			position: movie.position,
			duration: movie.duration,
		});
	});

	it("marks a finished entry watched", async () => {
		await client.watchProgress.push({
			p_profile_id: 1,
			p_entries: [
				{ ...movie, position: 7_200_000 },
				{ ...episode, duration: 50_000, position: 50_000 },
			],
		});
		expect(await client.watchHistory.pull({ p_profile_id: 1 })).toEqual([
			expect.objectContaining({
				content_id: "tmdb:550",
				watched_at: movie.last_watched,
			}),
		]);
	});
});

describe("watch history", () => {
	it("pulls pages newest first, deltas and deletes by key", async () => {
		await client.watchHistory.push({
			p_profile_id: 1,
			p_items: [
				{
					content_id: "tmdb:550",
					content_type: "movie",
					title: "Fight Club",
					watched_at: 2,
				},
				{
					content_id: "tmdb:1396",
					content_type: "series",
					title: "S01E01",
					season: 1,
					episode: 1,
					watched_at: 1,
				},
			],
		});
		const rows = await client.watchHistory.pull({
			p_profile_id: 1,
			p_page: 1,
			p_page_size: 1,
		});
		expect(rows).toEqual([
			{
				id: expect.stringMatching(UUID),
				user_id: client.session?.user.id,
				profile_id: 1,
				content_id: "tmdb:550",
				content_type: "movie",
				title: "Fight Club",
				season: null,
				episode: null,
				watched_at: 2,
				created_at: expect.stringMatching(ISO),
			},
		]);
		expect(
			await client.watchHistory.pull({
				p_profile_id: 1,
				p_page: 2,
				p_page_size: 1,
			}),
		).toEqual([expect.objectContaining({ season: 1, episode: 1 })]);

		const cursor = await client.watchHistory.deltaCursor(1);
		await client.watchHistory.delete([{ content_id: "tmdb:1396" }], 1);
		expect(await client.watchHistory.pull({ p_profile_id: 1 })).toHaveLength(2);
		await client.watchHistory.delete(
			[{ content_id: "tmdb:1396", season: 1, episode: 1 }],
			1,
		);
		expect(
			await client.watchHistory.pullDelta({
				p_profile_id: 1,
				p_since_event_id: cursor,
			}),
		).toEqual([
			{
				event_id: cursor + 1,
				operation: "delete",
				content_id: "tmdb:1396",
				content_type: "series",
				title: "S01E01",
				season: 1,
				episode: 1,
				watched_at: 1,
			},
		]);
	});
});

describe("blobs", () => {
	it("settings are an atomic upsert per platform", async () => {
		expect(await client.settings.pull({ p_profile_id: 1 })).toEqual([]);
		await client.settings.replace({
			p_profile_id: 1,
			p_settings_json: { theme: "dark" },
		});
		await client.settings.replace({
			p_profile_id: 1,
			p_platform: "web",
			p_settings_json: { a: 1 },
		});
		await client.settings.replace({
			p_profile_id: 1,
			p_settings_json: { theme: "light" },
		});
		expect(
			await client.settings.pull({ p_profile_id: 1, p_platform: "tv" }),
		).toEqual([
			{
				profile_id: 1,
				settings_json: { theme: "light" },
				updated_at: expect.stringMatching(ISO),
			},
		]);
		expect(
			(await client.settings.pull({ p_profile_id: 1, p_platform: "web" }))[0]
				?.settings_json,
		).toEqual({ a: 1 });
	});

	it("home catalog settings carry their id and platform", async () => {
		await client.homeCatalog.replace({
			p_profile_id: 1,
			p_settings_json: { rows: [] },
		});
		expect(await client.homeCatalog.pull({ p_profile_id: 1 })).toEqual([
			{
				id: expect.stringMatching(UUID),
				user_id: client.session?.user.id,
				profile_id: 1,
				platform: "tv",
				settings_json: { rows: [] },
				updated_at: expect.stringMatching(ISO),
			},
		]);
	});

	it("collections replace, and [] clears", async () => {
		const collection = {
			id: "c1",
			title: "Weekend",
			viewMode: "ROWS" as const,
			folders: [],
		};
		await client.collections.replace({
			p_profile_id: 1,
			p_collections_json: [collection],
		});
		expect(await client.collections.pull(1)).toEqual([
			{
				profile_id: 1,
				collections_json: [collection],
				updated_at: expect.stringMatching(ISO),
			},
		]);
		await client.collections.replace({
			p_profile_id: 1,
			p_collections_json: [],
		});
		expect((await client.collections.pull(1))[0]?.collections_json).toEqual([]);
	});
});

describe("avatars, overview, health", () => {
	it("lists avatars without a session and serves each one", async () => {
		const avatars = await setup.client().listAvatars();
		expect(avatars.length).toBeGreaterThanOrEqual(8);
		expect(avatars[0]).toEqual({
			id: expect.any(String),
			display_name: expect.any(String),
			storage_path: expect.stringMatching(/\.svg$/),
			category: "shape",
			sort_order: 0,
			is_active: true,
			bg_color: expect.stringMatching(/^#[0-9A-F]{6}$/),
			created_at: expect.stringMatching(ISO),
		});
		for (const avatar of avatars) {
			const response = await setup.backend.fetch(
				client.avatarUrl(avatar.storage_path),
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("image/svg+xml");
			expect(await response.text()).toMatch(/^<svg /);
		}
		expect(
			(await setup.backend.fetch(client.avatarUrl("nope.svg"))).status,
		).toBe(404);
	});

	it("counts per profile in the sync overview", async () => {
		await client.profiles.replace({
			p_profiles: [
				{ profile_index: 1, name: "Main", avatar_color_hex: "#FF5722" },
			],
		});
		await client.library.upsertItems({ p_profile_id: 1, p_items: [fightClub] });
		await client.addons.replace({
			p_profile_id: 2,
			p_addons: [{ url: "https://a.example/m.json" }],
		});
		expect(await client.getSyncOverview()).toEqual({
			addons: { "2": 1 },
			library_items: { "1": 1 },
			watch_progress: {},
			watched_items: {},
			profiles: { "1": { name: "Main", color: "#FF5722" } },
		});
	});

	it("pings and health-checks", async () => {
		expect(await setup.client().healthPing()).toBe(true);
		expect(await setup.client().healthCheck()).toEqual({
			status: "healthy",
			database: "connected",
			latency_ms: expect.any(Number),
			timestamp: "2026-11-01T12:00:00.000Z",
		});
	});
});
