import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Literal addresses never reach the resolver; these tests drive the hostname
// path, where what DNS answers is the whole question.
const dns = vi.hoisted(() => ({
	lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }));

// `pinnedFetch`'s transport. The fake plays the part of a socket: it asks the
// injected `lookup` for an address exactly as `net.connect` would, and only
// "connects" (answers) if that lookup hands one back.
const net = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:http", () => ({ default: { request: net.request } }));
vi.mock("node:https", () => ({ default: { request: net.request } }));

import { pinnedFetch, safeFetch } from "./safe-fetch.ts";

type LookupCallback = (
	error: Error | null,
	answers: Array<{ address: string; family: number }> | string,
	family?: number,
) => void;

interface FakeOptions {
	headers: Record<string, string>;
	method: string;
	lookup: (host: string, options: object, callback: LookupCallback) => void;
}

function serve(
	status: number,
	headers: Record<string, string | string[]>,
	body = "",
): { connectedTo: () => unknown } {
	let connected: unknown;
	net.request.mockImplementation(
		(url: URL, options: FakeOptions, onResponse: (r: unknown) => void) => {
			const request = Object.assign(new EventEmitter(), {
				end() {
					options.lookup(url.hostname, { all: true }, (error, answers) => {
						if (error) {
							request.emit("error", error);
							return;
						}
						connected = answers;
						onResponse(
							Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
								statusCode: status,
								statusMessage: "",
								headers,
							}),
						);
					});
				},
			});
			return request;
		},
	);
	return { connectedTo: () => connected };
}

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

	it("blocks a dotted IPv4-mapped answer from the resolver", async () => {
		dns.lookup.mockResolvedValue([{ address: "::ffff:10.0.0.1", family: 6 }]);
		await expect(
			safeFetch("https://mapped.example/x", okFetch()),
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

describe("pinnedFetch", () => {
	beforeEach(() => {
		net.request.mockReset();
		dns.lookup.mockReset();
		dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
	});

	it("connects to the validated address and converts the response", async () => {
		const socket = serve(
			200,
			{ "content-type": "application/json", "set-cookie": ["a=1", "b=2"] },
			'{"ok":true}',
		);
		const response = await pinnedFetch("https://addon.example/manifest.json", {
			headers: { accept: "application/json" },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(response.headers.get("set-cookie")).toBe("a=1, b=2");
		expect(socket.connectedTo()).toEqual([
			{ address: "93.184.216.34", family: 4 },
		]);
		const [url, options] = net.request.mock.calls[0];
		expect(String(url)).toBe("https://addon.example/manifest.json");
		expect(options).toMatchObject({
			method: "GET",
			headers: { accept: "application/json" },
		});
	});

	it("refuses a name that rebinds to a private address between check and connect", async () => {
		serve(200, {}, "secret");
		dns.lookup
			.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
			.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
		await expect(
			safeFetch("https://rebind.example/latest/meta-data", pinnedFetch),
		).rejects.toThrow(/disallowed/);
	});

	it("answers a single-address lookup when the socket asks for one", async () => {
		let lookup: FakeOptions["lookup"] | undefined;
		net.request.mockImplementation((_url: URL, options: FakeOptions) => {
			lookup = options.lookup;
			return Object.assign(new EventEmitter(), { end() {} });
		});
		// Never settles: the fake never answers. Only the lookup is under test.
		void pinnedFetch(new Request("http://addon.example/x"));
		await vi.waitFor(() => expect(lookup).toBeDefined());
		const answer = await new Promise((resolve) =>
			lookup?.("addon.example", {}, (_error, address, family) =>
				resolve({ address, family }),
			),
		);
		expect(answer).toEqual({ address: "93.184.216.34", family: 4 });
	});

	it("gives a bodiless status and HEAD a null body", async () => {
		serve(204, {});
		expect((await pinnedFetch("https://addon.example/x")).body).toBeNull();
		serve(200, { "content-length": "5" }, "hello");
		const head = await pinnedFetch("https://addon.example/x", {
			method: "HEAD",
		});
		expect(head.body).toBeNull();
		expect(head.headers.get("content-length")).toBe("5");
	});

	it("refuses a non-http scheme and a private literal before any socket", async () => {
		await expect(pinnedFetch("ftp://addon.example/x")).rejects.toThrow(
			/http\(s\)/,
		);
		await expect(pinnedFetch("http://[::1]/x")).rejects.toThrow(/disallowed/);
		expect(net.request).not.toHaveBeenCalled();
	});

	it("rejects with the caller's abort reason, not a generic socket error", async () => {
		const controller = new AbortController();
		net.request.mockImplementation(() => {
			const request = Object.assign(new EventEmitter(), {
				end() {
					controller.abort(new DOMException("slow", "TimeoutError"));
					request.emit("error", new Error("socket hang up"));
				},
			});
			return request;
		});
		await expect(
			pinnedFetch("https://addon.example/x", { signal: controller.signal }),
		).rejects.toMatchObject({ name: "TimeoutError" });
	});

	it("passes a socket error through when nothing aborted", async () => {
		net.request.mockImplementation(() => {
			const request = Object.assign(new EventEmitter(), {
				end() {
					request.emit("error", new Error("ECONNRESET"));
				},
			});
			return request;
		});
		await expect(pinnedFetch("https://addon.example/x")).rejects.toThrow(
			/ECONNRESET/,
		);
	});
});

describe("safeFetch DNS deadline", () => {
	it("gives up on a lookup that never answers once the signal fires", async () => {
		dns.lookup.mockReturnValueOnce(new Promise(() => {}) as never);
		await expect(
			safeFetch("https://hang.example/x", okFetch(), {
				signal: AbortSignal.timeout(20),
			}),
		).rejects.toMatchObject({ name: "TimeoutError" });
	});

	it("refuses at once when the signal is already aborted", async () => {
		dns.lookup.mockReturnValueOnce(new Promise(() => {}) as never);
		await expect(
			safeFetch("https://hang.example/x", okFetch(), {
				signal: AbortSignal.abort(new Error("gone")),
			}),
		).rejects.toThrow(/gone/);
	});
});
