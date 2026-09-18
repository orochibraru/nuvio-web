import type { DownloadRecord } from "./types.ts";

/**
 * Download records, in IndexedDB. A database of its own rather than a store in
 * `nuvio-sync`: this one also has to open on the offline page, which has no
 * account to scope a sync mirror to, and it outlives sign-out (the bytes are
 * the user's, and hours to fetch again).
 */

const DB_NAME = "nuvio-downloads";
const DB_VERSION = 1;
const STORE = "records";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") {
		return Promise.resolve(null);
	}
	dbPromise ??= new Promise((resolve) => {
		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(DB_NAME, DB_VERSION);
		} catch {
			resolve(null);
			return;
		}
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: "id" }).createIndex(
					"owner",
					"owner",
				);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
		request.onblocked = () => resolve(null);
	});
	return dbPromise;
}

function run<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
	return open().then(
		(db) =>
			new Promise<T | null>((resolve) => {
				if (!db) {
					resolve(null);
					return;
				}
				try {
					const request = work(db.transaction(STORE, mode).objectStore(STORE));
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			}),
	);
}

/** Every record for one owner, newest first. `null` owner lists all of them. */
export async function listDownloads(
	owner: string | null,
): Promise<DownloadRecord[]> {
	const rows =
		owner === null
			? await run<DownloadRecord[]>("readonly", (store) => store.getAll())
			: await run<DownloadRecord[]>("readonly", (store) =>
					store.index("owner").getAll(owner),
				);
	return (rows ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDownload(id: string): Promise<DownloadRecord | null> {
	return (
		(await run<DownloadRecord>("readonly", (store) => store.get(id))) ?? null
	);
}

export async function putDownload(record: DownloadRecord): Promise<void> {
	await run("readwrite", (store) => store.put(record));
}

export async function deleteDownload(id: string): Promise<void> {
	await run("readwrite", (store) => store.delete(id));
}
