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
- **Address blocks** — loopback, private, link-local, carrier-grade NAT,
  benchmark, multicast and reserved ranges, for both IPv4 and IPv6, including
  both spellings of an IPv4-mapped IPv6 address.
- **Manual redirect following**, so every hop is re-checked rather than only the
  first.

DNS rebinding between check and connect is still possible in principle. Put an
egress filter in front if that is in your threat model.

Addon responses are treated as untrusted data throughout: an entry missing what
installing it needs, or what displaying it needs, is dropped rather than
rendered.

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
`NUVIO_ADMIN_EMAILS`.

Guards run in **loads and in remote functions independently**. A remote function
never assumes the page that called it was guarded.

## Reporting something

Open an issue on
[the repository](https://github.com/orochibraru/nuvio-web/issues). If it is
sensitive, say so in the issue without the details and a private channel will be
arranged.
