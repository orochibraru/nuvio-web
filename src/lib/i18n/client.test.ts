import { describe, expect, it } from "vitest";
import { getLocale } from "#lib/i18n/paraglide/runtime.js";
import { defineHtmlLangStrategy } from "./client.ts";

describe("defineHtmlLangStrategy", () => {
	it("resolves to the locale the server rendered, else falls through", () => {
		const root = { lang: "fr" };
		defineHtmlLangStrategy(root);
		expect(getLocale()).toBe("fr");
		// Not one of ours (or a region tag we never render): next strategy.
		root.lang = "pt-BR";
		expect(getLocale()).toBe("en");
		root.lang = "de";
		expect(getLocale()).toBe("de");
	});
});
