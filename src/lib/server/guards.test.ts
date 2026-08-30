import { describe, expect, it, vi } from "vitest";

const event = { locals: {} as Record<string, unknown> };
vi.mock("$app/server", () => ({ getRequestEvent: () => event }));

import { requireProfile } from "./guards.js";

function setLocals(locals: Record<string, unknown>) {
	event.locals = locals;
}

describe("requireProfile", () => {
	it("throws 401 with no session", () => {
		setLocals({ session: null, profileId: 1 });
		expect(() => requireProfile()).toThrow();
	});

	it("throws 401 with no selected profile", () => {
		setLocals({ session: { user: {} }, profileId: null });
		expect(() => requireProfile()).toThrow();
	});

	it("returns the nuvio client + profile id when signed in", () => {
		const nuvio = { marker: true };
		setLocals({ session: { user: {} }, profileId: 2, nuvio });
		const result = requireProfile();
		expect(result.profileId).toBe(2);
		expect(result.nuvio).toBe(nuvio);
	});
});
