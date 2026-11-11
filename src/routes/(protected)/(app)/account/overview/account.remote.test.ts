import { beforeEach, describe, expect, it, vi } from "vitest";

const { event } = vi.hoisted(() => ({
	event: { locals: {} as Record<string, unknown> },
}));

vi.mock("@sveltejs/kit", () => ({
	error: (status: number) => {
		throw Object.assign(new Error("error"), { status });
	},
	invalid: (payload: unknown) => {
		throw Object.assign(new Error("invalid"), { payload });
	},
	redirect: (status: number, location: string) => {
		throw Object.assign(new Error("redirect"), { status, location });
	},
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("$app/server", () => ({
	form: (_schema: unknown, fn: unknown) => fn,
	getRequestEvent: () => event,
}));

import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { NuvioApiError } from "#lib/nuvio/index.js";
import { Container, LOGGER, Logger, SESSION } from "#lib/services/index.js";
import { SESSION_STORE } from "#lib/services/session-store.service.js";
import { USER_DATA_STORE } from "#lib/userdata/tokens.js";
import * as remote from "./account.remote.ts";

type Handler = (
	data: Record<string, unknown>,
	issue: Record<string, (message: string) => unknown>,
) => Promise<unknown>;
const deleteAccount = remote.deleteAccount as unknown as Handler;

const issue = new Proxy(
	{},
	{ get: (_t, field: string) => (message: string) => ({ field, message }) },
) as Record<string, (message: string) => unknown>;

const fakes = {
	owns: vi.fn(() => true),
	deleteAccount: vi.fn(async (_password: string) => undefined),
	deleteUser: vi.fn(),
	deleteAllForUser: vi.fn(),
	clear: vi.fn(),
};

function signedIn(): void {
	event.locals = {
		session: { accountKey: "custom-abc", trusted: true },
		nuvio: { deleteAccount: fakes.deleteAccount },
		services: new Container("test")
			.provide(BUILT_IN_BACKEND, { ownsSession: fakes.owns } as never)
			.provide(USER_DATA_STORE, { deleteUser: fakes.deleteUser } as never)
			.provide(SESSION_STORE, {
				deleteAllForUser: fakes.deleteAllForUser,
			} as never)
			.provide(SESSION, { clear: fakes.clear } as never)
			.provide(LOGGER, new Logger("error", { out: () => {}, err: () => {} })),
	};
}

beforeEach(() => {
	for (const fake of Object.values(fakes)) {
		fake.mockClear();
	}
	fakes.owns.mockReturnValue(true);
	signedIn();
});

describe("deleteAccount", () => {
	it("deletes the account, this server's copy of it, and every session", async () => {
		await expect(
			deleteAccount({ _password: "correct horse" }, issue),
		).rejects.toMatchObject({ status: 303, location: "auth/sign-in" });
		expect(fakes.deleteAccount).toHaveBeenCalledWith("correct horse");
		expect(fakes.deleteUser).toHaveBeenCalledWith("custom-abc");
		expect(fakes.deleteAllForUser).toHaveBeenCalledWith("custom-abc");
		expect(fakes.clear).toHaveBeenCalled();
	});

	it("is a 404 for a session on any other backend", async () => {
		fakes.owns.mockReturnValue(false);
		await expect(
			deleteAccount({ _password: "correct horse" }, issue),
		).rejects.toMatchObject({ status: 404 });
		expect(fakes.deleteAccount).not.toHaveBeenCalled();
	});

	it("keeps everything on a wrong password", async () => {
		fakes.deleteAccount.mockRejectedValueOnce(
			new NuvioApiError(400, { code: "invalid_credentials" }, "Invalid"),
		);
		await expect(
			deleteAccount({ _password: "wrong horse" }, issue),
		).rejects.toMatchObject({ payload: { field: "_password" } });
		expect(fakes.deleteUser).not.toHaveBeenCalled();
		expect(fakes.clear).not.toHaveBeenCalled();
	});
});
