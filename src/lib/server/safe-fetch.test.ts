import { describe, expect, it, vi } from "vitest";
import { safeFetch } from "./safe-fetch.js";

function okFetch(): typeof fetch {
	return vi.fn(
		async () => new Response("ok", { status: 200 }),
	) as unknown as typeof fetch;
}

describe("safeFetch", () => {
	it("rejects a non-https scheme unless allowHttp", async () => {
		await expect(safeFetch("http://1.2.3.4/x", okFetch())).rejects.toThrow(
			/https/,
		);
		await expect(
			safeFetch("http://1.2.3.4/x", okFetch(), {}, { allowHttp: true }),
		).resolves.toBeInstanceOf(Response);
	});

	it("blocks loopback / private / link-local literal addresses", async () => {
		for (const host of [
			"127.0.0.1",
			"10.0.0.5",
			"192.168.1.1",
			"169.254.1.1",
			"[::1]",
		]) {
			await expect(safeFetch(`https://${host}/x`, okFetch())).rejects.toThrow(
				/disallowed|https/,
			);
		}
	});

	it("allows a public literal address and passes redirect:manual", async () => {
		const impl = okFetch();
		await safeFetch("https://93.184.216.34/x", impl as unknown as typeof fetch);
		expect(impl).toHaveBeenCalledWith(
			"https://93.184.216.34/x",
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("follows a redirect to another public host and re-checks it", async () => {
		const impl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(null, {
					status: 302,
					headers: { location: "https://198.51.100.7/final" },
				}),
			)
			.mockResolvedValueOnce(new Response("done", { status: 200 }));
		const res = await safeFetch(
			"https://93.184.216.34/start",
			impl as unknown as typeof fetch,
		);
		expect(res.status).toBe(200);
		expect(impl).toHaveBeenCalledTimes(2);
	});

	it("stops a redirect chain that exceeds maxRedirects", async () => {
		const impl = vi.fn(
			async () =>
				new Response(null, {
					status: 302,
					headers: { location: "https://198.51.100.7/loop" },
				}),
		);
		await expect(
			safeFetch(
				"https://93.184.216.34/start",
				impl as unknown as typeof fetch,
				{},
				{ maxRedirects: 2 },
			),
		).rejects.toThrow(/redirect/i);
	});
});
