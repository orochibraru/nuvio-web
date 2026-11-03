import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

const store = new Map<string, string>();
Object.assign(globalThis, {
	sessionStorage: {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
		removeItem: (key: string) => store.delete(key),
	},
	localStorage: {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
	},
});

const { playbackHandoff, recallPick, rememberPick, streamKey } = await import(
	"./playback.svelte.ts"
);

describe("playbackHandoff.take", () => {
	it("recovers a pick from sessionStorage without writing its own state", () => {
		// The path after a player reload: memory is empty, storage has the pick.
		// The player calls `take()` inside a `$derived`, where writing the
		// `$state` field throws `state_unsafe_mutation` : so it must stay a read.
		store.set(
			"nuvio:selected-stream",
			JSON.stringify({ videoId: "tt1", url: "https://x/a.mp4" }),
		);

		expect(playbackHandoff.take("tt1")?.url).toBe("https://x/a.mp4");
		expect(playbackHandoff.take("tt2")).toBeNull();

		// Had `take()` cached the pick in memory, it would survive this.
		store.clear();
		expect(playbackHandoff.take("tt1")).toBeNull();
	});
});

describe("picked streams", () => {
	const stream = {
		videoId: "tt1",
		url: "https://debrid.example/file.mkv?token=secret",
		externalUrl: null,
		notWebReady: false,
		label: "File",
		addonName: "Addon",
		infoHash: null,
		audioRisky: false,
		videoRisky: false,
		videoCodec: null,
	};

	it("names a stream with a short key that carries none of its URL", () => {
		const key = streamKey(stream);
		expect(key).toMatch(/^[0-9a-z]{1,7}$/);
		expect(streamKey(stream)).toBe(key);
		expect(streamKey({ ...stream, url: `${stream.url}2` })).not.toBe(key);
	});

	it("recalls a remembered pick by key, for its own video and while fresh", () => {
		store.clear();
		const key = rememberPick(stream);
		expect(recallPick("tt1", key, 3)?.url).toBe(stream.url);
		expect(recallPick("tt2", key, 3)).toBeNull();
		expect(recallPick("tt1", "nope", 3)).toBeNull();
		expect(recallPick("tt1", null, 3)).toBeNull();
		expect(recallPick("tt1", key, -1)).toBeNull();
	});
});

describe("playbackHandoff.select", () => {
	it("returns the key the player URL names the pick by", () => {
		store.clear();
		const key = playbackHandoff.select(
			"tt1:1:2",
			{
				index: 0,
				url: "https://cdn/e2.mp4",
				externalUrl: null,
				notWebReady: false,
				name: null,
				title: "E2 1080p",
				description: null,
				addonName: "Torrentio",
				fileSize: null,
				infoHash: null,
				filename: null,
				bingeGroup: "torrentio|1080p",
			},
			"E2",
		);
		expect(recallPick("tt1:1:2", key, 3)).toMatchObject({
			url: "https://cdn/e2.mp4",
			bingeGroup: "torrentio|1080p",
		});
	});
});
