import { describe, expect, it, vi } from "vitest";

const event = { locals: {} as Record<string, unknown> };
vi.mock("$app/server", () => ({
	query: (schemaOrFn: unknown, fn?: unknown) => fn ?? schemaOrFn,
	getRequestEvent: () => event,
}));

import { apiHealth } from "./health.remote.ts";

function withHealthCheck(impl: () => unknown) {
	event.locals = { nuvio: { healthCheck: impl } };
}

describe("apiHealth", () => {
	it("maps a healthy probe", async () => {
		withHealthCheck(async () => ({ status: "healthy", latency_ms: 42 }));
		expect(await apiHealth()).toEqual({ status: "healthy", latencyMs: 42 });
	});

	it("passes through a degraded status", async () => {
		withHealthCheck(async () => ({ status: "degraded", latency_ms: 900 }));
		expect(await apiHealth()).toEqual({ status: "degraded", latencyMs: 900 });
	});

	it("reports 'down' when the probe throws", async () => {
		withHealthCheck(async () => {
			throw new Error("network");
		});
		expect(await apiHealth()).toEqual({ status: "down", latencyMs: null });
	});
});
