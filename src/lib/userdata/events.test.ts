import { describe, expect, it, vi } from "vitest";
import { UserDataEvents } from "./events.ts";

const change = {
	changes: { library: { "movie:tt1": null } },
	cursors: { library: 1, watchProgress: 1, watchHistory: 1 },
	since: { library: 0, watchProgress: 0, watchHistory: 0 },
};

describe("UserDataEvents", () => {
	it("delivers to that user and profile only, until unsubscribed", () => {
		const events = new UserDataEvents();
		const mine = vi.fn();
		const otherProfile = vi.fn();
		const unsubscribe = events.subscribe("u", 1, mine);
		events.subscribe("u", 2, otherProfile);

		events.emit("u", 1, change);
		expect(mine).toHaveBeenCalledWith(change);
		expect(otherProfile).not.toHaveBeenCalled();

		unsubscribe();
		events.emit("u", 1, change);
		expect(mine).toHaveBeenCalledTimes(1);
	});

	it("a throwing listener doesn't starve the others", () => {
		const events = new UserDataEvents();
		const after = vi.fn();
		events.subscribe("u", 1, () => {
			throw new Error("boom");
		});
		events.subscribe("u", 1, after);
		events.emit("u", 1, change);
		expect(after).toHaveBeenCalled();
	});
});
