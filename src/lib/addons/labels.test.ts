import { describe, expect, it } from "vitest";
import { failureText, resourceLabel, typeLabel } from "./labels.ts";

describe("failureText", () => {
	it.each([
		["timeout", "Timed out"],
		["invalid", "Not a valid addon manifest"],
		["blocked", "Blocked address"],
		["unreachable", "Unreachable"],
		[503, "HTTP 503"],
	] as const)("words %s", (reason, text) => {
		expect(failureText(reason)).toBe(text);
	});
});

describe("typeLabel", () => {
	it("words the types it knows and passes others through", () => {
		expect(typeLabel("movie")).toBe("Movies");
		expect(typeLabel("series")).toBe("Series");
		expect(typeLabel("anime")).toBe("Anime");
		expect(typeLabel("tv")).toBe("TV");
		expect(typeLabel("channel")).toBe("Channels");
		expect(typeLabel("podcast")).toBe("podcast");
		expect(typeLabel("toString")).toBe("toString");
	});
});

describe("resourceLabel", () => {
	it("words the resources it knows and passes others through", () => {
		expect(resourceLabel("catalog")).toBe("Catalogs");
		expect(resourceLabel("meta")).toBe("Metadata");
		expect(resourceLabel("stream")).toBe("Streams");
		expect(resourceLabel("subtitles")).toBe("Subtitles");
		expect(resourceLabel("addon_catalog")).toBe("addon_catalog");
	});
});
