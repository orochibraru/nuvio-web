import { describe, expect, it, vi } from "vitest";
import { createRangeFetch } from "./range-fetch.ts";

const LINK = "https://debrid.example/link";
const CDN = "https://cdn.example/file?token=t";
const RANGE = { headers: { Range: "bytes=100-" } };

function reply(status: number, url: string, redirected = false): Response {
	const response = new Response("bytes", { status });
	return Object.defineProperties(response, {
		url: { value: url },
		redirected: { value: redirected },
	});
}

describe("createRangeFetch", () => {
	it("asks the final URL again when a redirect lost the range, and keeps using it", async () => {
		const base = vi.fn(async (input: RequestInfo | URL) =>
			String(input) === LINK ? reply(200, CDN, true) : reply(206, CDN),
		);
		const rangeFetch = createRangeFetch(base);

		expect((await rangeFetch(LINK, RANGE)).status).toBe(206);
		expect(base.mock.calls.map(([input]) => String(input))).toEqual([
			LINK,
			CDN,
		]);

		base.mockClear();
		expect((await rangeFetch(LINK, RANGE)).status).toBe(206);
		expect(base).toHaveBeenCalledOnce();
		expect(base).toHaveBeenCalledWith(CDN, RANGE);
	});

	it("goes back to the link once the final URL stops answering", async () => {
		const cdn = { status: 206 };
		const base = vi.fn(async (input: RequestInfo | URL) =>
			String(input) === LINK ? reply(200, CDN, true) : reply(cdn.status, CDN),
		);
		const rangeFetch = createRangeFetch(base);
		await rangeFetch(LINK, RANGE);

		cdn.status = 403;
		base.mockClear();
		expect((await rangeFetch(LINK, RANGE)).status).toBe(403);
		expect(base.mock.calls.map(([input]) => String(input))).toEqual([
			CDN,
			LINK,
			CDN,
		]);
	});

	it("goes back to the link once the final URL stops honouring ranges", async () => {
		const cdn = { status: 206 };
		const base = vi.fn(async (input: RequestInfo | URL) =>
			String(input) === LINK ? reply(200, CDN, true) : reply(cdn.status, CDN),
		);
		const rangeFetch = createRangeFetch(base);
		await rangeFetch(LINK, RANGE);

		cdn.status = 200;
		base.mockClear();
		await rangeFetch(LINK, RANGE);
		expect(base.mock.calls.map(([input]) => String(input))).toEqual([
			CDN,
			LINK,
			CDN,
		]);
	});

	it("leaves a request without a range, a 206 and an unredirected 200 alone", async () => {
		const base = vi.fn(async () => reply(200, LINK));
		const rangeFetch = createRangeFetch(base);
		expect((await rangeFetch(LINK)).status).toBe(200);
		expect((await rangeFetch(LINK, RANGE)).status).toBe(200);
		base.mockResolvedValueOnce(reply(206, CDN, true));
		expect((await rangeFetch(LINK, RANGE)).status).toBe(206);
		expect(base).toHaveBeenCalledTimes(3);
	});
});
