import { json } from "@sveltejs/kit";
import {
	localDownloadsOf,
	localListing,
} from "#lib/downloads/local-downloads-data.js";
import type { RequestHandler } from "./$types";

/** The profile's downloads in the desktop app's folder, polled while one runs. */
export const GET: RequestHandler = async ({ locals }) => {
	const { queue, owner } = localDownloadsOf(locals);
	return json(await localListing(queue, owner), {
		headers: { "cache-control": "no-store" },
	});
};
