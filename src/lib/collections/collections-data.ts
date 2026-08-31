import type { Collection, NuvioClient } from "$lib/nuvio/index.js";

/** This profile's collections blob, or `[]` on any failure. */
export async function pullCollections(
	nuvio: NuvioClient,
	profileId: number,
): Promise<Collection[]> {
	const blobs = await nuvio.collections.pull(profileId).catch(() => []);
	return blobs[0]?.collections_json ?? [];
}
