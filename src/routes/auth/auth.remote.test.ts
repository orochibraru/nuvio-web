import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	Redirect,
	Invalid,
	NuvioApiError,
	client,
	clientOptions,
	session,
	event,
	adminData,
	backendsData,
	notifier,
} = vi.hoisted(() => {
	class Redirect {
		constructor(
			public status: number,
			public location: string,
		) {}
	}
	class Invalid {
		constructor(public payload: unknown) {}
	}
	class NuvioApiError extends Error {
		constructor(public status: number) {
			super(`api ${status}`);
		}
	}
	return {
		Redirect,
		Invalid,
		NuvioApiError,
		client: {
			signInWithPassword: vi.fn(),
			signUp: vi.fn(),
			signOut: vi.fn(),
		},
		clientOptions: [] as Array<Record<string, unknown>>,
		backendsData: {
			policy: {
				customAllowed: false,
				defaultBackend: null as null | {
					url: string;
					publishableKey: string;
					trusted: boolean;
				},
			},
			banned: new Set<string>(),
			recordCustomSignIn: vi.fn(() => ({ id: "b1", firstSeen: true })),
		},
		notifier: { notify: vi.fn(async () => {}) },
		session: { write: vi.fn(), clear: vi.fn() },
		adminData: {
			canSignIn: vi.fn(() => true),
			isLocked: vi.fn(() => false),
			recordSignIn: vi.fn(),
		},
		event: {
			cookies: {},
			fetch: vi.fn(),
			getClientAddress: (): string => "203.0.113.7",
			url: new URL("https://nuvio.example.com/auth/sign-in"),
			locals: {} as Record<string, unknown>,
		},
	};
});

vi.mock("#lib/admin/admin-data.js", () => ({
	canSignIn: (...args: unknown[]) => adminData.canSignIn(...(args as [])),
	isLocked: () => adminData.isLocked(),
	recordSignIn: (...args: unknown[]) => adminData.recordSignIn(...(args as [])),
}));
vi.mock("#lib/admin/backends-data.js", () => ({
	policyOrDefault: () => backendsData.policy,
	isDefaultBackend: (
		backend: { url: string; trusted: boolean } | null,
		policy: typeof backendsData.policy,
	) =>
		policy.defaultBackend === null
			? backend === null
			: backend?.trusted === true && backend.url === policy.defaultBackend.url,
	isBannedBackend: (_db: unknown, url: string) => backendsData.banned.has(url),
	recordCustomSignIn: (...args: unknown[]) =>
		backendsData.recordCustomSignIn(...(args as [])),
}));

const discover = vi.hoisted(() =>
	vi.fn(async (): Promise<string | null> => null),
);
vi.mock("#lib/nuvio/backend.js", async (original) => ({
	...(await original<typeof import("#lib/nuvio/backend.js")>()),
	discoverPublishableKey: discover,
}));

vi.mock("@sveltejs/kit", () => ({
	redirect: (status: number, location: string) => {
		throw new Redirect(status, location);
	},
	invalid: (payload: unknown) => {
		throw new Invalid(payload);
	},
}));
vi.mock("$app/paths", () => ({ resolve: (p: string) => p }));
vi.mock("$app/server", () => ({
	form: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => event,
}));
vi.mock("$app/env", () => ({ dev: false }));
vi.mock("$app/env/private", () => ({
	NUVIO_ADMIN_EMAILS: "",
	NUVIO_DATA_DIR: "data",
}));
vi.mock("#lib/nuvio/index.js", () => ({
	NuvioApiError,
	NUVIO_BASE_URL: "https://api.nuvio.tv",
	NuvioClient: class {
		signInWithPassword = client.signInWithPassword;
		signUp = client.signUp;
		constructor(options: Record<string, unknown>) {
			clientOptions.push(options);
		}
	},
}));

import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import {
	ADMIN,
	ADMIN_NOTIFIER,
	AdminService,
	Container,
	DATABASE,
	LOGGER,
	Logger,
	RATE_LIMITER,
	SESSION,
} from "#lib/services/index.js";
import { RateLimiter } from "#lib/services/rate-limit.service.js";
import { NUVIO_SYNC } from "#lib/userdata/tokens.js";
import * as authForms from "./auth.remote.js";

// The handlers resolve their collaborators off the request scope, so the fakes
// go in through a real container rather than module mocks. `tryConnect()`
// returning null is the documented "no admin database" path.
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const nuvioSync = { touch: vi.fn() };
let limiter = new RateLimiter();
const rateLimiter = {
	attempt: (...args: Parameters<RateLimiter["attempt"]>) =>
		limiter.attempt(...args),
};
const testServices = new Container("test")
	.provide(SESSION, session as never)
	.provide(DATABASE, { tryConnect: () => null } as never)
	.provide(ADMIN, new AdminService(""))
	.provide(LOGGER, new Logger("error", { out: () => {}, err: () => {} }))
	.provide(NUVIO_SYNC, nuvioSync as never)
	.provide(RATE_LIMITER, rateLimiter as never)
	.provide(ADMIN_NOTIFIER, notifier)
	.provide(BUILT_IN_BACKEND, { owns: () => false } as never);

// The same scope with an admin database present : the lock check and the
// sign-in metrics only exist on this path.
const withDatabase = new Container("test-db")
	.provide(SESSION, session as never)
	.provide(DATABASE, { tryConnect: () => ({ marker: "db" }) } as never)
	.provide(ADMIN, new AdminService(""))
	.provide(LOGGER, logger as never)
	.provide(NUVIO_SYNC, nuvioSync as never)
	.provide(RATE_LIMITER, rateLimiter as never)
	.provide(ADMIN_NOTIFIER, notifier)
	.provide(BUILT_IN_BACKEND, { owns: () => false } as never);

// What `/auth/v1/token` actually returns : a token *and* the user. The thin
// `{ access_token }` stub only passed because `writeStoredSession` is mocked.
const apiSession = {
	access_token: "t",
	user: { id: "user-1", email: "user@example.com" },
};

// The `form(...)` results aren't callable in their public type; the test drives
// the underlying handler `(data, issue) => …` directly.
type FormHandler = (
	data: Record<string, unknown>,
	issue: Record<string, (msg: string) => unknown>,
) => Promise<unknown>;
// The schema's defaults never run here, so the handlers get them by hand.
const withDefaults =
	(handler: FormHandler): FormHandler =>
	(data, fieldIssue) =>
		handler({ backendUrl: "", backendKey: "", ...data }, fieldIssue);
const signIn = withDefaults(authForms.signIn as unknown as FormHandler);
const signUp = withDefaults(authForms.signUp as unknown as FormHandler);
const signOut = authForms.signOut as unknown as FormHandler;

const issue = new Proxy(
	{},
	{ get: (_t, field: string) => (msg: string) => ({ field, msg }) },
) as Record<string, (msg: string) => unknown>;

beforeEach(() => {
	for (const fn of [
		...Object.values(client),
		...Object.values(session),
		event.fetch,
	]) {
		fn.mockReset();
	}
	for (const fn of Object.values(logger)) {
		fn.mockReset();
	}
	adminData.canSignIn.mockReset().mockReturnValue(true);
	adminData.isLocked.mockReset().mockReturnValue(false);
	adminData.recordSignIn.mockReset();
	backendsData.policy = { customAllowed: false, defaultBackend: null };
	backendsData.banned.clear();
	backendsData.recordCustomSignIn
		.mockReset()
		.mockReturnValue({ id: "b1", firstSeen: true });
	notifier.notify.mockClear();
	nuvioSync.touch.mockClear();
	discover.mockReset().mockResolvedValue(null);
	clientOptions.length = 0;
	limiter = new RateLimiter();
	event.getClientAddress = () => "203.0.113.7";
	event.locals = {
		nuvio: { signOut: client.signOut },
		services: testServices,
	};
});

describe("signIn", () => {
	it("stores the session and redirects to a safe target", async () => {
		client.signInWithPassword.mockResolvedValue(apiSession);
		await expect(
			signIn(
				{ email: "a@b.com", password: "pw", redirectTo: "/library" },
				issue,
			),
		).rejects.toMatchObject({ status: 303, location: "/library" });
		expect(session.write).toHaveBeenCalled();
		// Kicks off a Nuvio pull so the mobile apps' changes show up at once.
		expect(nuvioSync.touch).toHaveBeenCalledWith(apiSession.user.id);
	});

	it("rewrites an off-site redirectTo to the app root", async () => {
		client.signInWithPassword.mockResolvedValue(apiSession);
		await expect(
			signIn(
				{ email: "a@b.com", password: "pw", redirectTo: "//evil.com" },
				issue,
			),
		).rejects.toMatchObject({ location: "/(protected)/(app)" });
	});

	it("maps a 401 to a field error", async () => {
		client.signInWithPassword.mockRejectedValue(new NuvioApiError(401));
		await expect(
			signIn({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toMatchObject({
			payload: { field: "password", msg: expect.stringContaining("Invalid") },
		});
	});

	it("maps a 500 to a generic error", async () => {
		client.signInWithPassword.mockRejectedValue(new NuvioApiError(500));
		await expect(
			signIn({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toMatchObject({ payload: expect.stringContaining("try again") });
	});

	it("rethrows a non-API error", async () => {
		client.signInWithPassword.mockRejectedValue(new Error("boom"));
		await expect(
			signIn({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toThrow("boom");
	});
});

describe("signUp", () => {
	it("signs the user straight in when the API returns a session", async () => {
		client.signUp.mockResolvedValue(apiSession);
		await expect(
			signUp(
				{ email: "a@b.com", password: "longenough", redirectTo: "/library" },
				issue,
			),
		).rejects.toMatchObject({ location: "/library" });
		expect(session.write).toHaveBeenCalled();
	});

	it("routes to sign-in with ?registered=1 when there's no session yet", async () => {
		client.signUp.mockResolvedValue({});
		await expect(
			signUp(
				{ email: "a@b.com", password: "longenough", redirectTo: "/" },
				issue,
			),
		).rejects.toMatchObject({ location: "auth/sign-in?registered=1" });
		expect(session.write).not.toHaveBeenCalled();
	});

	it("maps a 409 conflict to an email field error", async () => {
		client.signUp.mockRejectedValue(new NuvioApiError(409));
		await expect(
			signUp(
				{ email: "a@b.com", password: "longenough", redirectTo: "/" },
				issue,
			),
		).rejects.toMatchObject({ payload: { field: "email" } });
	});
});

describe("signOut", () => {
	it("clears the cookie and redirects even if the API call fails", async () => {
		client.signOut.mockRejectedValue(new NuvioApiError(401));
		await expect(signOut({}, issue)).rejects.toMatchObject({
			location: "auth/sign-in",
		});
		expect(session.clear).toHaveBeenCalled();
	});
});

describe("the instance lock", () => {
	beforeEach(() => {
		event.locals.services = withDatabase;
	});

	it("refuses a sign-in before the credentials reach Nuvio", async () => {
		adminData.canSignIn.mockReturnValue(false);

		await expect(
			signIn({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toBeInstanceOf(Invalid);

		expect(client.signInWithPassword).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			"Blocked sign-in: instance is locked",
			{ email: "a@b.com" },
		);
	});

	it("records a sign-in as a side effect", async () => {
		client.signInWithPassword.mockResolvedValue(apiSession);

		await expect(
			signIn({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toBeInstanceOf(Redirect);

		expect(adminData.recordSignIn).toHaveBeenCalledWith(
			{ marker: "db" },
			"user@example.com",
			"user-1",
		);
	});

	it("logs and swallows a failed metrics write rather than failing the sign-in", async () => {
		client.signInWithPassword.mockResolvedValue(apiSession);
		adminData.recordSignIn.mockImplementation(() => {
			throw new Error("disk full");
		});

		await expect(
			signIn(
				{ email: "a@b.com", password: "pw", redirectTo: "/library" },
				issue,
			),
		).rejects.toMatchObject({ status: 303, location: "/library" });

		expect(logger.error).toHaveBeenCalledWith(
			"Could not record a sign-in",
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});

	it("logs a non-Error metrics failure as unknown", async () => {
		client.signInWithPassword.mockResolvedValue(apiSession);
		adminData.recordSignIn.mockImplementation(() => {
			// biome-ignore lint/style/useThrowOnlyError: the point of the test is the non-Error branch of `record()`'s catch
			throw "a string";
		});

		await expect(
			signIn({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toBeInstanceOf(Redirect);

		expect(logger.error).toHaveBeenCalledWith("Could not record a sign-in", {
			error: "Unknown error",
		});
	});
});

describe("the attempt limit", () => {
	const attempt = (email: string) =>
		signIn({ email, password: "pw", redirectTo: "/" }, issue);

	it("refuses a sixth attempt on one email, before it reaches Nuvio", async () => {
		client.signInWithPassword.mockRejectedValue(new NuvioApiError(401));
		for (let count = 0; count < 5; count++) {
			await expect(attempt("a@b.com")).rejects.toMatchObject({
				payload: { field: "password" },
			});
		}
		client.signInWithPassword.mockClear();
		await expect(attempt("A@B.com")).rejects.toMatchObject({
			payload: expect.stringContaining("Too many attempts"),
		});
		expect(client.signInWithPassword).not.toHaveBeenCalled();
	});

	it("refuses an eleventh attempt from one address, whatever the email", async () => {
		client.signInWithPassword.mockRejectedValue(new NuvioApiError(401));
		for (let count = 0; count < 10; count++) {
			await expect(attempt(`user${count}@b.com`)).rejects.toBeInstanceOf(
				Invalid,
			);
		}
		await expect(attempt("fresh@b.com")).rejects.toMatchObject({
			payload: expect.stringContaining("Too many attempts"),
		});
		event.getClientAddress = () => "198.51.100.1";
		await expect(attempt("fresh@b.com")).rejects.toMatchObject({
			payload: { field: "password" },
		});
	});

	it("throttles sign-up too", async () => {
		client.signUp.mockRejectedValue(new NuvioApiError(409));
		for (let count = 0; count < 5; count++) {
			await expect(
				signUp({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
			).rejects.toMatchObject({ payload: { field: "email" } });
		}
		await expect(
			signUp({ email: "a@b.com", password: "pw", redirectTo: "/" }, issue),
		).rejects.toMatchObject({
			payload: expect.stringContaining("Too many attempts"),
		});
	});
});

describe("signUp redirect targets", () => {
	it("carries a redirectTo through to the sign-in page", async () => {
		client.signUp.mockResolvedValue({ session: null, user: { id: "u" } });

		await expect(
			signUp(
				{ email: "a@b.com", password: "pw", redirectTo: "/library" },
				issue,
			),
		).rejects.toMatchObject({
			location: "auth/sign-in?registered=1&redirectTo=%2Flibrary",
		});
	});
});

describe("signOut failures", () => {
	it("rethrows anything that is not an API error", async () => {
		client.signOut.mockRejectedValue(new TypeError("network down"));
		await expect(signOut({}, issue)).rejects.toThrow("network down");
		expect(session.clear).not.toHaveBeenCalled();
	});
});

describe("backends", () => {
	const custom = {
		backendUrl: "https://backend.example/",
		backendKey: "sb_publishable_custom",
	};
	const signInWith = (extra: Record<string, unknown>) =>
		signIn(
			{ email: "a@b.com", password: "pw", redirectTo: "/", ...extra },
			issue,
		);

	beforeEach(() => {
		event.locals.services = withDatabase;
	});

	it("refuses a typed-in backend unless the admin allows custom backends", async () => {
		await expect(signInWith(custom)).rejects.toMatchObject({
			payload: expect.stringContaining("doesn't allow custom backends"),
		});
		expect(client.signInWithPassword).not.toHaveBeenCalled();
	});

	it("signs in against an allowed backend, keyed apart, and tells the admins the first time", async () => {
		backendsData.policy.customAllowed = true;
		client.signInWithPassword.mockResolvedValue({
			...apiSession,
			refresh_token: "r",
			expires_in: 3600,
		});
		await expect(signInWith(custom)).rejects.toBeInstanceOf(Redirect);
		expect(clientOptions[0]).toMatchObject({
			baseUrl: "https://backend.example",
			publishableKey: "sb_publishable_custom",
			keepFetch: true,
		});
		const backend = {
			url: "https://backend.example",
			publishableKey: "sb_publishable_custom",
			trusted: false,
		};
		expect(session.write).toHaveBeenCalledWith(expect.anything(), backend);
		const [, , key] = adminData.recordSignIn.mock.calls[0] as unknown as [
			unknown,
			string,
			string,
		];
		expect(key).toMatch(/^custom-/);
		expect(nuvioSync.touch).toHaveBeenCalledWith(key);
		expect(notifier.notify).toHaveBeenCalledWith(
			{
				kind: "custom_backend_seen",
				backendId: "b1",
				url: "https://backend.example",
			},
			expect.stringContaining("admin?tab=backends"),
		);
	});

	it("does not notify for a backend already seen", async () => {
		backendsData.policy.customAllowed = true;
		backendsData.recordCustomSignIn.mockReturnValue({
			id: "b1",
			firstSeen: false,
		});
		client.signInWithPassword.mockResolvedValue({
			...apiSession,
			refresh_token: "r",
			expires_in: 3600,
		});
		await expect(signInWith(custom)).rejects.toBeInstanceOf(Redirect);
		expect(notifier.notify).not.toHaveBeenCalled();
	});

	it("refuses a banned backend before the credentials leave", async () => {
		backendsData.policy.customAllowed = true;
		backendsData.banned.add("https://backend.example");
		await expect(signInWith(custom)).rejects.toMatchObject({
			payload: expect.stringContaining("blocked that backend"),
		});
		expect(client.signInWithPassword).not.toHaveBeenCalled();
	});

	it("refuses a custom backend outright while the instance is locked", async () => {
		backendsData.policy.customAllowed = true;
		adminData.isLocked.mockReturnValue(true);
		await expect(signInWith(custom)).rejects.toMatchObject({
			payload: expect.stringContaining("invite-only"),
		});
		expect(adminData.canSignIn).not.toHaveBeenCalled();
		expect(client.signInWithPassword).not.toHaveBeenCalled();
	});

	it.each([
		["javascript:alert(1)", "sb_key"],
		["https://user:pass@backend.example", "sb_key"],
		["https://backend.example/a b", "sb_key"],
		["https://backend.example/\u0000", "sb_key"],
		["https://backend.example/?x=1", "sb_key"],
		[`https://backend.example/${"a".repeat(2100)}`, "sb_key"],
	])("refuses the URL %s", async (backendUrl, backendKey) => {
		backendsData.policy.customAllowed = true;
		await expect(signInWith({ backendUrl, backendKey })).rejects.toMatchObject({
			payload: { field: "backendUrl" },
		});
	});

	it("always offers the official API, next to an admin default and with custom backends off", async () => {
		backendsData.policy.defaultBackend = {
			url: "http://192.168.1.10",
			publishableKey: "k",
			trusted: true,
		};
		client.signInWithPassword.mockResolvedValue({
			...apiSession,
			refresh_token: "r",
			expires_in: 3600,
		});
		await expect(
			signInWith({ backendUrl: "https://api.nuvio.tv", backendKey: "" }),
		).rejects.toBeInstanceOf(Redirect);
		expect(clientOptions.at(-1)).not.toHaveProperty("baseUrl");
		expect(discover).not.toHaveBeenCalled();
	});

	it("reads the key a self-hosted backend publishes when none is typed", async () => {
		backendsData.policy.customAllowed = true;
		discover.mockResolvedValueOnce("sb_publishable_discovered");
		client.signInWithPassword.mockResolvedValue({
			...apiSession,
			refresh_token: "r",
			expires_in: 3600,
		});
		await expect(
			signInWith({ backendUrl: custom.backendUrl, backendKey: "" }),
		).rejects.toBeInstanceOf(Redirect);
		expect(discover).toHaveBeenCalledWith(
			"https://backend.example",
			expect.any(Function),
		);
		expect(clientOptions.at(-1)).toMatchObject({
			baseUrl: "https://backend.example",
			publishableKey: "sb_publishable_discovered",
		});
	});

	it("never asks a banned backend for its key", async () => {
		backendsData.policy.customAllowed = true;
		backendsData.banned.add("https://backend.example");
		await expect(
			signInWith({ backendUrl: custom.backendUrl, backendKey: "" }),
		).rejects.toBeInstanceOf(Invalid);
		expect(discover).not.toHaveBeenCalled();
	});

	it.each(["", "key\r\nx-injected: 1", "key with spaces", "k".repeat(1025)])(
		"refuses the key %j",
		async (backendKey) => {
			backendsData.policy.customAllowed = true;
			await expect(
				signInWith({ backendUrl: custom.backendUrl, backendKey }),
			).rejects.toMatchObject({ payload: { field: "backendKey" } });
		},
	);

	it("refuses a session whose user id or email is not sane", async () => {
		backendsData.policy.customAllowed = true;
		client.signInWithPassword.mockResolvedValue({
			access_token: "t",
			refresh_token: "r",
			expires_in: 3600,
			user: { id: "../../etc\npasswd", email: "a@b.com" },
		});
		await expect(signInWith(custom)).rejects.toMatchObject({
			payload: expect.stringContaining("did not answer like a Nuvio backend"),
		});
		expect(session.write).not.toHaveBeenCalled();
	});

	it("words a blocked address without the transport's own text", async () => {
		backendsData.policy.customAllowed = true;
		client.signInWithPassword.mockRejectedValue(
			Object.assign(new NuvioApiError(502), { code: "backend_blocked" }),
		);
		await expect(signInWith(custom)).rejects.toMatchObject({
			payload: expect.stringContaining("reserved address"),
		});
	});

	it("signs in through the admin default when the form names none, trusting its email", async () => {
		const defaultBackend = {
			url: "http://192.168.1.10:8000",
			publishableKey: "anon",
			trusted: true,
		};
		backendsData.policy.defaultBackend = defaultBackend;
		client.signInWithPassword.mockResolvedValue({
			...apiSession,
			refresh_token: "r",
			expires_in: 3600,
		});
		await expect(signInWith({})).rejects.toBeInstanceOf(Redirect);
		expect(clientOptions[0]).toMatchObject({
			baseUrl: "http://192.168.1.10:8000",
		});
		expect(session.write).toHaveBeenCalledWith(
			expect.anything(),
			defaultBackend,
		);
		// The allowlist applies to it like to the official API, and it is not "seen".
		expect(adminData.canSignIn).toHaveBeenCalled();
		expect(backendsData.recordCustomSignIn).not.toHaveBeenCalled();
	});
});
