import { beforeEach, describe, expect, it, vi } from "vitest";

const { Redirect, Invalid, NuvioApiError, client, session, event } = vi.hoisted(
	() => {
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
			session: { writeStoredSession: vi.fn(), clearStoredSession: vi.fn() },
			event: { cookies: {}, fetch: vi.fn(), locals: {} as { nuvio?: unknown } },
		};
	},
);

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
vi.mock("#lib/server/session.js", () => session);
vi.mock("$app/env", () => ({ dev: false }));
vi.mock("#lib/server/db.js", () => ({ tryDb: () => null }));
vi.mock("$app/env/private", () => ({
	NUVIO_ADMIN_EMAILS: "",
	NUVIO_DATA_DIR: "data",
}));
vi.mock("#lib/nuvio/index.js", () => ({
	NuvioApiError,
	NuvioClient: class {
		signInWithPassword = client.signInWithPassword;
		signUp = client.signUp;
	},
}));

import * as authForms from "./auth.remote.js";

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
const signIn = authForms.signIn as unknown as FormHandler;
const signUp = authForms.signUp as unknown as FormHandler;
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
	event.locals = { nuvio: { signOut: client.signOut } };
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
		expect(session.writeStoredSession).toHaveBeenCalled();
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
		expect(session.writeStoredSession).toHaveBeenCalled();
	});

	it("routes to sign-in with ?registered=1 when there's no session yet", async () => {
		client.signUp.mockResolvedValue({});
		await expect(
			signUp(
				{ email: "a@b.com", password: "longenough", redirectTo: "/" },
				issue,
			),
		).rejects.toMatchObject({ location: "auth/sign-in?registered=1" });
		expect(session.writeStoredSession).not.toHaveBeenCalled();
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
		expect(session.clearStoredSession).toHaveBeenCalled();
	});
});
