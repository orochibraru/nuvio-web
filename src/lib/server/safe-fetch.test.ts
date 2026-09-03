import { beforeEach, describe, expect, it, vi } from "vitest";

// Literal addresses never reach the resolver; these tests drive the hostname
// path, where what DNS answers is the whole question.
const dns = vi.hoisted(() => ({
	lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }));

import { safeFetch } from "./safe-fetch.ts";

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

	it("rejects a value that is not a URL", async () => {
		await expect(safeFetch("not a url", okFetch())).rejects.toThrow(
			/Invalid URL/,
		);
	});

	it("blocks IPv6 loopback, link-local and unique-local literals", async () => {
		for (const host of [
			"[::]",
			"[::1]",
			"[fe80::1]",
			"[fc00::1]",
			"[fd12::1]",
		]) {
			await expect(safeFetch(`https://${host}/x`, okFetch())).rejects.toThrow(
				/disallowed/,
			);
		}
	});

	it("blocks an IPv4-mapped IPv6 address pointing at a private range", async () => {
		// `new URL()` rewrites the literal to `[::ffff:a00:1]`, so the guard has
		// to recognize the hex spelling as well as the dotted one.
		for (const host of [
			"[::ffff:10.0.0.1]",
			"[::ffff:127.0.0.1]",
			"[::ffff:192.168.0.1]",
		]) {
			await expect(safeFetch(`https://${host}/x`, okFetch())).rejects.toThrow(
				/disallowed/,
			);
		}
	});

	it("still allows an IPv4-mapped address pointing at a public host", async () => {
		await expect(
			safeFetch("https://[::ffff:93.184.216.34]/x", okFetch()),
		).resolves.toBeInstanceOf(Response);
	});

	it("allows a public IPv6 literal", async () => {
		await expect(
			safeFetch("https://[2606:2800:220:1:248:1893:25c8:1946]/x", okFetch()),
		).resolves.toBeInstanceOf(Response);
	});

	it("blocks the whole of a multicast / reserved range", async () => {
		for (const host of ["224.0.0.1", "240.0.0.1", "0.0.0.0", "100.64.0.1"]) {
			await expect(safeFetch(`https://${host}/x`, okFetch())).rejects.toThrow(
				/disallowed/,
			);
		}
	});
});

describe("safeFetch host resolution", () => {
	beforeEach(() => {
		dns.lookup.mockReset();
		dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
	});

	it("resolves a hostname and allows a public answer", async () => {
		await expect(
			safeFetch("https://addon.example/x", okFetch()),
		).resolves.toBeInstanceOf(Response);
		expect(dns.lookup).toHaveBeenCalledWith("addon.example", { all: true });
	});

	it("blocks a hostname that resolves into a private range", async () => {
		dns.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "127.0.0.1", family: 4 },
		]);
		await expect(
			safeFetch("https://rebind.example/x", okFetch()),
		).rejects.toThrow(/disallowed/);
	});

	it("rejects a hostname that resolves to nothing", async () => {
		dns.lookup.mockResolvedValue([]);
		await expect(
			safeFetch("https://void.example/x", okFetch()),
		).rejects.toThrow(/did not resolve/);
	});

	it("treats an answer that is not an IP as disallowed", async () => {
		dns.lookup.mockResolvedValue([{ address: "nonsense", family: 4 }]);
		await expect(
			safeFetch("https://weird.example/x", okFetch()),
		).rejects.toThrow(/disallowed/);
	});
});
