import { DOWNLOADS_DIR, proxiedUrl } from "./files.ts";
import {
	Aborted,
	checkRoom,
	type Disk,
	runDownload,
	type SourceFetch,
} from "./job.ts";
import type { WorkerCommand, WorkerEvent } from "./types.ts";

/**
 * Fetches one download at a time into the Origin Private File System (the job
 * itself is `job.ts`). A worker so that writing gigabytes never touches the
 * page's main thread, and because `createSyncAccessHandle` (the one OPFS write
 * API every browser has) only exists in workers.
 */

/** The OPFS write handle, which lib.dom leaves out (it is worker-only). */
interface SyncAccessHandle {
	write: (data: Uint8Array, options: { at: number }) => number;
	truncate: (size: number) => void;
	flush: () => void;
	close: () => void;
}

interface WorkerScope {
	postMessage: (message: unknown) => void;
	addEventListener: (
		type: "message",
		listener: (event: MessageEvent<WorkerCommand>) => void,
	) => void;
}

const scope = self as unknown as WorkerScope;

async function downloadDir(id: string): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	const downloads = await root.getDirectoryHandle(DOWNLOADS_DIR, {
		create: true,
	});
	return downloads.getDirectoryHandle(id, { create: true });
}

async function openAccess(
	dir: FileSystemDirectoryHandle,
	path: string,
): Promise<SyncAccessHandle> {
	const parts = path.split("/");
	let parent = dir;
	for (const part of parts.slice(0, -1)) {
		// biome-ignore lint/performance/noAwaitInLoops: walking a path is sequential
		parent = await parent.getDirectoryHandle(part, { create: true });
	}
	const handle = await parent.getFileHandle(parts.at(-1) as string, {
		create: true,
	});
	return (
		handle as unknown as {
			createSyncAccessHandle: () => Promise<SyncAccessHandle>;
		}
	).createSyncAccessHandle();
}

function opfsDisk(dir: FileSystemDirectoryHandle): Disk {
	return {
		async readText(path) {
			try {
				return await (await (await dir.getFileHandle(path)).getFile()).text();
			} catch {
				return null;
			}
		},
		async size(path) {
			try {
				return (await (await dir.getFileHandle(path)).getFile()).size;
			} catch {
				return 0;
			}
		},
		async writeWhole(path, data) {
			const bytes =
				typeof data === "string" ? new TextEncoder().encode(data) : data;
			const access = await openAccess(dir, path);
			try {
				access.truncate(0);
				access.write(bytes, { at: 0 });
				access.flush();
			} finally {
				access.close();
			}
			return bytes.byteLength;
		},
		async open(path) {
			const access = await openAccess(dir, path);
			return {
				write: (data, at) => {
					access.write(data, { at });
				},
				truncate: (size) => access.truncate(size),
				close: () => {
					access.flush();
					access.close();
				},
			};
		},
		async ensureRoom(bytes) {
			const { quota, usage } = await navigator.storage.estimate();
			if (quota !== undefined && usage !== undefined) {
				checkRoom(bytes, quota - usage);
			}
		},
	};
}

/**
 * Fetches `url` directly, and through the same-origin pass-through when the
 * browser can't: a host without CORS headers, or plain `http:` from an
 * `https:` page (the CSP and mixed-content rules both refuse it). Either
 * failure surfaces as a `TypeError`; once one does, the rest of the download
 * goes through the proxy too.
 */
const fetchSource: SourceFetch = async (url, plan, signal, range = null) => {
	const headers: Record<string, string> = {};
	if (range) {
		headers.range = `bytes=${range.start}-${range.end ?? ""}`;
	}
	if (!plan.viaProxy) {
		try {
			return await fetch(url, { signal, headers, mode: "cors" });
		} catch (error) {
			if (signal.aborted) {
				throw new Aborted();
			}
			if (!(error instanceof TypeError)) {
				throw error;
			}
			plan.viaProxy = true;
		}
	}
	try {
		return await fetch(proxiedUrl(url), { signal, headers });
	} catch (error) {
		if (signal.aborted) {
			throw new Aborted();
		}
		throw error;
	}
};

let current: { id: string; controller: AbortController } | null = null;

scope.addEventListener("message", (event) => {
	const command = event.data;
	if (command.type === "abort") {
		if (current?.id === command.id) {
			current.controller.abort();
		}
		return;
	}
	const controller = new AbortController();
	current = { id: command.record.id, controller };
	void downloadDir(command.record.id)
		.then((dir) =>
			runDownload(
				command,
				{
					disk: opfsDisk(dir),
					fetchSource,
					signal: controller.signal,
				},
				(message: WorkerEvent) => scope.postMessage(message),
			),
		)
		.catch(() =>
			scope.postMessage({
				type: "failed",
				id: command.record.id,
				error: "failed",
			} satisfies WorkerEvent),
		)
		.finally(() => {
			if (current?.controller === controller) {
				current = null;
			}
		});
});
