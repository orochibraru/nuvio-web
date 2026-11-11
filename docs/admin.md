# The admin page

`/admin` is a self-hosting surface, not a user feature. It shows how **this
instance** is used, decides who may sign in and through which backend, and tells
the admins when something needs a look.

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

## Tabs

The page has four tabs: **Dashboard** (the numbers), **Backends**,
**Notifications** and **Settings** (the lock, the allowlist and SMTP). The tab
is in the URL as `?tab=backends`, `?tab=notifications` or `?tab=settings`, so a
link (a notification email, a bookmark) opens the right one; the dashboard is
bare `/admin`, and an unknown value falls back to it. Switching tabs does not
reload the page's data. On a phone the tab row scrolls sideways.

## Locking the instance

Locking blocks sign-in and sign-up for anyone not on the allowlist, and signs
out existing sessions on their next request — a session cookie would otherwise
outlive the decision by thirty days.

The check runs per request against the local database and is a single indexed
lookup.

This is how you run an instance for a handful of people without leaving sign-up
open to the internet.

A locked instance also refuses every custom backend outright, at sign-in and on
the next request of any session already on one: the allowlist is a list of
emails, and only the instance's default backend is trusted to say which email
someone has.

## Backends

The **Backends** tab decides which Supabase-style backend accounts come from.

**Default backend.** Empty means the official Nuvio API. Set a URL and its
publishable (anon) key to replace it for everyone who doesn't pick a backend of
their own: this is for an instance whose users all live on a self-hosted
backend. Leave the key empty for a
[Nuvio self-hosted](https://github.com/NuvioMedia/self-host) server: it is read
from the server's `/.well-known/nuvio` (only the key: its `backend_url` says
`localhost` in local mode, so the URL you typed is kept). **Test connection**
asks its `/auth/v1/settings` with that key before you save. The default is the
one backend whose emails count for `NUVIO_ADMIN_EMAILS` and the allowlist, so
sign in through it to keep reaching this page. Because an admin typed it, it may
sit on your LAN (`http://192.168.…` is fine), but it is still HTTP or HTTPS
only, without credentials in the URL, and every request to it has the same
timeout and response cap as any other backend.

Changing the default signs out everyone on the previous one, the official API
included when it was the default (you too: sign back in through the new one to
keep reaching this page). Their data stays where it was and comes back when that
backend is the default again.

The sign-in and sign-up forms let each user pick where to sign in: this
instance's default first when you set one, then the official Nuvio server, which
is always on offer. Next to your default, accounts on the official server sign
in like any other backend's: kept apart, never admins, and refused while the
instance is locked.

**Allow custom backends** (off by default, or on from the first boot with
`NUVIO_ALLOW_CUSTOM_BACKENDS=true`) adds **Custom backend** to that choice,
where a user types a backend URL and its key (or leaves the key empty for a
Nuvio self-hosted server, as above; that lookup goes through the same address
checks as everything else a user's backend gets). Turning it off signs out every
session on a custom backend on its next request.

**Seen backends** lists every custom backend someone signed in through, by URL:
how many distinct accounts used it, and when it was first and last used. The
admins are notified the first time a new one shows up. **Ban** refuses sign-in
through it and ends every session on it at once, the background Nuvio sync
included; **Unban** allows sign-in again and signs nobody back in.

What a custom backend can and cannot do is in [Security](security).

### Built-in backend

This server is also a Nuvio backend of its own: the same HTTP API as
`api.nuvio.tv` (auth, profiles, addons, library, progress, history, settings,
collections, avatars, health), answered from its SQLite. Its base URL is
`https://<this instance>/api/nuvio`, and it has its own **publishable key**,
generated once and shown on the **Built-in backend** card with copy buttons,
next to its account count. The key is public, like any Supabase publishable key:
it only says which backend a client means, the access token says who is calling.

To make it the default, create your own account on it from the card first (admin
emails can't sign up through its API, see [Security](security)), then press
**Use as the default backend**. That is the same switch as typing it into
**Default backend**: everyone on the previous default is signed out and signs up
again here, starting with an empty library, since data on this server is kept
per backend. While it is the default, the server calls it in-process, not over
the network, so it works behind any reverse proxy. Other instances (and any app
that lets you set a Supabase URL and key) can point at it like any custom
backend; those requests do come in over HTTP.

Sign-up and sign-in on it obey the lock and the allowlist, and are rate-limited
like the app's own forms. While it is the default and SMTP is set up
(Notifications), its users get **Forgot password?** on the sign-in page, and the
card's **Email confirmation** switch can make new accounts confirm their address
before they sign in (off by default; accounts that already exist stay
confirmed). Its users can delete their own account, and everything in it, from
Account → Overview. Everything it holds lives in the `backend_*` tables of the
same SQLite file, so the data volume backup covers it.

## Dashboard

Everything on it is an SQL aggregate over data this server already stores; no
number comes from Nuvio. Each block streams on its own, so a slow one never
holds up the rest. Days are UTC. A person is counted by their folded email.

**Key numbers**, each against the period before it:

- **Active yesterday / last 7 days / last 30 days**: distinct people with a
  sign-in or any signed-in request in that many complete UTC days (today, still
  running, is left out so the comparison is like for like). A signed-in request
  writes one `active` row per person per day: the request hook keeps a set of
  who it has seen today in memory and a unique index catches the rest, so this
  is one write per person per day, not per request.
- **New accounts**: people whose first sign-in on this server falls in the last
  30 days. An existing Nuvio account signing in here for the first time counts;
  this server cannot tell a Nuvio sign-up from a first visit.
- **Accounts**: everyone who ever signed in here, with the number of signed-in
  devices (sessions used in the last 30 days).
- **Videos played** and **Hours watched**: watch-progress rows last played in
  the last 7 days, and the positions reached on them (capped at the duration).
  Only the latest state of each video is stored, so a video played on Monday and
  again on Friday counts once, on Friday. Treat it as "how much was watched",
  not as an exact play log.

**Most watched this week**: titles with progress or history in the last 7 days,
ranked by how many accounts played them, named from the library or history
records. **Returning and new people**: everyone active in each of the last eight
7-day blocks, split by whether it was their first block on this server.

Below a **Last 30 / 90 days** switch that scopes every chart under it: active
people per day (the headline is the busiest day), sign-ins per day (the total),
new accounts per day, and videos played per day with the accounts behind them.

Days with nothing are drawn as gaps rather than skipped: a chart built only from
the days that have rows draws a quiet week as a continuous line and
misrepresents it. Each bar names its own day and value, and **Show the numbers**
opens every chart as a table.

The sign-in table (one row per person, newest first) closes the tab.

## Notifications

The server records a notification when something needs an admin, for now the
first sign-in through a custom backend nobody used before. Each one is stored as
a code plus its data and worded in your language on the page; it links to the
Backends tab. Read state is per admin: marking one read, or all of them, leaves
the other admins' copies unread. The unread count is on the tab.

**Email me notifications** is a per-admin opt-in (off by default), keyed by the
admin's email. Every admin who turned it on gets each new notification by email
(in English), through the SMTP server below. Without SMTP nothing is sent and
the notification is still recorded. Notifications older than 90 days are pruned
when a new one arrives.

## Email (SMTP)

The **Settings** tab holds the SMTP server this instance sends mail through:
host, port, encryption (**None**, **STARTTLS** or **TLS** for implicit TLS, the
usual 587 / 465 split), an optional username and password, and the from address.
Host, port and from address are validated on the server; connecting times out
after 10 seconds, the greeting after 10 and an idle socket after 20.

The password is encrypted at rest (AES-256-GCM with a key derived from the
session secret, separate from the session tokens' key) and never sent back to
the browser: the form only says one is saved. Leave the field empty to keep it,
type a new one to replace it, or tick **Remove the saved password**. Changing
`NUVIO_SESSION_SECRET` makes the saved password unreadable; save it again.

**Send test email** sends to your own address with the saved settings and says
what went wrong when it fails: refused credentials, no connection, a timeout, a
rejected message. The details stay in the server log.

## Storage

SQLite (`bun:sqlite`) under `NUVIO_DATA_DIR`, defaulting to `data` — which is
`/app/data` in the container. Its tables:

- `sign_ins` — one row per **person**: first seen, last seen, and a count.
- `sign_in_events`: the dashboard's event log, one `sign_in` row per sign-in and
  at most one `active` row per person per day. A summary cannot answer "when".
  Pruned to the last 90 days on write, so an instance that runs for years does
  not accumulate an unbounded log.
- `allowlist` — who may sign in while the instance is locked, and who added
  them.
- `settings`: the lock flag, the backend policy (custom backends allowed, the
  default backend's URL and key) and the SMTP settings (password encrypted).
- `admin_notifications` (code, data, time, which admins read it) and
  `admin_preferences` (each admin's email opt-in).
- `custom_backends` and `custom_backend_accounts`: the backends users signed in
  through, the distinct accounts each one had, and which are banned.
- `backend_*`: the built-in backend's accounts, sessions (refresh tokens
  hashed), emailed-link tokens (hashed), and its users' profiles, addons,
  library, progress, history, settings blobs and collections, plus one event
  table per synced collection for the delta cursors. Its publishable key is in
  `settings`.

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

Per-user content. The admin page knows an email, a user id and some timestamps,
and aggregates over library, progress and history (counts, and the titles most
accounts played). It never shows one person's library, progress or history, and
it has no view of addons: those live on the Nuvio account.
