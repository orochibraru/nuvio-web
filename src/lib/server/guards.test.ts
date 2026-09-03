import { describe, expect, it, vi } from "vitest";

const event = { locals: {} as Record<string, unknown> };
vi.mock("$app/server", () => ({ getRequestEvent: () => event }));

import { ADMIN } from "#lib/services/index.js";
import { requireAdmin, requireProfile } from "./guards.ts";

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

describe("requireAdmin", () => {
	function setAdmin(email: string | undefined, isAdmin: boolean) {
		setLocals({
			session: email ? { user: { email } } : null,
			services: {
				get: (token: unknown) =>
					token === ADMIN ? { isAdmin: () => isAdmin } : null,
			},
		});
	}

	it("throws 404, not 403 : the admin surface does not announce itself", () => {
		setAdmin("nobody@example.com", false);
		expect(() => requireAdmin()).toThrow();
		try {
			requireAdmin();
		} catch (thrown) {
			expect((thrown as { status: number }).status).toBe(404);
		}
	});

	it("throws for an anonymous request", () => {
		setAdmin(undefined, false);
		expect(() => requireAdmin()).toThrow();
	});

	it("returns the event and the admin's email", () => {
		setAdmin("boss@example.com", true);
		expect(requireAdmin().email).toBe("boss@example.com");
	});
});
