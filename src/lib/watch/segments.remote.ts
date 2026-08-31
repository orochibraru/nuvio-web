import * as v from "valibot";
import { query } from "$app/server";
import { env } from "$env/dynamic/private";
import { requireProfile } from "$lib/server/guards.js";
import {
	INTRODB_BASE,
	type IntroDbMedia,
	type MediaSegments,
	normalizeSegments,
	segmentQuery,
} from "./segments.ts";

/**
 * Intro / credits timestamps for a movie or episode, from TheIntroDB. Optional:
 * a missing id mapping, a 404 (no community data), or a rate limit all resolve
 * to "no segments" so the player just doesn't show the skip affordances.
 *
 * `INTRODB_API_KEY` (optional, server-only) raises the rate/usage limits and
 * folds in the key owner's pending submissions; without it the public accepted
 * data is used.
 */
export const mediaSegments = query(
	v.object({
		contentId: v.string(),
		season: v.nullable(v.number()),
		episode: v.nullable(v.number()),
	}),
	async ({ contentId, season, episode }): Promise<MediaSegments> => {
		requireProfile();

		const params = segmentQuery(contentId, season, episode);
		if (!params) {
			return { intro: null, credits: null };
		}

		const headers: Record<string, string> = { accept: "application/json" };
		if (env.INTRODB_API_KEY) {
			headers.authorization = `Bearer ${env.INTRODB_API_KEY}`;
		}

		try {
			const response = await fetch(`${INTRODB_BASE}/media?${params}`, {
				headers,
				signal: AbortSignal.timeout(6000),
			});
			if (!response.ok) {
				return { intro: null, credits: null };
			}
			return normalizeSegments((await response.json()) as IntroDbMedia);
		} catch {
			return { intro: null, credits: null };
		}
	},
);
