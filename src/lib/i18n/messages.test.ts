import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import settings from "../../../project.inlang/settings.json" with {
	type: "json",
};

interface Variant {
	declarations?: string[];
	match?: Record<string, string>;
}
type Message = string | Variant[];

function load(locale: string): Record<string, Message> {
	const url = new URL(`../../../messages/${locale}.json`, import.meta.url);
	const { $schema: _schema, ...messages } = JSON.parse(
		readFileSync(url, "utf8"),
	) as Record<string, Message>;
	return messages;
}

/** Every `{param}` a message reads, plus the inputs a variant declares. */
function params(message: Message): string[] {
	const texts =
		typeof message === "string"
			? [message]
			: message.flatMap((v) => Object.values(v.match ?? {}));
	const found = new Set(
		texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((x) => x[1])),
	);
	if (typeof message !== "string") {
		for (const d of message.flatMap((v) => v.declarations ?? [])) {
			if (d.startsWith("input ")) {
				found.add(d.slice("input ".length));
			}
		}
	}
	return [...found].sort();
}

const base = load(settings.baseLocale);

describe("message catalogs", () => {
	it("has a non-empty base catalog", () => {
		expect(Object.keys(base).length).toBeGreaterThan(0);
	});

	for (const locale of settings.locales) {
		it(`${locale} has every key, with the same params`, () => {
			const catalog = load(locale);
			expect(Object.keys(catalog).sort()).toEqual(Object.keys(base).sort());
			for (const [key, message] of Object.entries(base)) {
				expect(params(catalog[key]), key).toEqual(params(message));
			}
		});
	}
});
