import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "#lib/nuvio/index.js";

const mocks = vi.hoisted(() => ({
	saveCollections: vi.fn(),
	refreshAll: vi.fn(),
}));
vi.mock("./collections.remote.ts", () => ({
	saveCollections: mocks.saveCollections,
}));
vi.mock("$app/navigation", () => ({ refreshAll: mocks.refreshAll }));

import { CollectionsEditor } from "./collections-editor.svelte.ts";

const list = (...titles: string[]): Collection[] =>
	titles.map((title) => ({ id: title, title, folders: [] }));

let server: Collection[];

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
	server = list("A");
	mocks.saveCollections.mockReset().mockResolvedValue({ count: 1 });
	mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

describe("CollectionsEditor", () => {
	it("shows the list just saved while the server's read still lags", async () => {
		const editor = new CollectionsEditor(() => server);
		const saving = editor.save(list("A", "B"));
		await vi.runAllTimersAsync();
		await saving;
		// The pull came back with the pre-save list every time.
		expect(editor.current.map((c) => c.title)).toEqual(["A", "B"]);
	});

	// The bug this exists for: the push is a full replace, so an edit built
	// from the stale pull deletes the edit before it.
	it("builds the next edit on the pending list, not the stale pull", async () => {
		const editor = new CollectionsEditor(() => server);
		const first = editor.save([...editor.current, ...list("B")]);
		await vi.runAllTimersAsync();
		await first;
		const second = editor.save([...editor.current, ...list("C")]);
		await vi.runAllTimersAsync();
		await second;
		expect(
			mocks.saveCollections.mock.calls
				.at(-1)?.[0]
				.map((c: Collection) => c.title),
		).toEqual(["A", "B", "C"]);
	});

	it("hands back to the server once its copy matches, whatever the key order", async () => {
		const editor = new CollectionsEditor(() => server);
		mocks.refreshAll.mockImplementation(async () => {
			server = [
				{ folders: [], title: "A", id: "A" },
				{ folders: [], title: "B", id: "B" },
			];
		});
		await editor.save(list("A", "B"));
		expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
		expect(editor.current).toBe(server);
	});

	it("keeps re-pulling a bounded number of times, then lets the server win later", async () => {
		const editor = new CollectionsEditor(() => server);
		const saving = editor.save(list("A", "B"));
		await vi.runAllTimersAsync();
		await saving;
		expect(mocks.refreshAll).toHaveBeenCalledTimes(6);
		expect(editor.saving).toBe(false);

		vi.setSystemTime(Date.now() + 16_000);
		expect(editor.current).toBe(server);
	});

	it("keeps nothing from a save that failed", async () => {
		mocks.saveCollections.mockRejectedValueOnce(new Error("offline"));
		const editor = new CollectionsEditor(() => server);
		expect(await editor.save(list("A", "B"))).toBe(false);
		expect(editor.current).toBe(server);
		expect(editor.saving).toBe(false);
		expect(mocks.refreshAll).not.toHaveBeenCalled();
	});
});
