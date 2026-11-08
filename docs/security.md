# Security

Running this on the public internet is on you: put it behind HTTPS and whatever
access control you would give any other self-hosted app. What follows is what
the app does on its own.

## What the server holds

Almost nothing. The app is a client for `api.nuvio.tv`, and your account, your
profiles, your addons, your library and your settings live there.

The exceptions:

- **Two cookies.** `nuvio_session` holds the upstream session (access token,
  refresh token, expiry, user) and `nuvio_profile` holds the picked profile
  index. Both are `httpOnly`, `sameSite=lax`, and `secure` outside dev, with a
  thirty-day lifetime. The session is refreshed transparently when it expires,
  and a refresh that fails clears the cookie rather than looping.
- **The admin database**, covering sign-ins and the allowlist for this instance.
  See [The admin page](admin).

Subtitle conversion and cast-biography lookups both happen in the browser, so
neither subtitle files nor third-party biography text transit the server.

## Outbound requests to addons

Addon URLs are user-supplied and the server fetches them, so every addon fetch
goes through an SSRF guard:

- **Scheme allowlist** — `https`, plus `http` only where an addon manifest needs
  it.
- **Address blocks** — loopback, link-local (the cloud metadata endpoint
  `169.254.169.254` included), benchmark, multicast and reserved ranges, for
  both IPv4 and IPv6 (link-local, deprecated site-local `fec0::/10`, multicast
  `ff00::/8`, and the whole of `::/96`, which covers IPv4-compatible
  `::a.b.c.d`). An address that embeds an IPv4 host, IPv4-mapped `::ffff:0:0/96`
  in either spelling or NAT64 `64:ff9b::/96`, gets the IPv4 rules; local-use
  NAT64 `64:ff9b:1::/48` is refused outright.
- **Manual redirect following**, so every hop is re-checked rather than only the
  first.
- **The LAN is allowed** — private ranges (`10/8`, `172.16/12`, `192.168/16`),
  carrier-grade NAT `100.64/10` and IPv6 unique-local `fc00::/7` are reachable,
  so an addon or backend self-hosted on the network works. On a server shared
  with people you don't trust, any of them can reach what that network exposes;
  firewall the container's egress if that matters.

DNS rebinding between check and connect is still possible in principle. Put an
egress filter in front if that is in your threat model.

Addon responses are treated as untrusted data throughout: a body past its size
cap (1 MB for a manifest, 5 MB for anything else) is refused while it streams,
and an entry missing what installing it needs, or what displaying it needs, is
dropped rather than rendered. A failed addon request reaches the browser as a
fixed reason code (timeout, HTTP status, invalid, blocked, unreachable), never
the transport's own message, which would name the host and port it tried; the
detail stays in the server log.

## The download proxy

`/api/downloads/proxy?url=…` passes a download's bytes through when the browser
can't fetch the source itself (no CORS headers, or `http:` under an `https:`
app). It isn't an open proxy:

- it answers signed-in users only;
- the target goes through the same SSRF guard as addon URLs, with loopback and
  link-local addresses refused and every redirect hop re-checked;
- only `Range` goes upstream, and only content headers come back (no cookies
  either way);
- the body streams through and is never stored.

The download worker tries every source directly first, so the proxy only carries
traffic that has no other way.

## Downloads kept on disk

With `NUVIO_DOWNLOADS_DIR` set (the desktop app sets it), the server fetches
downloads itself, through the same SSRF guard, and writes them under that
folder. Only that instance does: unset, which is the default, the server never
writes a download anywhere, so a hosted instance can't be made to fill its disk.

- Every command and `/api/downloads/local/…` answer the signed-in profile only,
  and only for its own downloads.
- A file is served only once its download is finished, by the download's id (a
  UUID) and a file its record names (the video, a subtitle), or for an HLS copy
  one of its playlists and segments; a hidden file never is. It goes out as
  media (the service worker's type rules), `nosniff`, with a sandboxing CSP.
- The page names a download to the app's mpv by id only (`nuvio-download:<id>`).
  The app finds the folder whose record has that id and plays the file the
  record names, a plain name inside that folder, so the page can't point mpv at
  any other file on the computer.

## Response headers

Every response carries:

- a **Content Security Policy** with `default-src 'self'`,
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and
  `form-action 'self'`. `img-src` and `media-src` are open to `https:` because
  addon artwork and streams come from arbitrary hosts; `frame-src` allows only
  `youtube-nocookie.com`, for trailers.
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy` denying camera, microphone, geolocation and
  browsing-topics
- `strict-transport-security` outside dev

`script-src` includes `'unsafe-inline'`. That is unavoidable without SvelteKit's
CSP nonce integration, which this setup does not use; everything else is locked
down.

## Errors

Uncaught errors get a short random error id, logged server-side with the stack
and shown to the user as just the id. In production the message is replaced with
a generic one, because an unknown error is the only kind whose text could carry
internals — a driver string, a path, a query.

An error thrown deliberately by the app (a guard's 403, a rejected remote
function argument) keeps the message that was written for a user to read, and is
logged at warn rather than error: it is the app working as designed.

## Authorization

Route guards read the request's own service scope. `requireProfile()` demands a
signed-in request with an active profile; `requireAdmin()` 404s anyone not in
`NUVIO_ADMIN_EMAILS`, or signed in through a backend other than the instance
default.

Guards run in **loads and in remote functions independently**. A remote function
never assumes the page that called it was guarded.

## Backends other than Nuvio's

The backend a user signs in through decides who they are: it hands back the user
id and the email, and a hostile one can claim any of them. So the server only
believes a backend about its own users.

- **Three kinds.** The official Nuvio API; the instance default, when an admin
  replaced it on the admin page; and a custom backend a user typed in, only when
  an admin allows custom backends. Only the instance default (the official API
  unless replaced) is trusted for `NUVIO_ADMIN_EMAILS` and the allowlist: an
  admin email arriving through any other backend is not an admin, and a locked
  instance refuses every custom backend at sign-in and signs its sessions out.
- **Identity is namespaced.** Everything this server keys by user (library,
  progress and history in SQLite, the sync cursors, the stored sessions, the
  live event streams, the addon registry cache, the browser's IndexedDB owner
  key) uses an account key: the bare user id on the official API, so existing
  data keeps its key, and `custom-` plus a SHA-256 of the backend URL and the
  user id on any other. The same user id on two backends is two accounts that
  can never read each other's data. The sign-in rate limit per email is also per
  backend.
- **The session pins its backend.** The URL and key are stored with the session,
  encrypted like the tokens. Every client built for that session (page loads,
  token refresh, the background sync, avatars) talks to that backend and nothing
  falls back to the official API. Banning a backend, disallowing custom
  backends, locking the instance or replacing the default ends the affected
  sessions, and with them their background sync.
- **Every request to a custom backend goes through the SSRF guard** of outbound
  addon requests: public addresses only, every redirect re-checked, the
  connection pinned to the checked address. Each request also has a 12 second
  deadline and a 10 MB response cap, and a failure reaches the user as a fixed
  reason (blocked, unreachable, invalid answer), never the transport's own text.
  The admin's default is the one exception to the address block, since an admin
  chose it; its scheme, deadline and cap still apply.
- **Everything a backend says is input.** URLs are HTTP or HTTPS only, without
  credentials, whitespace, control characters, query or fragment, at most 2048
  characters, and stored as origin plus path. A publishable key is a bounded
  token charset (it goes out as a header, so nothing that can split one). A
  custom backend's session must carry a user id of at most 128 safe characters
  and a well-formed email before anything is keyed by them. Avatar URLs and
  colours from a backend reach the page only as HTTP or HTTPS URLs and hex
  colours. Queries bind every value, and log lines name a backend by its origin
  only.
- **The official key stays with the official API.** A custom backend needs its
  own key; the field is required.

## The built-in backend

`/api/nuvio` serves the Nuvio API from this server's own SQLite. It never reads
the app's session cookie: a request is anonymous, or carries its own bearer
token.

- **Publishable key.** Every `auth/v1` and `rest/v1` request needs the
  instance's `apikey` (header or query), compared in constant time; without it
  the answer is Supabase's gateway 401. The health check and the avatar images
  are public, as on Nuvio's.
- **Passwords** are argon2id (`Bun.password`), at least 8 characters. Emails are
  folded to lowercase. An unknown email still costs a hash check, so timing
  doesn't tell accounts apart.
- **Access tokens** are HS256 JWTs, one hour, `role` and `aud` `authenticated`,
  signed with a key HKDF-derived from the session secret for this purpose only.
  Verification takes only `HS256` (no `none`, no other algorithm), compares the
  signature in constant time, checks expiry, and checks that the token's session
  still exists, so signing out or a revoked session kills its access tokens
  before they expire.
- **Refresh tokens** are 256 random bits, stored as their SHA-256, valid 30
  days, and single use: each refresh hands out a new one and spends the old.
  Presenting a spent one revokes the whole session (the family), on the
  assumption that it was stolen. A client that loses a refresh answer has to
  sign in again; the app itself never races, since it refreshes in one place.
- **No email confirmation.** Nothing proves an address belongs to whoever signs
  up with it. So an email in `NUVIO_ADMIN_EMAILS` can't sign up through the API
  at all: an admin creates their account from the admin page, where their
  current session proves who they are. Add an email to `NUVIO_ADMIN_EMAILS` only
  once its built-in account (if any) is known to be theirs. The allowlist has
  the same weakness, without the escalation: whoever signs up first with an
  allowlisted address gets in.
- **Policy.** Sign-up, the password grant and the refresh grant obey the lock
  and the allowlist (refused before the password is checked), and sign-up and
  sign-in are rate-limited per address and per email through the same limiter as
  the app's forms.
- **Input.** Request bodies are capped at 1 MB and every array at 2000 entries,
  every field is validated (valibot) before it reaches SQL, every value is a
  bound parameter, and RPC names are looked up in a fixed map. The one table
  read (`addons`) takes only the query the client sends (`select=*`,
  `profile_id=eq.N`, `order=sort_order`) and refuses anything else with a
  PostgREST 400. Every row is scoped to the token's user.
- **CORS** is open (`*`): there is no cookie to ride on, a request carries its
  own key and token.

## Reporting something

Open an issue on
[the repository](https://github.com/orochibraru/nuvio-web/issues). If it is
sensitive, say so in the issue without the details and a private channel will be
arranged.
