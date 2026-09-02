import * as v from "valibot";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import {
	INTRODB_BASE,
	type IntroDbMedia,
	type MediaSegments,
	normalizeSegments,
	segmentQuery,
} from "./segments.ts";

/**
 * Intro / credits timestamps for a movie or episode, from TheIntroDB. The
 * public tier is keyless — no server config needed (see TODO.md). `apiKey` is
 * the caller's own personal TheIntroDB key (Settings → Integrations, stored
 * per-profile in `ui.introDbApiKey`, never a server env var): it folds their
 * pending submissions into the result and raises their rate/usage limits.
 * Optional either way: a missing id mapping, a 404 (no community data), or a
 * rate limit all resolve to "no segments" so the player just doesn't show the
 * skip affordances.
 */
export const mediaSegments = query(
	v.object({
		contentId: v.string(),
		season: v.nullable(v.number()),
		episode: v.nullable(v.number()),
		apiKey: v.optional(v.string()),
	}),
	async ({ contentId, season, episode, apiKey }): Promise<MediaSegments> => {
		requireProfile();

		const params = segmentQuery(contentId, season, episode);
		if (!params) {
			return { intro: null, credits: null };
		}

		const headers: Record<string, string> = { accept: "application/json" };
		if (apiKey) {
			headers.authorization = `Bearer ${apiKey}`;
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
