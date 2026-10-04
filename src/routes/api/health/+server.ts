import process from "node:process";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Liveness for the image's `HEALTHCHECK` and orchestrator probes: the process
 * is up and SvelteKit answers. Public, and deliberately checks nothing else :
 * the database is optional, and an upstream outage isn't this container's.
 */
export const GET: RequestHandler = () =>
	json(
		{ status: "ok", uptime: Math.round(process.uptime()) },
		{ headers: { "cache-control": "no-store" } },
	);
