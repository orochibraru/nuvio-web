import { describe, expect, it, vi } from "vitest";
import { NuvioApiError, NuvioClient } from "./client.ts";

const fakeSession = {
	access_token: "t",
	refresh_token: "r",
	expires_at: Date.now() / 1000 + 3600,
	token_type: "bearer",
	user: { id: "u", email: "e" },
} as never;

describe("NuvioClient request timeout", () => {
	it("rejects with a 408 NuvioApiError when the API never responds", async () => {
		// Respects the abort signal but otherwise never resolves.
		const hangingFetch = vi.fn(
			(_url: string, init: RequestInit = {}) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		) as unknown as typeof fetch;

		const client = new NuvioClient({
			fetch: hangingFetch,
			requestTimeoutMs: 40,
			session: fakeSession,
		});

		await expect(client.rpc("sync_pull_profiles" as never)).rejects.toSatisfy(
			(err) => err instanceof NuvioApiError && err.status === 408,
		);
	});

	it("passes an AbortSignal through to fetch and returns the body", async () => {
		let seenSignal: unknown;
		const okFetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
			seenSignal = init.signal;
			return new Response("[]", {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const client = new NuvioClient({ fetch: okFetch, session: fakeSession });
		const result = await client.rpc("sync_pull_profiles" as never);

		expect(seenSignal).toBeInstanceOf(AbortSignal);
		expect(result).toEqual([]);
	});
});
