import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

const store = new Map<string, string>();
Object.assign(globalThis, {
	sessionStorage: {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
		removeItem: (key: string) => store.delete(key),
	},
});

const { playbackHandoff } = await import("./playback.svelte.ts");

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
