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

import {
	continueWatching,
	getSubtitles,
	resolveStreams,
	titleProgress,
} from "./watch.remote.js";

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

describe("continueWatching", () => {
	it("drops rows shorter than a minute and finished movies", async () => {
		state.watchProgressPull = vi.fn(async () => [
			progressRow({ content_id: "short", duration: 30_000 }),
			progressRow({ content_id: "done", position: 595_000, duration: 600_000 }),
		]);
		expect(await continueWatching()).toEqual([]);
	});

	it("keeps a mid-movie row with progress + remaining time", async () => {
		state.watchProgressPull = vi.fn(async () => [progressRow()]);
		state.client.getMeta = vi.fn(async () => ({
			meta: { name: "Movie One", poster: "p.jpg" },
		}));

		const [item] = await continueWatching();
		expect(item).toMatchObject({
			id: "tt1",
			name: "Movie One",
			videoId: "tt1",
			progress: 0.5,
			remainingMs: 300_000,
		});
	});

	it("rolls a finished series episode forward to the next one", async () => {
		state.watchProgressPull = vi.fn(async () => [
			progressRow({
				content_id: "s1",
				content_type: "series",
				video_id: "s1:1:1",
				season: 1,
				episode: 1,
				position: 590_000,
				duration: 600_000,
			}),
		]);
		state.client.getMeta = vi.fn(async () => ({
			meta: {
				name: "Show",
				videos: [
					{ season: 1, episode: 1 },
					{ season: 1, episode: 2 },
				],
			},
		}));

		const [item] = await continueWatching();
		expect(item).toMatchObject({
			videoId: "s1:1:2",
			season: 1,
			episode: 2,
			progress: 0,
		});
	});

	it("keeps only the most-recent row per title", async () => {
		state.watchProgressPull = vi.fn(async () => [
			progressRow({ id: "old", last_watched: 10, position: 60_000 }),
			progressRow({ id: "new", last_watched: 20, position: 120_000 }),
		]);
		state.client.getMeta = vi.fn(async () => ({ meta: { name: "M" } }));

		const items = await continueWatching();
		expect(items).toHaveLength(1);
		expect(items[0].progress).toBeCloseTo(0.2);
	});

	it("survives a watch-progress pull failure", async () => {
		state.watchProgressPull = vi.fn(async () => {
			throw new Error("500");
		});
		expect(await continueWatching()).toEqual([]);
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
