import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { httpUrlOrNull } from "#lib/core/url.js";
import { m } from "#lib/i18n/index.js";
import { syncOwner } from "#lib/sync/types.js";
import type { LocalDownloads } from "./local-downloads.ts";
import { LOCAL_DOWNLOADS } from "./tokens.ts";
import type { DownloadRecord } from "./types.ts";

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
const httpUrl = v.pipe(
	text(8192),
	v.check((value) => httpUrlOrNull(value) !== null),
);
const episodeNumber = v.nullable(v.pipe(v.number(), v.integer()));

/** A download the page asks the desktop app's server for: a `NewDownload`. */
export const newDownloadSchema = v.object({
	type: v.picklist(["movie", "series"]),
	contentId: text(300),
	videoId: text(300),
	season: episodeNumber,
	episode: episodeNumber,
	title: text(500),
	subtitle: v.nullable(text(500)),
	poster: v.nullable(text(2048)),
	background: v.nullable(text(2048)),
	sourceUrl: httpUrl,
	sourceLabel: text(500),
	addonName: text(200),
	quality: text(20),
	// A subtitle the server can't fetch is dropped, never the whole download.
	subtitleSources: v.pipe(
		v.array(v.object({ lang: text(100), sdh: v.boolean(), url: text(8192) })),
		v.maxLength(10),
		v.transform((sources) =>
			sources.filter((source) => httpUrlOrNull(source.url) !== null),
		),
	),
});

export const downloadIdSchema = v.pipe(v.string(), v.uuid());

/** What the Downloads page shows for a folder on this computer. */
export interface LocalListing {
	items: DownloadRecord[];
	folder: string;
	/** Bytes free there, when the system says. */
	free: number | null;
}

/**
 * The downloads folder and whose downloads this request may touch: the
 * signed-in profile's. 404 where the server keeps no folder (any instance but
 * the desktop app's), 401 without a profile.
 */
export function localDownloadsOf(locals: App.Locals): {
	queue: LocalDownloads;
	owner: string;
} {
	const queue = locals.services.get(LOCAL_DOWNLOADS);
	if (!queue) {
		error(404, m.error_not_found());
	}
	if (!locals.session || locals.profileId == null) {
		error(401, m.error_no_active_profile());
	}
	return {
		queue,
		owner: syncOwner(locals.session.accountKey, locals.profileId),
	};
}

export async function localListing(
	queue: LocalDownloads,
	owner: string,
): Promise<LocalListing> {
	const [items, free] = await Promise.all([queue.list(owner), queue.free()]);
	return { items, folder: queue.folder, free };
}
