# Configuration

There is no configuration file. The container is configured entirely through
environment variables, and for a normal install the only ones that matter say
how it sits behind your reverse proxy.

## Origin

SvelteKit checks every write (any non-`GET` request) against the app's own
origin and rejects a mismatch with
`403 Cross-site remote requests are forbidden`. The published image takes that
origin from the request: the host from the `Host` header, and the scheme the
browser's own `Origin` header names when it is for that same host (a patch on
the adapter, in `patches/`), else `https://`. So the same image works on any
URL, `http://localhost:3000` and a LAN address included, with nothing to
configure.

When a reverse proxy rewrites the scheme, host or port, name the headers that
carry the public ones:

```bash
docker run -p 3000:3000 \
  -e PROTOCOL_HEADER=x-forwarded-proto \
  -e HOST_HEADER=x-forwarded-host \
  orochibraru/nuvio-web:latest
```

| Variable          | Default                | When you need it                        |
| ----------------- | ---------------------- | --------------------------------------- |
| `PROTOCOL_HEADER` | assumes `https`        | Behind a reverse proxy                  |
| `HOST_HEADER`     | the `Host` header      | Behind a proxy that rewrites the host   |
| `PORT_HEADER`     | the `Host` header port | Behind a proxy that rewrites the port   |
| `ADDRESS_HEADER`  | the socket address     | To see the client's IP, not the proxy's |
| `PORT`            | `3000`                 | To listen on another port               |

Sign-in and sign-up are throttled per client address (10 attempts per 15
minutes) and per email (5). Behind a proxy without `ADDRESS_HEADER` (for example
`x-forwarded-for`), every visitor shares the proxy's address and so one budget:
set it (with `XFF_DEPTH` when more than one proxy appends to `x-forwarded-for`).

Only trust these headers when every request reaches the server through a proxy
you control. The full list is in the
[adapter's docs](https://svelte.dev/docs/kit/adapter-bun#Environment-variables).

A request from another site carries that site's `Origin`, which never names this
host, so the cross-site check still refuses it.

`ORIGIN` and `NUVIO_BUILD_ORIGIN` from earlier releases are gone, and setting
them does nothing.

### Shutdown

On `SIGTERM` or `SIGINT` the server stops taking connections, waits for the
requests in flight, lets a running background Nuvio sync finish, then closes the
database. An open tab keeps its live-update stream open until the
`SHUTDOWN_TIMEOUT` deadline (8 seconds in the image, inside the 10 that
`docker stop` waits before killing the container); the tab reconnects on its
own.

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

## Backend

Accounts come from the official Nuvio API (`api.nuvio.tv`) unless an admin sets
another default backend on the admin page's **Backends** tab: a self-hosted
Supabase-style backend with the same API, reachable by URL plus its publishable
(anon) key. That setting lives in the database, not in the environment, so it
needs no redeploy.

The admin can also let users bring their own backend. Then the sign-in and
sign-up forms grow a collapsed **Custom backend** section: a backend URL and its
publishable key, remembered in that browser (clear them with **Reset to
default**), and the form says which host you are signing in through. Leave the
URL empty to use the instance default. The key is required: a Supabase gateway
refuses requests without one, and the official key is never sent anywhere but
the official API.

Data on this server (library, progress, history) is kept per backend, so the
same account id on two backends is two different people here. A custom backend
must be reachable on a public address from the server; one on your LAN can only
be the admin-set default. See [Security](security) for the rest.

This server can also be the backend: its built-in one answers at
`<ORIGIN>/api/nuvio` with a publishable key shown on the admin page. Nothing to
configure; its tokens are signed with a key derived from the session secret, so
rotating `NUVIO_SESSION_SECRET` signs its users out too. See
[the admin page](admin#built-in-backend).

## Sessions

| Variable               | Default                                          | What it does                                                       |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `NUVIO_SESSION_SECRET` | generated into `<NUVIO_DATA_DIR>/session-secret` | Signs the session cookie, and (derived) encrypts the stored tokens |

Sessions live on the server, in the SQLite database in `NUVIO_DATA_DIR`. The
browser's cookie holds only a signed session id; the Nuvio access and refresh
tokens stay in the database, encrypted (AES-256-GCM, key derived from the
secret). That is what lets the server refresh a user's tokens, and sync their
data, while no browser tab is open. A session unused for 30 days is dropped.

The SMTP password set on the admin page is encrypted with another key derived
from the same secret. Changing the secret signs everyone out and makes that
password unreadable: save it again on the admin page.

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

## Error reporting

| Variable           | Default | Values                       |
| ------------------ | ------- | ---------------------------- |
| `NUVIO_SENTRY_DSN` | unset   | a Sentry (or compatible) DSN |

Set, the browser reports uncaught client errors to it (no tracing, no replay, no
PII), tagged with the `errorId` the error page shows. Unset, client errors only
reach the browser console. It is the one `public` variable: the browser needs
it, and a DSN is not a secret.

## How variables are declared

Environment variables go through SvelteKit's explicit environment variables
(`experimental.explicitEnvironmentVariables`). Each name is declared in
`src/env.ts` and imported by name from `$app/env/private`; an undeclared name is
not readable at all. They are deliberately non-`static`, so the container reads
them at boot instead of having a build-time value inlined. Adding a variable
means adding it to `src/env.ts` first.
