import { getRequestEvent, query } from "$app/server";
import type { HealthStatus } from "$lib/nuvio/types.js";

export type HealthReport = {
	status: HealthStatus;
	latencyMs: number | null;
};

/**
 * Nuvio API health, for the degraded-mode banner. Never throws: a failed or
 * timed-out probe is reported as `down` so the UI can still render.
 */
export const apiHealth = query(async (): Promise<HealthReport> => {
	const { locals } = getRequestEvent();
	try {
		const result = await locals.nuvio.healthCheck();
		return { status: result.status, latencyMs: result.latency_ms };
	} catch {
		return { status: "down", latencyMs: null };
	}
});
