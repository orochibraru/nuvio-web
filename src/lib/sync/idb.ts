import { browser } from "$app/env";

const DB_NAME = "nuvio-sync";
const DB_VERSION = 1;
const STORES = ["library", "progress", "history", "meta"] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (!browser || typeof indexedDB === "undefined") {
		return Promise.resolve(null);
	}
	if (dbPromise) {
		return dbPromise;
	}
	dbPromise = new Promise((resolve) => {
		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(DB_NAME, DB_VERSION);
		} catch {
			resolve(null);
			return;
		}
		request.onupgradeneeded = () => {
			const db = request.result;
			for (const name of STORES) {
				if (!db.objectStoreNames.contains(name)) {
					db.createObjectStore(name, { keyPath: "_pk" });
				}
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
		request.onblocked = () => resolve(null);
	});
	return dbPromise;
}

function tx(
	db: IDBDatabase,
	store: StoreName,
	mode: IDBTransactionMode,
): IDBObjectStore {
	return db.transaction(store, mode).objectStore(store);
}

function done(request: IDBRequest): Promise<void> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

interface Row {
	_pk: string;
	value: unknown;
}

/** Every value for one profile in a store, as identity → value (profile prefix stripped). */
export async function readAll<T>(
	store: StoreName,
	profileId: number,
): Promise<Map<string, T>> {
	const db = await openDb();
	const out = new Map<string, T>();
	if (!db) {
		return out;
	}
	const prefix = `${profileId}:`;
	try {
		const objectStore = tx(db, store, "readonly");
		const rows: Row[] = await new Promise((resolve, reject) => {
			const request = objectStore.getAll();
			request.onsuccess = () => resolve(request.result as Row[]);
			request.onerror = () => reject(request.error);
		});
		for (const row of rows) {
			if (row._pk.startsWith(prefix)) {
				out.set(row._pk.slice(prefix.length), row.value as T);
			}
		}
	} catch {
		// fall through with whatever we have
	}
	return out;
}

export async function readOne<T>(
	store: StoreName,
	profileId: number,
	key: string,
): Promise<T | null> {
	const db = await openDb();
	if (!db) {
		return null;
	}
	try {
		const request = tx(db, store, "readonly").get(`${profileId}:${key}`);
		const row: Row | undefined = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result as Row | undefined);
			request.onerror = () => reject(request.error);
		});
		return row ? (row.value as T) : null;
	} catch {
		return null;
	}
}

export async function writeOne(
	store: StoreName,
	profileId: number,
	key: string,
	value: unknown,
): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	try {
		await done(
			tx(db, store, "readwrite").put({ _pk: `${profileId}:${key}`, value }),
		);
	} catch {
		// best effort
	}
}

/** Replace a store's contents for one profile with `entries` (identity → value). */
export async function replaceAll(
	store: StoreName,
	profileId: number,
	entries: Iterable<[string, unknown]>,
): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	const prefix = `${profileId}:`;
	const rows = [...entries].map(([identity, value]) => ({
		_pk: `${prefix}${identity}`,
		value,
	}));
	try {
		// One transaction, no `await` between requests: a cursor deletes this
		// profile's rows, then the new rows go in, then we await the commit.
		const objectStore = tx(db, store, "readwrite");
		await new Promise<void>((resolve, reject) => {
			objectStore.transaction.oncomplete = () => resolve();
			objectStore.transaction.onerror = () =>
				reject(objectStore.transaction.error);
			objectStore.transaction.onabort = () =>
				reject(objectStore.transaction.error);
			const cursorRequest = objectStore.openKeyCursor();
			cursorRequest.onsuccess = () => {
				const cursor = cursorRequest.result;
				if (cursor) {
					if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
						objectStore.delete(cursor.key);
					}
					cursor.continue();
				} else {
					for (const row of rows) {
						objectStore.put(row);
					}
				}
			};
			cursorRequest.onerror = () => reject(cursorRequest.error);
		});
	} catch {
		// best effort
	}
}

export async function clearProfile(profileId: number): Promise<void> {
	await Promise.all(
		STORES.map(async (store) => {
			await replaceAll(store, profileId, []);
		}),
	);
}
