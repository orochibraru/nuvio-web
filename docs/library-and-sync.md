# Library and sync

Library, watch progress and history are kept **per profile** on your Nuvio
account, so they follow you between devices and between the web app and mobile.

## Library

Bookmark a title from anywhere a poster appears — the poster's own context menu,
the detail page, or the player. The Library page lists what you have kept,
filtered by type.

## Collections

A collection is a page of your own layout, built from **folders**. Each folder
is fed by one or more catalogs from your addons ("Popular movies" from one,
"Trending" from another), merged and de-duplicated. Collections live on your
Nuvio account next to the ones mobile makes, and show up in both.

Create, rename, pin or delete a collection from the Collections page. Inside
one, **Add folder** picks its catalogs; the pencil beside a folder edits it:

- **Name**, and an optional **emoji** and **cover image** for its tile.
- **Tile shape** : poster, landscape or square. A folder with a cover image or
  an emoji gets a tile of that shape in the folder strip; one without stays a
  plain pill.
- **Hide the title on the tile**, for a cover that already says it. The name
  stays available to screen readers.
- **Move earlier / later** to reorder folders.

The layout switch picks how the folders render: **Tabs** (one folder at a time,
with an "All" tab once there are two), **Rows** (every folder as its own row),
or **Default**, which follows the app's own layout. On the web that is tabs.

Edits show straight away. The API's reads can briefly lag its writes, so the
page keeps showing what you just saved until the server's copy catches up, and
every edit builds on that rather than on the older read. The API replaces the
whole collections list on every save, so building on a stale read could
otherwise undo the edit before.

## Continue watching

Progress is saved as you watch, and the home feed's continue-watching row is
built from it. Removing a card from the row clears that title's progress.

Episode progress is tracked per episode, so a series resumes where you left it
rather than where the series last was.

## History and stats

**Account → History** is the full, editable log. Delete a single entry or clear
the lot.

**Account → Stats** summarises what you have watched: totals, time, and a
breakdown by type.

## The local-first store

Reads and writes go through a local mirror in IndexedDB rather than straight to
the network. In practice:

- A bookmark or a progress save **lands instantly**, applied to local state and
  queued for the server.
- Queued writes are flushed in a batch, debounced so a scrub bar does not
  generate one request per second.
- A background delta pull runs every ninety seconds, and when the tab becomes
  visible again, reconciling what the server has with what you did locally.
- Going offline is not an error. Writes queue and flush when you come back.
- Open tabs stay in step over `BroadcastChannel`: bookmark a title in one tab
  and the other tab's poster updates immediately, without waiting for a poll.

Pages read `sync.ready ? sync.X : data.X`, so a freshly-loaded page shows the
server-rendered value until the local store has booted, then switches to it.
There is no flash of empty state.

The reconcile logic — which write wins when the server and the local queue
disagree — is a pure function with its own test suite. A delta pull shortly
after a flush can read a server snapshot that lags the write it just accepted,
so recently-flushed writes are kept for a grace period and re-applied over
anything the pull brings back.

## Clearing local data

**Account → Storage** shows what the local mirror holds and clears it for the
current profile. The server copy is untouched; the next sync repopulates it.

**Signing out clears it for you.** The mirror is namespaced by account _and_
profile, and landing on any auth screen wipes every account's copy — so sharing
a browser does not share a library, and signing in as someone else cannot
inherit the previous account's rows or its unflushed writes. Recent searches go
the same way.

## Other backends

**Settings → Sync** exposes `librarySource` and `progressSource`, mirroring what
Nuvio's mobile app offers. Only `nuvio` works today — Trakt and SIMKL need their
own OAuth integration, and the Nuvio API does not proxy them.
