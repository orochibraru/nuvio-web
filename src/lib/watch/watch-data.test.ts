import { describe, expect, it, vi } from "vitest";
import type { NuvioClient } from "#lib/nuvio/index.js";
import { pullResumeRows } from "./watch-data.ts";

function nuvioWith(rows: unknown[] | Promise<never>): NuvioClient {
	return {
		watchProgress: {
			pull: vi
				.fn()
				.mockImplementation(() =>
					rows instanceof Promise ? rows : Promise.resolve(rows),
				),
		},
	} as unknown as NuvioClient;
}

const row = (over: Record<string, unknown>) => ({
	content_id: "tt1",
	content_type: "movie",
	video_id: "tt1",
	season: null,
	episode: null,
	position: 30_000,
	duration: 120_000,
	last_watched: 100,
	...over,
});

describe("pullResumeRows", () => {
	it("keeps one in-progress row per title, newest first, capped at 16", async () => {
		const nuvio = nuvioWith([
			row({ content_id: "a", last_watched: 1 }),
			row({ content_id: "a", last_watched: 9, position: 60_000 }), // newer, same title
			row({ content_id: "b", last_watched: 5 }),
			row({ content_id: "c", duration: 30_000 }), // < 60s → dropped
			row({ content_id: "d", position: 119_000 }), // >= 90% → dropped
		]);

		const out = await pullResumeRows(nuvio, 1);
		expect(out.map((r) => r.id)).toEqual(["a", "b"]);
		expect(out[0]).toMatchObject({
			id: "a",
			videoId: "tt1",
			progress: 0.5,
			remainingMs: 60_000,
		});
	});

	it("degrades to an empty list on failure", async () => {
		const nuvio = nuvioWith(Promise.reject(new Error("down")) as never);
		expect(await pullResumeRows(nuvio, 1)).toEqual([]);
	});
});
