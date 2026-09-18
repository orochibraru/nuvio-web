# The admin page

`/admin` is a self-hosting surface, not a user feature. It lists who has signed
in to **this instance** and can lock the instance to an allowlist.

It is the only part of the app with server-owned state.

## Who gets in

`NUVIO_ADMIN_EMAILS` — comma or whitespace separated — declares the server
admins. Unset means there is no admin surface at all.

It is deliberately an environment variable and not a database row: who can
administer the server is a **deployment decision**, not something a signed-in
user can write.

Non-admins get a **404, not a 403**, so the page does not announce itself to a
signed-in user who has no business knowing it is there. Every route _and_ every
remote function re-checks; the nav entry is cosmetic.

Server admins can always sign in, allowlisted or not, so a typo in the allowlist
can never lock you out of the page that fixes it.

## Locking the instance

Locking blocks sign-in and sign-up for anyone not on the allowlist, and signs
out existing sessions on their next request — a session cookie would otherwise
outlive the decision by thirty days.

The check runs per request against the local database and is a single indexed
lookup.

This is how you run an instance for a handful of people without leaving sign-up
open to the internet.

## Activity

Sign-ins and sign-ups per day (UTC) over the last 30 days, with the total above
it. Days with none are drawn as gaps rather than skipped: a chart built only
from the days that have rows draws a quiet week as a continuous line and
misrepresents it. Each bar carries its own date, count and distinct-people
tally, and **Show the numbers** opens the same data as a table.

## Storage

SQLite (`bun:sqlite`) under `NUVIO_DATA_DIR`, defaulting to `data` — which is
`/app/data` in the container. Four tables:

- `sign_ins` — one row per **person**: first seen, last seen, and a count.
- `sign_in_events` — one row per **sign-in**, which is what the activity chart
  reads. A summary cannot answer "when". Pruned to the last 90 days on write, so
  an instance that runs for years does not accumulate an unbounded log.
- `allowlist` — who may sign in while the instance is locked, and who added
  them.
- `settings` — currently just the lock flag.

Emails are stored folded to lowercase, because that is the only way an allowlist
typed by a human matches what the auth provider hands back.

**Mount a volume at `/app/data`** or all of it resets when the container is
recreated.

## When the database is unavailable

If the directory is unwritable, the feature degrades to "no metrics, no lock"
rather than returning a 500 for every request. The failure is logged once, and
the hot paths stop trying.

Failing open here is the coherent choice rather than a hole: the lock is stored
_in_ that database, so no database means nobody ever turned it on. The admin
page itself still fails loudly — there, the error is the answer you wanted.

## What is not here

Per-user content. The admin page knows an email, a user id and some timestamps.
It has no view of anyone's library, progress, history or addons — those are on
the Nuvio account, and this server never stores them.
