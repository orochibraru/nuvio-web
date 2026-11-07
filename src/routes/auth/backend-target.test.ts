import { describe, expect, it } from "vitest";
import { targetOf } from "./backend-target.ts";

const officialUrl = "https://api.nuvio.tv";
const server = {
	kind: "server",
	url: "https://nuvio.example/api/nuvio",
} as const;

describe("targetOf", () => {
	it("falls back to the instance default for an empty or unparsable URL", () => {
		expect(targetOf("", server, { officialUrl, customAllowed: true })).toEqual(
			server,
		);
		expect(
			targetOf("nope", server, { officialUrl, customAllowed: true }),
		).toEqual(server);
		expect(
			targetOf(undefined, server, { officialUrl, customAllowed: true }),
		).toEqual(server);
	});

	it("names official Nuvio for the official API, custom backends allowed or not", () => {
		expect(
			targetOf("https://api.nuvio.tv/", server, {
				officialUrl,
				customAllowed: false,
			}),
		).toEqual({ kind: "nuvio", url: officialUrl });
	});

	it("names a custom backend only when the admin allows custom backends", () => {
		const url = "https://nuvio.example:8443";
		expect(targetOf(url, server, { officialUrl, customAllowed: true })).toEqual(
			{
				kind: "other",
				url,
			},
		);
		expect(
			targetOf(url, server, { officialUrl, customAllowed: false }),
		).toEqual(server);
	});
});
