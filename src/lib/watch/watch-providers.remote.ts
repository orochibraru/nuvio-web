import * as v from "valibot";
import { getRequestEvent, query } from "$app/server";
import { requireProfile } from "$lib/server/guards.js";
import {
	EMPTY_PROVIDERS,
	JUSTWATCH_GRAPHQL,
	type JwNode,
	pickNode,
	regionFromAcceptLanguage,
	searchBody,
	shapeProviders,
	type WatchProviders,
} from "./watch-providers.ts";

/**
 * Official streaming / rent / buy availability for a title, from JustWatch.
 * Best-effort: any failure (no match, rate limit, network) resolves to "nothing
 * known" so callers just don't show the affordance.
 */
export const watchProviders = query(
	v.object({
		title: v.pipe(v.string(), v.trim(), v.minLength(1)),
		year: v.nullish(v.number()),
		imdbId: v.nullish(v.string()),
		/** ISO country from the profile's setting; "auto" / unset → Accept-Language. */
		region: v.nullish(v.string()),
	}),
	async ({ title, year, imdbId, region }): Promise<WatchProviders> => {
		requireProfile();
		const { request, fetch } = getRequestEvent();
		const country =
			region && region !== "auto"
				? region.toUpperCase()
				: regionFromAcceptLanguage(request.headers.get("accept-language"));

		try {
			const response = await fetch(JUSTWATCH_GRAPHQL, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: searchBody(title, country),
				signal: AbortSignal.timeout(6000),
			});
			if (!response.ok) {
				return EMPTY_PROVIDERS;
			}
			const json = (await response.json()) as {
				data?: {
					popularTitles?: { edges?: Array<{ node?: JwNode }> | null } | null;
				};
			};
			const nodes = (json.data?.popularTitles?.edges ?? [])
				.map((edge) => edge?.node)
				.filter((node): node is JwNode => Boolean(node));
			return shapeProviders(
				pickNode(nodes, {
					imdbId: imdbId ?? null,
					title,
					year: year ?? null,
				}),
			);
		} catch {
			return EMPTY_PROVIDERS;
		}
	},
);
