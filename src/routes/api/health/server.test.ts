import { describe, expect, it } from "vitest";
import { GET } from "./+server.ts";

describe("GET /api/health", () => {
	it("answers ok, uncached", async () => {
		const response = (await GET({} as Parameters<typeof GET>[0])) as Response;

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toMatchObject({ status: "ok" });
	});
});
