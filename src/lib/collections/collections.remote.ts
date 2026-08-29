import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { command, query } from "$app/server";
import { getAddonClient } from "$lib/addons/server.js";
import type { MetaPreview } from "$lib/addons/types.js";
import type { Collection } from "$lib/nuvio/index.js";
import { requireProfile } from "$lib/server/guards.js";

export const getCollections = query(async (): Promise<Collection[]> => {
	const { nuvio, profileId } = requireProfile();
	const blobs = await nuvio.collections.pull(profileId);
	return blobs[0]?.collections_json ?? [];
});

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
		await getCollections().refresh();
		return { count: collections.length };
	},
);

export const collectionContents = query(v.string(), async (collectionId) => {
	const { nuvio, profileId } = requireProfile();
	const blobs = await nuvio.collections.pull(profileId);
	const collection = (blobs[0]?.collections_json ?? []).find(
		(entry) => entry.id === collectionId,
	);
	if (!collection) {
		error(404, "Collection not found");
	}

	const { client } = await getAddonClient();

	const folders = await Promise.all(
		collection.folders.map(async (folder) => {
			const batches = await Promise.all(
				(folder.catalogSources ?? []).map(async (source) => {
					try {
						const result = await client.getCatalog(
							{ type: source.type, id: source.catalogId },
							source.addonId,
						);
						return result?.metas ?? [];
					} catch {
						return [];
					}
				}),
			);

			const seen = new Set<string>();
			const metas: MetaPreview[] = [];
			for (const meta of batches.flat()) {
				const key = `${meta.type}:${meta.id}`;
				if (!seen.has(key)) {
					seen.add(key);
					metas.push(meta);
				}
			}
			return {
				id: folder.id,
				title: folder.title,
				coverEmoji: folder.coverEmoji ?? null,
				hideTitle: folder.hideTitle ?? false,
				metas,
			};
		}),
	);

	return {
		id: collection.id,
		title: collection.title,
		viewMode: collection.viewMode ?? "TABBED_GRID",
		showAllTab: collection.showAllTab ?? false,
		folders,
	};
});
