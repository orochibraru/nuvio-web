import { command, getRequestEvent } from "$app/server";
import {
	downloadIdSchema,
	localDownloadsOf,
	localListing,
	newDownloadSchema,
} from "./local-downloads-data.ts";

// The desktop app's downloads, kept in a folder by its server. Each answers
// with the profile's list as it stands after the change.

export const addLocalDownload = command(newDownloadSchema, async (input) => {
	const { queue, owner } = localDownloadsOf(getRequestEvent().locals);
	await queue.add(owner, input);
	return localListing(queue, owner);
});

export const pauseLocalDownload = command(downloadIdSchema, async (id) => {
	const { queue, owner } = localDownloadsOf(getRequestEvent().locals);
	await queue.pause(owner, id);
	return localListing(queue, owner);
});

export const resumeLocalDownload = command(downloadIdSchema, async (id) => {
	const { queue, owner } = localDownloadsOf(getRequestEvent().locals);
	await queue.resume(owner, id);
	return localListing(queue, owner);
});

export const removeLocalDownload = command(downloadIdSchema, async (id) => {
	const { queue, owner } = localDownloadsOf(getRequestEvent().locals);
	await queue.remove(owner, id);
	return localListing(queue, owner);
});
