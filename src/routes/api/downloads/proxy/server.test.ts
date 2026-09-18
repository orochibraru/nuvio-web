import { describe, expect, it, vi } from "vitest";
import { GET } from "./+server.ts";

const SOURCE = "http://93.184.216.34/film.mp4";

function call(
	target: string | null,
	options: { session?: boolean; range?: string; fetch?: typeof fetch } = {},
) {
	const url = new URL("http://localhost/api/downloads/proxy");
	if (target !== null) {
		url.searchParams.set("url", target);
	}
	const headers = new Headers();
	if (options.range) {
		headers.set("range", options.range);
	}
	return Promise.resolve(
		GET({
			url,
			request: new Request(url, { headers }),
			locals: { session: options.session === false ? null : { user: {} } },
			fetch: options.fetch ?? vi.fn(),
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
		expect(await response.text()).toBe("abc");
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

	it("reports a failure without an Error as a plain refusal", async () => {
		const upstream = vi.fn(() => Promise.reject("nope"));
		expect(
			await status(
				call(SOURCE, { fetch: upstream as unknown as typeof fetch }),
			),
		).toBe(502);
	});
});
