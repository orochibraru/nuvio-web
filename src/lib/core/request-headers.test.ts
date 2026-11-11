import { describe, expect, it } from "vitest";
import { safeRequestHeaders } from "./request-headers.ts";

describe("safeRequestHeaders", () => {
	it("keeps well-formed headers, names lowercased", () => {
		expect(
			safeRequestHeaders({
				"User-Agent": "Mozilla/5.0 (X11; Linux)",
				Referer: "https://host.example/watch?v=1,2",
				Authorization: "Bearer abc",
			}),
		).toEqual({
			"user-agent": "Mozilla/5.0 (X11; Linux)",
			referer: "https://host.example/watch?v=1,2",
			authorization: "Bearer abc",
		});
	});

	it("refuses what isn't an object of strings", () => {
		expect(safeRequestHeaders(undefined)).toBeUndefined();
		expect(safeRequestHeaders("referer: x")).toBeUndefined();
		expect(safeRequestHeaders(["referer", "x"])).toBeUndefined();
		expect(safeRequestHeaders({ referer: 1 })).toBeUndefined();
		expect(safeRequestHeaders({})).toBeUndefined();
	});

	it("drops a name that isn't a token and a value that could split the request", () => {
		expect(
			safeRequestHeaders({
				"bad name": "x",
				"x-colon:": "x",
				"x-injected": "a\r\nhost: evil.example",
				"x-nul": "a\u0000b",
				"x-unicode": "café",
				origin: "https://host.example",
			}),
		).toEqual({ origin: "https://host.example" });
	});

	it("drops the headers the client owns", () => {
		expect(
			safeRequestHeaders({
				Host: "internal.example",
				"Content-Length": "0",
				"Transfer-Encoding": "chunked",
				Connection: "close",
				Range: "bytes=0-",
				"Proxy-Authorization": "x",
				"Proxy-Anything": "x",
				Upgrade: "h2c",
				cookie: "session=1",
			}),
		).toEqual({ cookie: "session=1" });
	});

	it("keeps the first of a name given twice in different cases", () => {
		expect(safeRequestHeaders({ Referer: "a", referer: "b" })).toEqual({
			referer: "a",
		});
	});

	it("caps the count and the size", () => {
		const many = Object.fromEntries(
			Array.from({ length: 30 }, (_, index) => [`x-${index}`, "v"]),
		);
		expect(Object.keys(safeRequestHeaders(many) ?? {})).toHaveLength(20);
		expect(safeRequestHeaders({ "x-long": "v".repeat(5000) })).toBeUndefined();
		const heavy = Object.fromEntries(
			Array.from({ length: 4 }, (_, index) => [`x-${index}`, "v".repeat(4000)]),
		);
		expect(Object.keys(safeRequestHeaders(heavy) ?? {})).toHaveLength(2);
	});
});
