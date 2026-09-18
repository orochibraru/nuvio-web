import { describe, expect, it } from "vitest";
import type { Collection } from "#lib/nuvio/index.js";
import {
	addFolder,
	effectiveViewMode,
	moveFolder,
	removeFolder,
	setViewMode,
	updateFolder,
} from "./edit.ts";

const collections = (): Collection[] => [
	{
		id: "c1",
		title: "Mine",
		folders: [
			{ id: "a", title: "A" },
			{ id: "b", title: "B" },
			{ id: "c", title: "C" },
		],
	},
	{ id: "c2", title: "Other", folders: [{ id: "z", title: "Z" }] },
];

const order = (list: Collection[], id = "c1") =>
	list.find((entry) => entry.id === id)?.folders.map((folder) => folder.id);

describe("moveFolder", () => {
	it("moves a folder by a number of places", () => {
		expect(order(moveFolder(collections(), "c1", "a", 1))).toEqual([
			"b",
			"a",
			"c",
		]);
		expect(order(moveFolder(collections(), "c1", "c", -2))).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	it("clamps at either end and ignores an unknown folder", () => {
		expect(order(moveFolder(collections(), "c1", "a", -1))).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(order(moveFolder(collections(), "c1", "c", 5))).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(order(moveFolder(collections(), "c1", "nope", 1))).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	// The push replaces the whole blob: the other collections must survive.
	it("leaves the other collections untouched", () => {
		const next = moveFolder(collections(), "c1", "a", 1);
		expect(next[1]).toEqual(collections()[1]);
	});
});

describe("updateFolder", () => {
	it("applies tile fields", () => {
		const next = updateFolder(collections(), "c1", "b", {
			tileShape: "LANDSCAPE",
			hideTitle: true,
			coverEmoji: "🚀",
			coverImageUrl: " https://img.example/x.jpg ",
		});
		expect(next[0].folders[1]).toEqual({
			id: "b",
			title: "B",
			tileShape: "LANDSCAPE",
			hideTitle: true,
			coverEmoji: "🚀",
			coverImageUrl: "https://img.example/x.jpg",
		});
	});

	// Every client reads this blob: an empty URL would be a broken image there.
	it("drops blank cover fields instead of storing them", () => {
		const withCover = updateFolder(collections(), "c1", "a", {
			coverImageUrl: "https://img.example/x.jpg",
			coverEmoji: "🎬",
		});
		const cleared = updateFolder(withCover, "c1", "a", {
			coverImageUrl: "   ",
			coverEmoji: "",
		});
		expect(cleared[0].folders[0]).toEqual({ id: "a", title: "A" });
	});

	it("keeps the old title when the new one is blank", () => {
		expect(
			updateFolder(collections(), "c1", "a", { title: "  " })[0].folders[0]
				.title,
		).toBe("A");
	});
});

describe("addFolder and removeFolder", () => {
	it("appends a normalised folder with the given id", () => {
		const next = addFolder(
			collections(),
			"c1",
			{ title: " New ", coverImageUrl: "", catalogSources: [] },
			"d",
		);
		expect(next[0].folders.at(-1)).toEqual({
			id: "d",
			title: "New",
			catalogSources: [],
		});
	});

	it("generates an id when none is given", () => {
		const next = addFolder(collections(), "c1", { title: "New" });
		expect(next[0].folders.at(-1)?.id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("removes a folder", () => {
		expect(order(removeFolder(collections(), "c1", "b"))).toEqual(["a", "c"]);
	});
});

describe("view modes", () => {
	it("sets the stored mode", () => {
		expect(setViewMode(collections(), "c1", "FOLLOW_LAYOUT")[0].viewMode).toBe(
			"FOLLOW_LAYOUT",
		);
	});

	it("renders FOLLOW_LAYOUT and an unset mode as this client's tabs", () => {
		expect(effectiveViewMode("FOLLOW_LAYOUT")).toBe("TABBED_GRID");
		expect(effectiveViewMode(undefined)).toBe("TABBED_GRID");
		expect(effectiveViewMode("ROWS")).toBe("ROWS");
	});
});
