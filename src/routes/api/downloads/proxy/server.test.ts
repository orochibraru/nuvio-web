import { describe, expect, it, vi } from "vitest";
import { GET } from "./+server.ts";

// The route connects through `pinnedFetch` (never `event.fetch`); swap its
// transport so no test touches the network. `safeFetch`'s own checks stay real.
const transport = vi.hoisted(() => ({ current: null as typeof fetch | null }));
vi.mock("#lib/server/safe-fetch.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("#lib/server/safe-fetch.js")>();
	return {
		...actual,
		pinnedFetch: ((...args: Parameters<typeof fetch>) =>
			(transport.current as typeof fetch)(...args)) as typeof fetch,
	};
});

const logger = { warn: vi.fn() };

const SOURCE = "http://93.184.216.34/film.mp4";

function call(
	target: string | null,
	options: {
		session?: boolean;
		range?: string;
		destination?: string;
		fetch?: typeof fetch;
	} = {},
) {
	const url = new URL("http://localhost/api/downloads/proxy");
	if (target !== null) {
		url.searchParams.set("url", target);
	}
	const headers = new Headers();
	if (options.range) {
		headers.set("range", options.range);
	}
	if (options.destination) {
		headers.set("sec-fetch-dest", options.destination);
	}
	transport.current = options.fetch ?? (vi.fn() as unknown as typeof fetch);
	return Promise.resolve(
		GET({
			url,
			request: new Request(url, { headers }),
			locals: {
				session: options.session === false ? null : { user: {} },
				services: { get: () => logger },
			},
		} as unknown as Parameters<typeof GET>[0]),
	);
}

async function status(promise: unknown): Promise<number> {
	try {
		await promise;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
	return 200;
}

describe("GET /api/downloads/proxy", () => {
	it("requires a session", async () => {
		expect(await status(call(SOURCE, { session: false }))).toBe(401);
	});

	it("requires an http(s) source", async () => {
		expect(await status(call(null))).toBe(400);
		expect(await status(call("file:///etc/passwd"))).toBe(400);
	});

	it("refuses private addresses", async () => {
		const upstream = vi.fn();
		expect(
			await status(
				call("http://127.0.0.1/x", {
					fetch: upstream as unknown as typeof fetch,
				}),
			),
		).toBe(502);
		expect(upstream).not.toHaveBeenCalled();
	});

	it("streams the source through with its range and headers", async () => {
		const upstream = vi.fn(
			async () =>
				new Response("abc", {
					status: 206,
					headers: {
						"content-type": "video/mp4",
						"content-range": "bytes 0-2/10",
						"set-cookie": "secret=1",
					},
				}),
		);
		const response = await call(SOURCE, {
			range: "bytes=0-2",
			fetch: upstream as unknown as typeof fetch,
		});
		const init = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(new Headers(init[1].headers).get("range")).toBe("bytes=0-2");
		expect(response.status).toBe(206);
		expect(response.headers.get("content-range")).toBe("bytes 0-2/10");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-security-policy")).toBe(
			"sandbox; default-src 'none'",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-disposition")).toBe("attachment");
		expect(await response.text()).toBe("abc");
	});

	it("refuses to be opened as a page", async () => {
		for (const destination of ["document", "iframe", "embed", "object"]) {
			const upstream = vi.fn();
			expect(
				await status(
					call(SOURCE, {
						destination,
						fetch: upstream as unknown as typeof fetch,
					}),
				),
			).toBe(403);
			expect(upstream).not.toHaveBeenCalled();
		}
	});

	it("serves the download worker's fetch", async () => {
		const upstream = vi.fn(async () => new Response("x"));
		const response = await call(SOURCE, {
			destination: "empty",
			fetch: upstream as unknown as typeof fetch,
		});
		expect(response.status).toBe(200);
	});

	it("passes media types through and downgrades anything else", async () => {
		const typeFor = async (contentType: string) => {
			const upstream = vi.fn(
				async () =>
					new Response("x", { headers: { "content-type": contentType } }),
			);
			const response = await call(SOURCE, {
				fetch: upstream as unknown as typeof fetch,
			});
			return response.headers.get("content-type");
		};
		expect(await typeFor("Audio/MP4; codecs=mp4a")).toBe("audio/mp4");
		expect(await typeFor("application/vnd.apple.mpegurl")).toBe(
			"application/vnd.apple.mpegurl",
		);
		expect(await typeFor("text/vtt; charset=utf-8")).toBe("text/vtt");
		expect(await typeFor("text/html")).toBe("application/octet-stream");
		expect(await typeFor("image/svg+xml")).toBe("application/octet-stream");
		expect(await typeFor("video/mp4, text/html")).toBe(
			"application/octet-stream",
		);
	});

	it("drops a malformed range", async () => {
		const upstream = vi.fn(async () => new Response("x"));
		await call(SOURCE, {
			range: "bytes=0-1, 5-6",
			fetch: upstream as unknown as typeof fetch,
		});
		const init = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(new Headers(init[1].headers).has("range")).toBe(false);
	});

	it("keeps the upstream error out of the response", async () => {
		const upstream = vi.fn(() =>
			Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:8080")),
		);
		let message = "";
		try {
			await call(SOURCE, { fetch: upstream as unknown as typeof fetch });
		} catch (thrown) {
			message = (thrown as { body: { message: string } }).body.message;
		}
		expect(message).toBe("The source refused.");
		expect(logger.warn).toHaveBeenCalled();
	});

	it("reports a failure without an Error as a plain refusal", async () => {
		const upstream = vi.fn(() => Promise.reject("nope"));
		expect(
			await status(
				call(SOURCE, { fetch: upstream as unknown as typeof fetch }),
			),
		).toBe(502);
	});
});
