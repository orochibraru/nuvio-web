# Configuration

There is no configuration file. The container is configured entirely through
environment variables, and for a normal install the only ones that matter say
how it sits behind your reverse proxy.

## Origin

SvelteKit checks every write (any non-`GET` request) against the app's own
origin and rejects a mismatch with
`403 Cross-site remote requests are forbidden`. The published image takes that
origin from the request: the `Host` header, and **always `https://`**, since TLS
is expected to end at a proxy in front of it.

So serve it over HTTPS, behind a reverse proxy. When the proxy rewrites the
scheme, host or port, name the headers that carry the public ones:

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
| `ADDRESS_HEADER`  | the socket address     | To log the client's IP, not the proxy's |
| `PORT`            | `3000`                 | To listen on another port               |

Only trust these headers when every request reaches the server through a proxy
you control. The full list is in the
[adapter's docs](https://svelte.dev/docs/kit/adapter-bun#Environment-variables).

### Plain HTTP

Over plain HTTP (`http://localhost:3000`, a LAN address) the assumed `https://`
disagrees with the browser's `Origin` header. The app renders and reads fine,
but **nothing saves**: settings snap back, library toggles revert, progress
never sticks.

There is no runtime switch for this: SvelteKit 3 only takes a fixed origin at
build time. To run on plain HTTP, build your own image with it baked in:

```bash
docker buildx build --build-arg NUVIO_BUILD_ORIGIN=http://localhost:3000 \
  -t nuvio-web:latest .
```

`ORIGIN` from earlier releases is gone, and setting it does nothing.

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
