# Troubleshooting

## Nothing saves: settings revert, library toggles snap back

Almost always `ORIGIN`.

Without it the server assumes `https://` and reconstructs its origin from the
`Host` header. Browse to a plain-HTTP address and that guess disagrees with the
browser's `Origin` header, so SvelteKit's cross-site check rejects every write
with `403 Cross-site remote requests are forbidden`. Only non-`GET` requests are
checked, which is why the app looks fine until you try to change something.

Set `ORIGIN` to exactly what is in the address bar — scheme, host and port, no
trailing slash. Behind a proxy, set `PROTOCOL_HEADER` and `HOST_HEADER` instead.
See [Configuration](configuration).

## The home feed is empty

You have no addons, or none of them serve a catalog. Add one from **Settings →
Addons**; see [Addons](addons).

The page distinguishes the two cases: "no titles yet" offers to add an addon,
"couldn't reach your addons" offers a retry.

## An addon shows as unreachable

The Addons page shows the error it got. Common causes:

- **The addon is down.** The page re-checks every five seconds, so a transient
  outage clears itself.
- **A private address.** The SSRF guard refuses loopback, private and link-local
  addresses. An addon on `localhost` or a `192.168.x.x` LAN address will not
  load. Put it behind a public name that resolves to a public address.
- **A bad manifest.** The app needs a manifest it can parse with an id, a name,
  and a resource list.

## The video is black, or has no sound

The player probes a stream's codec before handing it to `<video>` and raises a
banner when playback decodes no frames or produces no audio. That banner names
the real cause:

- **No frames** — usually HEVC or AV1 that this browser cannot decode. Try
  another source from the drawer, or open it in an external player.
- **No audio** — usually Dolby Digital, DTS or Atmos. Browsers do not decode
  these. Same fix.

This is a limit of what browsers decode, not something the app can work around.

## Casting does not appear

Casting uses the standard Remote Playback API, which needs Chrome or Edge for
Chromecast, or Safari for AirPlay. It also requires a secure context: over plain
HTTP on a non-localhost address, the browser does not expose it. Serve over
HTTPS.

## Skip intro never shows

TheIntroDB has no data for that title yet, the content id could not be mapped,
or you hit the keyless tier's rate limit. All three resolve to "no segments" and
the player just omits the affordance. Adding your own API key in **Settings →
Integrations** raises the limits.

## The sign-in log is empty after a restart

No volume mounted at `/app/data`. The admin database resets with the container.
See [Install](install).

If it was never populated at all, check the logs for a line about the admin
database being unavailable — an unwritable directory degrades the feature rather
than failing the app.

## The admin page 404s for me

`NUVIO_ADMIN_EMAILS` does not include your address. The 404 is deliberate: the
admin surface does not announce itself. Check the spelling, and note that
matching is case-insensitive.

## Reading the logs

```bash
docker logs -f <container>
```

Set `NUVIO_LOG_LEVEL=debug` for more, or `NUVIO_LOG_FORMAT=json` to ship them
somewhere. Each request logs method, path, status and duration; a 5xx logs at
error with an error id you can match to the id shown in the browser.
