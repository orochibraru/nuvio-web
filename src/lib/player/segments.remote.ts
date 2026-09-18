import * as v from "valibot";
import { TtlCache } from "#lib/addons/cache.js";
import { requireProfile } from "#lib/server/guards.js";
import { query } from "$app/server";
import {
	type AniSkipResponse,
	ARM_BASE,
	type ArmEntry,
	animeLookup,
	aniSkipUrl,
	INTRODB_BASE,
	type IntroDbMedia,
	type MediaSegments,
	normalizeAniSkip,
	normalizeSegments,
	pickMalId,
	segmentQuery,
} from "./segments.ts";

const NO_SEGMENTS: MediaSegments = { intro: null, credits: null };
const TIMEOUT_MS = 6000;

// An id → MAL mapping does not change, and every episode of a series asks the
// same question, so it is cached for the life of the process (a day, to pick up
// ARM corrections eventually). Public data : not per user, safe to share.
const armCache = new TtlCache<ArmEntry | ArmEntry[] | null>(24 * 60 * 60_000);

async function getJson<T>(
	url: string,
	headers: Record<string, string> = {},
): Promise<T | null> {
	try {
		const response = await fetch(url, {
			headers: { accept: "application/json", ...headers },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		return response.ok ? ((await response.json()) as T) : null;
	} catch {
		return null;
	}
}

async function fromIntroDb(
	contentId: string,
	season: number | null,
	episode: number | null,
	apiKey: string | undefined,
): Promise<MediaSegments> {
	const params = segmentQuery(contentId, season, episode);
	if (!params) {
		return NO_SEGMENTS;
	}
	const media = await getJson<IntroDbMedia>(
		`${INTRODB_BASE}/media?${params}`,
		apiKey ? { authorization: `Bearer ${apiKey}` } : {},
	);
	return normalizeSegments(media);
}

async function fromAniSkip(
	contentId: string,
	season: number | null,
	episode: number | null,
): Promise<MediaSegments> {
	const lookup = animeLookup(contentId);
	if (!lookup) {
		return NO_SEGMENTS;
	}
	let malId: number | null;
	if (lookup.kind === "mal") {
		malId = lookup.malId;
	} else {
		const mapping = await armCache.wrap(lookup.path, () =>
			getJson<ArmEntry | ArmEntry[]>(`${ARM_BASE}/${lookup.path}`),
		);
		malId = pickMalId(mapping, season);
	}
	if (malId == null) {
		return NO_SEGMENTS;
	}
	return normalizeAniSkip(
		await getJson<AniSkipResponse>(aniSkipUrl(malId, episode)),
	);
}

/**
 * Intro / credits timestamps for a movie or episode.
 *
 * TheIntroDB first. Its public tier is keyless; `apiKey` is the caller's own
 * personal key (Settings → Integrations, stored per profile in
 * `ui.introDbApiKey`, never a server env var), which folds their pending
 * submissions in and raises their limits.
 *
 * AniSkip when TheIntroDB has nothing at all for the title: it is where anime
 * skip times live, and anime is where TheIntroDB is thinnest. Only on a total
 * miss, so a non-anime title TheIntroDB knows costs nothing extra.
 *
 * Everything resolves rather than throws: a missing id mapping, a 404, a rate
 * limit or a timeout all mean "no segments", and the player just doesn't show
 * the skip affordances.
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
		const introDb = await fromIntroDb(contentId, season, episode, apiKey);
		if (introDb.intro || introDb.credits) {
			return introDb;
		}
		return await fromAniSkip(contentId, season, episode);
	},
);
