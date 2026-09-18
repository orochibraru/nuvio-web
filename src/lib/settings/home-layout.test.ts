import { describe, expect, it } from "vitest";
import {
	catalogKey,
	catalogTitles,
	EMPTY_HOME_LAYOUT,
	homeCatalogs,
	isCustomized,
	moveCatalog,
	orderCatalogs,
	parseHomeLayout,
	setHidden,
} from "./home-layout.ts";

const cat = (id: string, addonId = "a") => ({ addonId, type: "movie", id });
const keys = (list: Array<{ addonId: string; type: string; id: string }>) =>
	list.map(catalogKey);

const ALL = [cat("one"), cat("two"), cat("three")];

describe("parseHomeLayout", () => {
	it("reads the documented keys and falls back on anything else", () => {
		expect(
			parseHomeLayout({ rows: ["a|movie|one"], hidden_catalogs: [] }),
		).toEqual({
			rows: ["a|movie|one"],
			hidden_catalogs: [],
		});
		expect(parseHomeLayout({ rows: "nope" })).toEqual(EMPTY_HOME_LAYOUT);
		expect(parseHomeLayout(null)).toEqual(EMPTY_HOME_LAYOUT);
	});
});

describe("orderCatalogs", () => {
	it("puts arranged catalogs first, then the rest in addon order", () => {
		const layout = { rows: ["a|movie|three"], hidden_catalogs: [] };
		expect(keys(orderCatalogs(ALL, layout))).toEqual([
			"a|movie|three",
			"a|movie|one",
			"a|movie|two",
		]);
	});

	// An addon uninstalled since the layout was saved.
	it("ignores saved keys for catalogs that no longer exist", () => {
		const layout = {
			rows: ["gone|movie|x", "a|movie|two"],
			hidden_catalogs: [],
		};
		expect(keys(orderCatalogs(ALL, layout))[0]).toBe("a|movie|two");
	});
});

describe("homeCatalogs", () => {
	it("drops hidden catalogs", () => {
		const layout = { rows: [], hidden_catalogs: ["a|movie|two"] };
		expect(keys(homeCatalogs(ALL, layout))).toEqual([
			"a|movie|one",
			"a|movie|three",
		]);
	});

	// A new addon should reach Home without a trip to Settings.
	it("shows a catalog the layout has never seen", () => {
		const layout = { rows: ["a|movie|one"], hidden_catalogs: [] };
		expect(keys(homeCatalogs([...ALL, cat("new", "b")], layout))).toContain(
			"b|movie|new",
		);
	});

	it("caps the default home at eight and an arranged one at sixteen", () => {
		const many = Array.from({ length: 20 }, (_, index) => cat(`c${index}`));
		expect(homeCatalogs(many, EMPTY_HOME_LAYOUT)).toHaveLength(8);
		expect(
			homeCatalogs(many, { rows: ["a|movie|c5"], hidden_catalogs: [] }),
		).toHaveLength(16);
	});
});

describe("moveCatalog", () => {
	it("moves a catalog and pins the full order", () => {
		const next = moveCatalog(ALL, EMPTY_HOME_LAYOUT, "a|movie|three", -2);
		expect(next.rows).toEqual(["a|movie|three", "a|movie|one", "a|movie|two"]);
	});

	it("clamps at the ends and ignores an unknown key", () => {
		expect(moveCatalog(ALL, EMPTY_HOME_LAYOUT, "a|movie|one", -1).rows).toEqual(
			keys(ALL),
		);
		expect(moveCatalog(ALL, EMPTY_HOME_LAYOUT, "nope", 1)).toBe(
			EMPTY_HOME_LAYOUT,
		);
	});
});

describe("setHidden and isCustomized", () => {
	it("hides and shows without duplicating keys", () => {
		const hidden = setHidden(
			setHidden(EMPTY_HOME_LAYOUT, "k", true),
			"k",
			true,
		);
		expect(hidden.hidden_catalogs).toEqual(["k"]);
		expect(setHidden(hidden, "k", false).hidden_catalogs).toEqual([]);
	});

	it("knows the empty layout is the default", () => {
		expect(isCustomized(EMPTY_HOME_LAYOUT)).toBe(false);
		expect(isCustomized(setHidden(EMPTY_HOME_LAYOUT, "k", true))).toBe(true);
	});
});

describe("catalogTitles", () => {
	it("suffixes a name shared by two types, and leaves unique ones alone", () => {
		expect(
			catalogTitles([
				{ title: "Popular", type: "movie" },
				{ title: "Popular", type: "series" },
				{ title: "Anime", type: "series" },
			]),
		).toEqual(["Popular movies", "Popular series", "Anime"]);
	});
});
