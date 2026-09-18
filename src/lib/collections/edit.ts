import type {
	Collection,
	CollectionFolder,
	CollectionViewMode,
} from "#lib/nuvio/index.js";

/**
 * Edits to a profile's collections, as pure functions over the whole list.
 * The API's collections push is a full replace (anything not sent is deleted),
 * so every edit produces the complete next list, never a patch.
 */

function mapCollection(
	collections: Collection[],
	collectionId: string,
	edit: (collection: Collection) => Collection,
): Collection[] {
	return collections.map((entry) =>
		entry.id === collectionId ? edit(entry) : entry,
	);
}

/** Moves a folder by `delta` places, clamped to the ends. */
export function moveFolder(
	collections: Collection[],
	collectionId: string,
	folderId: string,
	delta: number,
): Collection[] {
	return mapCollection(collections, collectionId, (collection) => {
		const folders = [...collection.folders];
		const from = folders.findIndex((folder) => folder.id === folderId);
		if (from < 0) {
			return collection;
		}
		const to = Math.max(0, Math.min(folders.length - 1, from + delta));
		if (to === from) {
			return collection;
		}
		const [moved] = folders.splice(from, 1);
		folders.splice(to, 0, moved);
		return { ...collection, folders };
	});
}

/**
 * Blank strings are dropped rather than stored: an empty `coverImageUrl` would
 * otherwise render as a broken image on every client that reads the blob.
 */
function normalizeFolder(folder: CollectionFolder): CollectionFolder {
	const next: CollectionFolder = { ...folder, title: folder.title.trim() };
	for (const field of ["coverImageUrl", "coverEmoji"] as const) {
		const value = next[field]?.trim();
		if (value) {
			next[field] = value;
		} else {
			delete next[field];
		}
	}
	return next;
}

/** Applies a folder's edited fields. A blank title keeps the old one. */
export function updateFolder(
	collections: Collection[],
	collectionId: string,
	folderId: string,
	patch: Partial<Omit<CollectionFolder, "id">>,
): Collection[] {
	return mapCollection(collections, collectionId, (collection) => ({
		...collection,
		folders: collection.folders.map((folder) => {
			if (folder.id !== folderId) {
				return folder;
			}
			const next = normalizeFolder({ ...folder, ...patch });
			return next.title ? next : { ...next, title: folder.title };
		}),
	}));
}

/** Appends a new folder with a fresh id. */
export function addFolder(
	collections: Collection[],
	collectionId: string,
	draft: Omit<CollectionFolder, "id">,
	id: string = crypto.randomUUID(),
): Collection[] {
	return mapCollection(collections, collectionId, (collection) => ({
		...collection,
		folders: [...collection.folders, normalizeFolder({ ...draft, id })],
	}));
}

export function removeFolder(
	collections: Collection[],
	collectionId: string,
	folderId: string,
): Collection[] {
	return mapCollection(collections, collectionId, (collection) => ({
		...collection,
		folders: collection.folders.filter((folder) => folder.id !== folderId),
	}));
}

export function setViewMode(
	collections: Collection[],
	collectionId: string,
	viewMode: CollectionViewMode,
): Collection[] {
	return mapCollection(collections, collectionId, (collection) => ({
		...collection,
		viewMode,
	}));
}

/**
 * The layout a collection actually renders with. `FOLLOW_LAYOUT` is the
 * spec's "follow the client's own layout", documented by name only; this
 * client's own layout for a collection is tabs, which is also what a
 * collection with no `viewMode` gets.
 */
export function effectiveViewMode(
	viewMode: CollectionViewMode | undefined,
): "TABBED_GRID" | "ROWS" {
	return viewMode === "ROWS" ? "ROWS" : "TABBED_GRID";
}
