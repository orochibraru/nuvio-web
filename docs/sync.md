# Your data and Nuvio

Library, watch progress and history live **on this server**, in its SQLite
database, per Nuvio account and per profile. That copy is the source of truth:
every page and the in-browser sync store read and write it, never Nuvio
directly. Your Nuvio account is kept as a mirror, so the Nuvio mobile app and
other devices still see what you do here, and what you do there shows up here.

Everything else (profiles, addons, settings, collections) still lives on Nuvio
and is read from it as before.

## The first visit

The first time a profile is opened on an instance, its library, progress and
history are copied from Nuvio before the page is served, so a fresh instance
never starts empty. If Nuvio can't be reached at that moment the page shows what
the instance already has (nothing, on a brand-new one) and the copy is retried
on the next request. After that one copy, pages never wait on Nuvio.

## How the mirror stays in step

A background sync runs for each signed-in person:

- **Immediately** when the app is opened or you sign in, unless the last sync
  for that account is under 30 seconds old. A write from the app (adding to the
  library, saving progress) counts as activity too, so it usually reaches Nuvio
  within half a minute.
- **Every 5 minutes** for as long as the account is **active**: it made a
  request in the last 30 minutes, or has a tab open on this instance (an open
  tab's live connection counts as a request every 25 seconds). Idle accounts are
  not synced, and a signed-out account or one without a live session on this
  instance is skipped.

Each sync first **pulls** what changed on Nuvio since the last pull (Nuvio's own
change feed, so only the difference travels), then **pushes** what changed here
since the last successful push. A failed push is retried with a backoff that
starts at 30 seconds and doubles up to an hour; nothing is dropped.

## Live updates in open tabs

Each open tab keeps one live connection to this server (server-sent events,
`/api/events`) for its profile. Every change to that profile, whether made in
another tab, on another device through this instance, or pulled from Nuvio, is
pushed down it the moment it is saved here. So a title added on the phone shows
up in an open tab right after the next Nuvio pull, with no refresh.

The connection is a fast path, not the only one:

- While it is open, the tab also polls for changes every **10 minutes**, as a
  safety net. If it drops, the tab polls every **90 seconds** until the browser
  reconnects (it retries every 5 seconds), and a tab brought back to the
  foreground always checks straight away.
- Each pushed change says which state it follows on from. A tab that missed one
  (a dropped connection, a change it hadn't pulled yet) notices the gap and
  fetches everything since its last known state instead of applying out of
  order. It does the same after every reconnect.

A reverse proxy in front of the instance must not buffer responses for
`/api/events`. The server sends `X-Accel-Buffering: no` (which nginx honours)
and a keep-alive comment every 25 seconds, so idle timeouts above that are fine.

## Deleting a profile's data

Deleting a profile's data (account page) or the profile itself deletes it on
Nuvio first, then here. Here, every row becomes a deletion dated at that moment,
rather than disappearing, so open tabs and devices that were offline remove the
rows the same way as any other deletion, and a copy of the old data still in
flight from Nuvio loses to the newer deletion instead of coming back. The
profile is not imported from Nuvio again afterwards.

## When the same thing changed in both places

**Last write wins**, per title (library), per episode or movie (progress) and
per history entry. Each row carries the time it was last written:

- Adding to the library is dated when it was added, progress when it was last
  watched, and a removal when it happened.
- The newer write wins, whichever side it came from. If the one here is newer,
  it is pushed back to Nuvio so both sides agree.
- Nuvio does not say when something was deleted there, so a deletion pulled from
  Nuvio is dated when it was pulled. It removes the row here, unless this
  instance has a newer change for it that it hasn't pushed yet, in which case
  the local change wins and is pushed.
- A device that was offline and sends old changes later cannot overwrite newer
  ones: its stale writes are ignored and it is sent the current state instead.

## When Nuvio is slow or down

Nothing you do waits on it. Reads come from this server, writes are saved here
straight away and queued for Nuvio. When Nuvio comes back, the next sync pushes
the queue and pulls what you missed. The server log shows `Nuvio sync failed` or
`Nuvio push failed` lines while it is unreachable; they stop on their own.

## Back up the data volume

Because this server now holds the only copy of changes that haven't reached
Nuvio yet, and the authoritative copy of everything else, the data directory
(`NUVIO_DATA_DIR`, `/app/data` in the container) is **user data**. Mount it on a
persistent volume and back it up with the rest of your important data.

Losing it is recoverable but not free: the instance starts over by copying each
profile from Nuvio again on its next visit, and anything that had not been
pushed to Nuvio yet is lost.
