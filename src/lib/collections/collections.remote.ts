import * as v from "valibot";
import { getAddonClient } from "#lib/addons/server.js";
import type { MetaPreview } from "#lib/addons/types.js";
import { requireProfile } from "#lib/server/guards.js";
import { command, query } from "$app/server";
import { folderContents } from "./collections-data.ts";

const catalogSourceSchema = v.object({
	addonId: v.string(),
	type: v.string(),
	catalogId: v.string(),
});

const folderSchema = v.object({
	id: v.string(),
	title: v.string(),
	coverImageUrl: v.optional(v.string()),
	coverEmoji: v.optional(v.string()),
	tileShape: v.optional(v.picklist(["POSTER", "LANDSCAPE", "SQUARE"])),
	hideTitle: v.optional(v.boolean()),
	catalogSources: v.optional(v.array(catalogSourceSchema)),
});

const collectionsSchema = v.array(
	v.object({
		id: v.string(),
		title: v.string(),
		backdropImageUrl: v.optional(v.string()),
		pinToTop: v.optional(v.boolean()),
		viewMode: v.optional(v.picklist(["TABBED_GRID", "ROWS", "FOLLOW_LAYOUT"])),
		showAllTab: v.optional(v.boolean()),
		folders: v.array(folderSchema),
	}),
);

export const saveCollections = command(
	collectionsSchema,
	async (collections) => {
		const { nuvio, profileId } = requireProfile();
		await nuvio.collections.replace({
			p_profile_id: profileId,
			p_collections_json: collections,
		});
		return { count: collections.length };
	},
);

/**
 * One folder's titles, for a folder the user just added or re-pointed at
 * other catalogs. Client-initiated (a save), so a query rather than the load:
 * the page's initial contents still come from the load, and re-running that
 * whole load after every edit would re-fetch every other folder too.
 */
export const folderTitles = query(
	folderSchema,
	async (folder): Promise<MetaPreview[]> => {
		requireProfile();
		const { client } = await getAddonClient();
		const [contents] = await folderContents(client, [folder]);
		return contents?.metas ?? [];
	},
);
