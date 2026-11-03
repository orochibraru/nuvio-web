import { beforeEach, describe, expect, it, vi } from "vitest";

class Invalid {
	constructor(public issues: unknown[]) {}
}

vi.mock("@sveltejs/kit", () => ({
	invalid: (...issues: unknown[]) => {
		throw new Invalid(issues);
	},
	error: (status: number) => {
		throw Object.assign(new Error("error"), { status });
	},
}));

const { data, logger, store, guard, event, builtIn } = vi.hoisted(() => {
	const data = {
		policy: {
			customAllowed: false,
			defaultBackend: null as null | { url: string },
		},
		setCustomBackendsAllowed: vi.fn(),
		setDefaultBackend: vi.fn(),
		setBackendBanned: vi.fn((): string | null => "https://b.example"),
		testBackend: vi.fn(async () => true),
	};
	const logger = { warn: vi.fn(), info: vi.fn() };
	const builtIn = {
		summary: vi.fn(() => ({
			url: "https://nuvio.example/api/nuvio",
			publishableKey: "sb_publishable_own",
			hasAccount: true,
		})),
		createAccount: vi.fn(async () => true),
	};
	const store = { deleteAllForBackend: vi.fn() };
	const guard = { requireAdmin: vi.fn() };
	const db = { marker: "db" };
	return {
		data,
		logger,
		store,
		guard,
		builtIn,
		event: {
			url: new URL("https://nuvio.example/admin"),
			locals: {
				services: {
					get: (token: unknown) => {
						const name = String(token);
						if (name === "LOGGER") {
							return logger;
						}
						if (name === "SESSION_STORE") {
							return store;
						}
						if (name === "BUILT_IN_BACKEND") {
							return builtIn;
						}
						return { connect: () => db };
					},
				},
			},
		},
	};
});

vi.mock("$app/server", () => ({
	form: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	command: (_schema: unknown, fn: unknown) => fn,
}));

vi.mock("#lib/server/guards.js", () => ({
	requireAdmin: () => {
		guard.requireAdmin();
		return { event, email: "boss@example.com" };
	},
}));

vi.mock("#lib/services/index.js", () => ({
	DATABASE: { toString: () => "DATABASE" },
	LOGGER: { toString: () => "LOGGER" },
}));

vi.mock("#lib/backend/tokens.js", () => ({
	BUILT_IN_BACKEND: { toString: () => "BUILT_IN_BACKEND" },
}));

vi.mock("#lib/services/session-store.service.js", () => ({
	SESSION_STORE: { toString: () => "SESSION_STORE" },
}));

vi.mock("#lib/admin/backends-data.js", async (original) => {
	const actual = await original<typeof import("#lib/admin/backends-data.js")>();
	return {
		backendFieldsSchema: actual.backendFieldsSchema,
		backendPolicy: () => data.policy,
		setCustomBackendsAllowed: (...args: unknown[]) =>
			data.setCustomBackendsAllowed(...args),
		setDefaultBackend: (...args: unknown[]) => data.setDefaultBackend(...args),
		setBackendBanned: (...args: unknown[]) =>
			data.setBackendBanned(...(args as [])),
		testBackend: (...args: unknown[]) => data.testBackend(...(args as [])),
	};
});

import * as remote from "./backends.remote.ts";

type Handler = (
	input: Record<string, unknown>,
	issue?: Record<string, (message: string) => unknown>,
) => unknown;
const setCustomBackends = remote.setCustomBackends as unknown as Handler;
const saveDefaultBackend = remote.saveDefaultBackend as unknown as Handler;
const testDefaultBackend = remote.testDefaultBackend as unknown as Handler;
const setBackendBan = remote.setBackendBan as unknown as Handler;
const useBuiltInBackend = remote.useBuiltInBackend as unknown as () => void;
const createBuiltInAccount = remote.createBuiltInAccount as unknown as Handler;

const issue = new Proxy(
	{},
	{ get: (_t, field: string) => (message: string) => ({ field, message }) },
) as Record<string, (message: string) => unknown>;

beforeEach(() => {
	vi.clearAllMocks();
	data.policy = { customAllowed: false, defaultBackend: null };
});

describe("every function is admin-only", () => {
	it("checks requireAdmin before doing anything", async () => {
		guard.requireAdmin.mockImplementation(() => {
			throw new Error("404");
		});
		expect(() => setCustomBackends({ allowed: "on" })).toThrow("404");
		expect(() => saveDefaultBackend({ url: "" }, issue)).toThrow("404");
		await expect(
			testDefaultBackend({ url: "https://x.example", publishableKey: "k" }),
		).rejects.toThrow("404");
		expect(() => setBackendBan({ id: "x", banned: true })).toThrow("404");
		expect(data.setCustomBackendsAllowed).not.toHaveBeenCalled();
		expect(data.setDefaultBackend).not.toHaveBeenCalled();
		expect(data.testBackend).not.toHaveBeenCalled();
		expect(data.setBackendBanned).not.toHaveBeenCalled();
		guard.requireAdmin.mockReset();
	});
});

describe("setCustomBackends", () => {
	it("stores the toggle", () => {
		setCustomBackends({ allowed: "on" });
		expect(data.setCustomBackendsAllowed).toHaveBeenCalledWith(
			{ marker: "db" },
			true,
		);
		setCustomBackends({ allowed: "off" });
		expect(data.setCustomBackendsAllowed).toHaveBeenLastCalledWith(
			{ marker: "db" },
			false,
		);
	});
});

describe("saveDefaultBackend", () => {
	it("accepts a LAN address from the admin, normalised", () => {
		saveDefaultBackend(
			{ url: "http://192.168.1.10:8000/", publishableKey: "anon" },
			issue,
		);
		expect(data.setDefaultBackend).toHaveBeenCalledWith(
			{ marker: "db" },
			{ url: "http://192.168.1.10:8000", publishableKey: "anon" },
		);
	});

	it("refuses a malformed URL or key, field by field", () => {
		expect(() =>
			saveDefaultBackend(
				{ url: "https://u:p@x.example", publishableKey: "a\r\nb" },
				issue,
			),
		).toThrow(Invalid);
		expect(data.setDefaultBackend).not.toHaveBeenCalled();
	});

	it("ends the sessions of the default it replaces", () => {
		data.policy.defaultBackend = { url: "http://192.168.1.10" };
		saveDefaultBackend({ url: "", publishableKey: "" }, issue);
		expect(data.setDefaultBackend).toHaveBeenCalledWith({ marker: "db" }, null);
		expect(store.deleteAllForBackend).toHaveBeenCalledWith(
			"http://192.168.1.10",
		);
	});

	it("ends the official API's sessions when it replaces it", () => {
		data.policy.defaultBackend = null;
		saveDefaultBackend(
			{ url: "https://own.example", publishableKey: "sb_publishable_x" },
			issue,
		);
		expect(store.deleteAllForBackend).toHaveBeenCalledWith(null);
	});
});

describe("setBackendBan", () => {
	it("bans and signs everyone on it out", () => {
		setBackendBan({ id: "b1", banned: true });
		expect(data.setBackendBanned).toHaveBeenCalledWith({ marker: "db" }, "b1", {
			banned: true,
			by: "boss@example.com",
		});
		expect(store.deleteAllForBackend).toHaveBeenCalledWith("https://b.example");
		expect(logger.warn).toHaveBeenCalledWith("Custom backend banned", {
			by: "boss@example.com",
			backend: "https://b.example",
		});
	});

	it("unbans without signing anyone in or out", () => {
		setBackendBan({ id: "b1", banned: false });
		expect(store.deleteAllForBackend).not.toHaveBeenCalled();
	});

	it("is a 404 for an unknown backend", () => {
		data.setBackendBanned.mockReturnValueOnce(null);
		expect(() => setBackendBan({ id: "b1", banned: true })).toThrow(
			expect.objectContaining({ status: 404 }),
		);
	});
});

describe("useBuiltInBackend", () => {
	it("makes this instance's own backend the default", () => {
		data.policy.defaultBackend = { url: "http://192.168.1.10" };
		useBuiltInBackend();
		expect(builtIn.summary).toHaveBeenCalledWith(
			"https://nuvio.example",
			"boss@example.com",
		);
		expect(data.setDefaultBackend).toHaveBeenCalledWith(
			{ marker: "db" },
			{
				url: "https://nuvio.example/api/nuvio",
				publishableKey: "sb_publishable_own",
			},
		);
		expect(store.deleteAllForBackend).toHaveBeenCalledWith(
			"http://192.168.1.10",
		);
	});

	it("refuses while the admin has no account there to sign back in with", () => {
		builtIn.summary.mockReturnValueOnce({
			url: "https://nuvio.example/api/nuvio",
			publishableKey: "sb_publishable_own",
			hasAccount: false,
		});
		expect(() => useBuiltInBackend()).toThrow(Invalid);
		expect(data.setDefaultBackend).not.toHaveBeenCalled();
	});
});

describe("createBuiltInAccount", () => {
	it("creates the admin's own account", async () => {
		await createBuiltInAccount({ _password: "long enough" }, issue);
		expect(builtIn.createAccount).toHaveBeenCalledWith(
			"boss@example.com",
			"long enough",
		);
	});

	it("says so when the account already exists", async () => {
		builtIn.createAccount.mockResolvedValueOnce(false);
		await expect(
			createBuiltInAccount({ _password: "long enough" }, issue),
		).rejects.toBeInstanceOf(Invalid);
	});
});
