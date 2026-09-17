# The sync store

`src/lib/sync/store.svelte.ts` exports `sync`: a local-first mirror of library,
watch progress and history, backed by IndexedDB, with an optimistic write queue
and a background delta pull.

Components read `sync.ready ? sync.X : data.X` and write through `sync.*`. No
page calls `toggleLibrary` / `saveProgress` / `deleteHistory` directly any more.

## The pieces

| File              | What it is                                               |
| ----------------- | -------------------------------------------------------- |
| `store.svelte.ts` | The store: state, queue, timers, lifecycle               |
| `reconcile.ts`    | Pure merge logic. Unit-tested, knows nothing about runes |
| `idb.ts`          | IndexedDB access, keyed `<profileId>:<identity>`         |
| `broadcast.ts`    | Serializing state for other tabs                         |
| `sync.remote.ts`  | The server calls: snapshot, deltas, flush                |
| `types.ts`        | Record shapes and key derivation                         |

Keeping `reconcile.ts` pure is the point. Merge order, conflict resolution and
"which write wins" are the parts that break subtly, and they are testable as
plain functions with no browser, no IndexedDB, and no reactivity in the way.

## Lifecycle

1. **Boot.** Read IndexedDB for this profile, publish it, mark `ready`.
2. **Initial sync** after a four-second delay, so first paint and the page's own
   server-rendered calls settle first.
3. **Poll** every ninety seconds, and on tab visibility.
4. **Write.** Apply optimistically to local state, publish, persist, broadcast,
   and queue for the server.
5. **Flush** on a 1.5-second debounce, so scrubbing a progress bar produces one
   request rather than fifty.

## The lag grace period

A delta pull running shortly after a flush can read a server snapshot that
predates the write the server just accepted. Left alone, the pull would revert
what you just did.

Flushed writes are therefore kept for fifteen seconds and re-overlaid on top of
anything a pull brings back. A fresh queued write for the same target overrides
a recently-flushed one, so the ordering holds.

## Cross-tab coherence

Tabs on the **same profile** mirror each other over `BroadcastChannel` instead
of waiting for the next poll. The channel is scoped to the profile, so switching
profiles in one tab cannot leak into another tab's different profile.

## Structured clone

`BroadcastChannel.postMessage` and IndexedDB both **throw on a `$state` proxy**.
Anything crossing either boundary gets `$state.snapshot()` first.

This matters more than it sounds: records reaching the store may have come from
a page that read them out of a streamed load, so they are proxies even when the
code that wrote them looks like it is handling plain objects. See `#broadcast`
and `#persist` in `store.svelte.ts`.

Reactive reads must go through the published `$state` arrays (`sync.library`),
never the private maps.

## Offline

`navigator.onLine === false` suspends flushing rather than erroring. Writes
queue and go out when connectivity returns. IndexedDB that fails to open at all
(private mode, blocked storage) resolves to `null` and every operation becomes a
no-op — the app falls back to server-rendered data and still works.

## What it does not do

Conflict resolution beyond last-write-wins per target, and no cross-profile or
cross-device merge beyond what the server's own delta endpoint provides.
`+page.server.ts` loads remain in place for SSR: the store is a mirror, not the
source of truth.
