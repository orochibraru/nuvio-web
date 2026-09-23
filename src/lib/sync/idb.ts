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
	if (dbPromise !== null) {
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

/** Every value for one owner in a store, as identity → value (prefix stripped). */
export async function readAll<T>(
	store: StoreName,
	owner: string,
): Promise<Map<string, T>> {
	const db = await openDb();
	const out = new Map<string, T>();
	if (!db) {
		return out;
	}
	const prefix = `${owner}:`;
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
	owner: string,
	key: string,
): Promise<T | null> {
	const db = await openDb();
	if (!db) {
		return null;
	}
	try {
		const request = tx(db, store, "readonly").get(`${owner}:${key}`);
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
	owner: string,
	key: string,
	value: unknown,
): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	try {
		await done(
			tx(db, store, "readwrite").put({ _pk: `${owner}:${key}`, value }),
		);
	} catch {
		// best effort
	}
}

/** Replace a store's contents for one owner with `entries` (identity → value). */
export async function replaceAll(
	store: StoreName,
	owner: string,
	entries: Iterable<[string, unknown]>,
): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	const prefix = `${owner}:`;
	const rows = [...entries].map(([identity, value]) => ({
		_pk: `${prefix}${identity}`,
		value,
	}));
	try {
		// One transaction, no `await` between requests: a cursor deletes this
		// owner's rows, then the new rows go in, then we await the commit.
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

export async function clearOwner(owner: string): Promise<void> {
	await Promise.all(
		STORES.map(async (store) => {
			await replaceAll(store, owner, []);
		}),
	);
}

/**
 * Drops every row that is not `keep`'s, across every store.
 *
 * Signing out clears cookies, not IndexedDB, so without this the previous
 * account's mirror sits on the device until something overwrites it. Running it
 * on attach is what makes "sign out, sign in as someone else" leave nothing
 * behind, and it self-heals a device that was already in that state. `null`
 * keeps nothing, which is the sign-out case.
 */
export async function purgeOtherOwners(keep: string | null): Promise<void> {
	const db = await openDb();
	if (!db) {
		return;
	}
	const prefix = keep === null ? null : `${keep}:`;
	await Promise.all(
		STORES.map(async (store) => {
			try {
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
						if (!cursor) {
							return;
						}
						if (
							typeof cursor.key === "string" &&
							(prefix === null || !cursor.key.startsWith(prefix))
						) {
							objectStore.delete(cursor.key);
						}
						cursor.continue();
					};
					cursorRequest.onerror = () => reject(cursorRequest.error);
				});
			} catch {
				// best effort
			}
		}),
	);
}

/** Puts and deletes for one store, keyed by identity (no owner prefix). */
export interface StorePatch {
	put?: Iterable<[string, unknown]>;
	delete?: Iterable<string>;
}

/**
 * Apply puts / deletes for one owner across several stores in a single
 * transaction : the incremental counterpart of `replaceAll`, so one changed
 * row costs one row, not a rewrite of the owner's whole store.
 */
export async function patchStores(
	owner: string,
	patches: Partial<Record<StoreName, StorePatch>>,
): Promise<void> {
	const names = Object.keys(patches) as StoreName[];
	const db = names.length > 0 ? await openDb() : null;
	if (!db) {
		return;
	}
	const prefix = `${owner}:`;
	try {
		const transaction = db.transaction(names, "readwrite");
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
			for (const name of names) {
				const objectStore = transaction.objectStore(name);
				for (const identity of patches[name]?.delete ?? []) {
					objectStore.delete(`${prefix}${identity}`);
				}
				for (const [identity, value] of patches[name]?.put ?? []) {
					objectStore.put({ _pk: `${prefix}${identity}`, value });
				}
			}
		});
	} catch {
		// best effort
	}
}
