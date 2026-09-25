# Configuration

There is no configuration file. The container is configured entirely through
environment variables, and exactly one of them matters for a normal install.

## `ORIGIN`

**`ORIGIN` is the URL you actually browse to**: scheme, host and port, no
trailing slash.

```bash
-e ORIGIN=http://localhost:3000
-e ORIGIN=https://nuvio.example.com
```

Without it the server reconstructs its own origin from the request's `Host`
header and **assumes `https://`**. Browse to a plain-HTTP address and that guess
disagrees with the browser's `Origin` header, so SvelteKit's cross-site check
rejects every write the app makes with
`403 Cross-site remote requests are forbidden`.

Only non-`GET` requests are checked, which makes this a confusing failure rather
than an obvious one: the app still renders and reads fine, but **nothing
saves**. Settings snap back, library toggles revert, progress never sticks. Set
`ORIGIN` to exactly what is in the address bar and it goes away.

Serving over HTTPS on the default port needs none of this, because the assumed
`https://` already matches.

## Behind a reverse proxy

Either set `ORIGIN` to the public URL, or let the proxy's own headers speak for
it:

```bash
docker run -p 3000:3000 \
  -e PROTOCOL_HEADER=x-forwarded-proto \
  -e HOST_HEADER=x-forwarded-host \
  orochibraru/nuvio-web:latest
```

| Variable          | Default           | When you need it                                |
| ----------------- | ----------------- | ----------------------------------------------- |
| `ORIGIN`          | _(unset)_         | Always, unless the proxy headers below cover it |
| `PROTOCOL_HEADER` | assumes `https`   | Behind a reverse proxy                          |
| `HOST_HEADER`     | the `Host` header | Behind a proxy that rewrites it                 |
| `PORT`            | `3000`            | To listen on another port                       |

## Admin surface

The admin page is opt-in and off unless you name at least one administrator.

| Variable             | Default | What it does                                                       |
| -------------------- | ------- | ------------------------------------------------------------------ |
| `NUVIO_ADMIN_EMAILS` | _empty_ | Addresses allowed to reach `/admin`, comma or whitespace separated |
| `NUVIO_DATA_DIR`     | `data`  | Where the SQLite database lives (`/app/data` in the image)         |

Unset `NUVIO_ADMIN_EMAILS` means the admin page 404s for everybody. Addresses on
this list can always sign in, even while the instance is locked, so a bad
allowlist cannot lock you out of the page that fixes it. See
[The admin page](admin).

## Sessions

| Variable               | Default                                          | What it does                                                       |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `NUVIO_SESSION_SECRET` | generated into `<NUVIO_DATA_DIR>/session-secret` | Signs the session cookie, and (derived) encrypts the stored tokens |

Sessions live on the server, in the SQLite database in `NUVIO_DATA_DIR`. The
browser's cookie holds only a signed session id; the Nuvio access and refresh
tokens stay in the database, encrypted (AES-256-GCM, key derived from the
secret). That is what lets the server refresh a user's tokens, and sync their
data, while no browser tab is open. A session unused for 30 days is dropped.

So **mount a volume on the data directory**: without one, every redeploy signs
everyone out. The database must be writable, or nobody can sign in. Run one
instance per data directory: token refreshes are serialized inside the process,
and two processes sharing the database could each spend the same rotating
refresh token.

Leave the variable unset on a single container: the first boot writes a random
key to `session-secret` in the data directory (mode `0600`) and every later boot
reuses it. Set it explicitly (32+ characters, for example
`openssl rand -hex 32`) when the secret must not live next to the database. A
value shorter than 32 characters **fails at boot**. Changing or losing the key
signs every user out (the stored tokens can no longer be decrypted); nothing
else is lost.

## Logging

| Variable           | Default                              | Values                        |
| ------------------ | ------------------------------------ | ----------------------------- |
| `NUVIO_LOG_LEVEL`  | `debug` in dev, `info` in production | `debug` `info` `warn` `error` |
| `NUVIO_LOG_FORMAT` | `console`                            | `console`, `json`             |

`console` is colorized and meant for `docker logs`. `json` emits one object per
line for a log shipper. An unrecognised value **fails at boot** rather than
being quietly ignored.

## How variables are declared

Environment variables go through SvelteKit's explicit environment variables
(`experimental.explicitEnvironmentVariables`). Each name is declared in
`src/env.ts` and imported by name from `$app/env/private`; an undeclared name is
not readable at all. They are deliberately non-`static`, so the container reads
them at boot instead of having a build-time value inlined. Adding a variable
means adding it to `src/env.ts` first.
