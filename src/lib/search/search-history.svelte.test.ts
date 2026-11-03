import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

/** `localStorage`'s shape: items are own properties, so `Object.keys` lists them. */
class FakeStorage {
	[key: string]: unknown;

	getItem(key: string): string | null {
		return Object.hasOwn(this, key) ? String(this[key]) : null;
	}

	setItem(key: string, value: string): void {
		this[key] = String(value);
	}

	removeItem(key: string): void {
		Reflect.deleteProperty(this, key);
	}
}

async function freshHistory() {
	vi.resetModules();
	return (await import("./search-history.svelte.ts")).searchHistory;
}

beforeEach(() => {
	vi.stubGlobal("localStorage", new FakeStorage());
});

describe("searchHistory", () => {
	it("keeps the account's other profiles' searches when switching profile", async () => {
		const history = await freshHistory();
		history.attach("user-a:1");
		history.record("dune");
		history.attach("user-a:2");
		expect(history.entries).toEqual([]);

		history.attach("user-a:1");
		expect(history.entries).toEqual(["dune"]);
	});

	it("drops another account's searches on attach", async () => {
		const history = await freshHistory();
		history.attach("user-a:1");
		history.record("dune");
		history.attach("user-b:1");

		history.attach("user-a:1");
		expect(history.entries).toEqual([]);
	});
});
