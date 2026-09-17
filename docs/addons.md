# Addons

An addon is an HTTP service that publishes a manifest and answers requests for
catalogs, metadata, streams and subtitles. Nuvio Web speaks the Stremio addon
protocol, which is the same protocol Nuvio uses on mobile.

**Addons are yours.** They are installed on your Nuvio account, so an addon
added here shows up on your phone and vice versa. Nuvio Web neither ships nor
recommends any addon, and does not verify what one returns. Use only addons you
have the right to use in your jurisdiction.

## Installing one

From the **Addons** page, or **Settings → Addons**:

1. Paste the addon's URL. Either the manifest URL or the base URL works — the
   app normalizes it.
2. The app fetches the manifest and shows you a preview: the addon's name,
   description, logo, and which content types it serves.
3. Install it.

Some addons publish an **addon catalog** — a catalog of other addons. Where one
is available you can browse and install from it without leaving the page.

## Order matters

Addons are consulted in the order you arrange them, and that order decides:

- which addon's catalogs lead the home feed,
- which addon answers first for a title's metadata,
- the default order of the source list in the player.

Drag to reorder on the Addons page. Disabling an addon leaves it installed but
takes it out of every fan-out.

## When an addon is unreachable

A failed addon degrades to an empty row rather than failing the page. The Addons
page marks it unreachable and shows the error, and re-checks every five seconds
while anything is failing, so a transient outage recovers without a manual
reload.

A manifest that loads is cached for thirty minutes. The set of addons for a
profile is cached for a minute — or five seconds while any of them is failing.

## What the server does with an addon URL

Addon URLs are user-supplied, and the server fetches them, so every outbound
addon request goes through an SSRF guard: a scheme allowlist, a block on
loopback, private, link-local and other reserved ranges, and manual redirect
following so **every hop** is re-checked rather than only the first.

This means an addon running on `localhost` or on a private LAN address is
refused. That is deliberate — it is the same check that stops a hostile addon
URL from making your server probe its own network. If you need a LAN addon, put
it behind a public name that resolves to a public address.

DNS rebinding between the check and the connection is still theoretically
possible; put an egress filter in front if that matters to you.

## Fan-out

When a page needs several catalogs, the server requests them a few at a time
rather than all at once — a profile with a dozen providers would otherwise open
a dozen simultaneous upstream connections every time you load the home page.
Each request is time-bounded, and a provider that does not answer is simply left
out of the result. See [The addon pipeline](addon-pipeline).
