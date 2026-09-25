# The sync store

`src/lib/sync/store.svelte.ts` exports `sync`: a local-first mirror of library,
watch progress and history, backed by IndexedDB, with an optimistic write queue
and a background delta pull.

Components read `sync.ready ? sync.X : data.X` and write through `sync.*`. No
page calls `toggleLibrary` / `saveProgress` / `deleteHistory` directly any more.

## The pieces

| File                | What it is                                               |
| ------------------- | -------------------------------------------------------- |
| `store.svelte.ts`   | The store: state, queue, timers, lifecycle               |
| `reconcile.ts`      | Pure merge logic. Unit-tested, knows nothing about runes |
| `idb.ts`            | IndexedDB access, keyed `<owner>:<identity>`             |
| `persist.svelte.ts` | Writing state out : where `$state.snapshot` happens      |
| `broadcast.ts`      | Serializing state for other tabs                         |
| `local-data.ts`     | The sign-out wipe                                        |
| `sync.remote.ts`    | The server calls: snapshot, deltas, flush                |
| `types.ts`          | Record shapes, key derivation, `syncOwner`               |

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
a recently flushed one, so the ordering holds.

## Who the rows belong to

Everything the store keeps in the browser is namespaced by an **owner**:
`syncOwner(userId, profileId)`, that is, `<userId>:<profileId>`. That covers the
IndexedDB keys, the `BroadcastChannel` name and recent searches.

The user id is the load-bearing half. `profileId` is the profile _index_, 1..6
within one Nuvio account, so it is not an identity. Keyed on it alone, a shared
browser or a multi-account instance had two people who both picked profile 1
reading and writing each other's rows — and because `bootstrapped` is persisted
next to those rows, the second account skipped the full snapshot entirely,
pulled deltas from the first account's cursors, and flushed its queued writes
into the wrong account.

Attaching also drops every other owner's rows, and landing on an auth screen
drops all of them (`local-data.ts`). Signing out clears cookies, not IndexedDB,
so without that the previous account's mirror would sit on the device waiting
for whoever signs in next.

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

Conflict resolution beyond last-write-wins per target. The source of truth is
this server's own database, which syncs with Nuvio in the background (see
[Your data and Nuvio](sync)); the store is a mirror of that, and its cursors are
the server's change sequence, not Nuvio's event ids. `+page.server.ts` loads
remain in place for SSR.
