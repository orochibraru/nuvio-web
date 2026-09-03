import { beforeEach, describe, expect, it, vi } from "vitest";

// --- harness -----------------------------------------------------------------
// The remote-fn wrappers are passthroughs; `requireProfile` / `getAddonClient`
// hand back whatever the current test wired up.

interface Client {
	getMeta: ReturnType<typeof vi.fn>;
	getStreams: ReturnType<typeof vi.fn>;
	getSubtitles: ReturnType<typeof vi.fn>;
}

const state = {
	profileId: 1 as number,
	watchProgressPull: vi.fn(),
	client: {} as Client,
};

vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => ({ locals: {}, fetch }),
}));

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: { watchProgress: { pull: state.watchProgressPull } },
		profileId: state.profileId,
	}),
}));

vi.mock("#lib/addons/server.js", () => ({
	getAddonClient: async () => ({ client: state.client }),
}));

import { getSubtitles, resolveStreams, titleProgress } from "./watch.remote.ts";

function progressRow(over: Record<string, unknown> = {}) {
	return {
		id: "row-1",
		content_id: "tt1",
		content_type: "movie",
		video_id: "tt1",
		season: null,
		episode: null,
		position: 300_000,
		duration: 600_000,
		last_watched: 1000,
		...over,
	};
}

beforeEach(() => {
	state.profileId = 1;
	state.watchProgressPull = vi.fn(async () => []);
	state.client = {
		getMeta: vi.fn(async () => null),
		getStreams: vi.fn(async () => ({ streams: [], errors: [] })),
		getSubtitles: vi.fn(async () => ({ subtitles: [] })),
	};
});

describe("resolveStreams", () => {
	it("shapes addon streams, nulling non-http urls and reading behaviorHints", async () => {
		state.client.getStreams = vi.fn(async () => ({
			streams: [
				{
					url: "https://cdn/a.mp4",
					externalUrl: "magnet:?xt=urn:btih:x",
					name: "A",
					title: "A 1080p",
					description: null,
					addonName: "Torrentio",
					infoHash: null,
					behaviorHints: {
						notWebReady: false,
						videoSize: 1234,
						filename: "A.1080p.mkv",
					},
				},
				{
					url: "magnet:?xt=urn:btih:y",
					addonName: "Torrentio",
					infoHash: "y",
					behaviorHints: { notWebReady: true },
				},
			],
			errors: [{ addonName: "Broken", message: "timeout" }],
		}));

		const out = await resolveStreams({ type: "movie", id: "tt1" });

		expect(out.streams[0]).toMatchObject({
			index: 0,
			url: "https://cdn/a.mp4",
			externalUrl: null, // magnet is not an http url
			notWebReady: false,
			fileSize: 1234,
			filename: "A.1080p.mkv",
		});
		expect(out.streams[1]).toMatchObject({
			index: 1,
			url: null, // magnet
			notWebReady: true,
			infoHash: "y",
			fileSize: null,
		});
		expect(out.errors).toEqual([{ addonName: "Broken", message: "timeout" }]);
	});
});

describe("getSubtitles", () => {
	it("dedupes by url and flags SDH tracks", async () => {
		state.client.getSubtitles = vi.fn(async () => ({
			subtitles: [
				{
					url: "http://s/en.vtt",
					lang: "en",
					id: "1",
					addonId: "a",
					addonName: "OS",
				},
				{
					url: "http://s/en.vtt",
					lang: "en",
					id: "2",
					addonId: "a",
					addonName: "OS",
				},
				{
					url: "http://s/en-sdh.vtt",
					lang: "en",
					id: "SDH",
					addonId: "a",
					addonName: "OS",
				},
				{ url: "", lang: "fr", id: "3", addonId: "a", addonName: "OS" },
			],
		}));

		const out = await getSubtitles({ type: "movie", id: "tt1" });
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({ id: "a:1", lang: "en", sdh: false });
		expect(out[1]).toMatchObject({ sdh: true });
	});
});

describe("titleProgress", () => {
	it("keys fraction + completed per video for the matching title only", async () => {
		state.watchProgressPull = vi.fn(async () => [
			progressRow({ video_id: "tt1", position: 300_000, duration: 600_000 }),
			progressRow({
				video_id: "tt1:1:2",
				position: 590_000,
				duration: 600_000,
			}),
			progressRow({ content_id: "other", video_id: "x", duration: 0 }),
		]);

		const out = await titleProgress({ contentId: "tt1" });
		expect(out).toEqual({
			tt1: { fraction: 0.5, completed: false },
			"tt1:1:2": { fraction: expect.closeTo(0.983, 2), completed: true },
		});
	});
});
