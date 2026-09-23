import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sveltejs/kit", () => ({
	error: (status: number, message: string) => {
		throw Object.assign(new Error(message), { status });
	},
	json: (value: unknown) => Response.json(value),
}));

import { Container, SESSION } from "#lib/services/index.js";
import { POST } from "./+server.ts";

const write = vi.fn();

function call(body: unknown) {
	return POST({
		request: new Request("http://localhost/dev/e2e-session", {
			method: "POST",
			body: JSON.stringify(body),
		}),
		locals: {
			services: new Container("test").provide(SESSION, { write } as never),
		},
	} as never);
}

const valid = {
	access_token: "at",
	refresh_token: "rt",
	expires_in: 3600,
	user: { id: "u1", email: "a@b.c" },
};

afterEach(() => {
	vi.unstubAllEnvs();
	write.mockReset();
});

describe("POST /dev/e2e-session", () => {
	it("is a 404 without NUVIO_E2E", async () => {
		vi.stubEnv("NUVIO_E2E", "");
		await expect(call(valid)).rejects.toMatchObject({ status: 404 });
		expect(write).not.toHaveBeenCalled();
	});

	it("starts a store session under NUVIO_E2E", async () => {
		vi.stubEnv("NUVIO_E2E", "1");
		const response = await call(valid);
		expect(response.status).toBe(200);
		expect(write).toHaveBeenCalledWith({ ...valid, token_type: "bearer" });
	});

	it("rejects a malformed body", async () => {
		vi.stubEnv("NUVIO_E2E", "1");
		await expect(call({ access_token: "at" })).rejects.toMatchObject({
			status: 400,
		});
	});
});
