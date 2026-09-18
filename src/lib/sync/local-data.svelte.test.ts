import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	syncForget: vi.fn(async () => undefined),
	historyForget: vi.fn(),
	downloadsForget: vi.fn(),
}));
vi.mock("./store.svelte.ts", () => ({ sync: { forget: mocks.syncForget } }));
vi.mock("#lib/search/search-history.svelte.js", () => ({
	searchHistory: { forget: mocks.historyForget },
}));

vi.mock("#lib/downloads/manager.svelte.js", () => ({
	downloads: { forget: mocks.downloadsForget },
}));

import { forgetLocalData } from "./local-data.ts";

describe("forgetLocalData", () => {
	// Signing out clears cookies only; this is what takes the device's copy.
	it("wipes the sync mirror and recent searches, and stops downloads", async () => {
		await forgetLocalData();
		expect(mocks.syncForget).toHaveBeenCalledTimes(1);
		expect(mocks.historyForget).toHaveBeenCalledTimes(1);
		expect(mocks.downloadsForget).toHaveBeenCalledTimes(1);
	});
});
