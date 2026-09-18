import "fake-indexeddb/auto";

/**
 * Just enough `document` for the sync store: it listens for
 * `visibilitychange` to re-sync when a tab comes back, and reads
 * `visibilityState` in the handler. A real DOM shim would be a much bigger
 * dependency for two members.
 */
class FakeDocument extends EventTarget {
	visibilityState: DocumentVisibilityState = "visible";
}

Object.assign(globalThis, { document: new FakeDocument() });
