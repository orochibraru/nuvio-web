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

## Browsing addons

**Browse addons**, linked from Settings → Addons, lists every addon an addon
catalog advertises: Stremio's public **Community** directory (the
`addon_catalog/all/community` listing that Cinemeta serves at
`https://v3-cinemeta.strem.io`, the same list the Stremio apps show), plus any
addon catalog one of your installed addons publishes. An addon listed by several
directories shows once. The Community list is Stremio's, not a recommendation.

Search matches an addon's name and description. Filters narrow the list by
directory, by what the addon serves (catalogs, metadata, streams, subtitles) and
by content type. Installed addons carry a badge. A directory that does not
answer is named above the list, and the others still show.

Opening an addon shows its manifest, fetched by the server with the same guard
and size cap as installing it: version, description, contact, content types,
each resource with the types and id prefixes it covers, its catalogs (and
whether each takes a search, a genre or other extras), and its behaviour hints.
Adult and peer-to-peer addons carry a warning. From there you can install it,
uninstall it (with an undo), copy its manifest URL, or open its configuration
page in a new tab when it has one. An addon that requires configuration cannot
be installed as listed: configure it first and add the URL its page gives you.

An installed addon's name in Settings → Addons opens the same page. Installing
re-fetches the manifest rather than trusting the directory's copy. A directory
listing's page address encodes its public URL. An installed addon's page is
addressed by a hash of its URL instead, since that URL often carries a debrid or
API key that has no business in browser history or the access log.

## Order matters

Addons are consulted in the order you arrange them, and that order decides:

- which addon's catalogs lead the home feed,
- which addon answers first for a title's metadata,
- the default order of the source list in the player.

Drag to reorder on the Addons page. Disabling an addon leaves it installed but
takes it out of every fan-out.

The same addon can be installed twice with different configurations. Each
install keeps its own catalogs: the second one's are told apart by a `~2` suffix
on the addon id in links and home layouts.

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
loopback, link-local and other reserved ranges, and manual redirect following so
**every hop** is re-checked rather than only the first.

An addon on a private LAN address (`192.168.x.x`, `10.x.x.x`, a Tailscale
`100.x` address, an IPv6 unique-local one) loads like any other: it is your
network. An addon on `localhost` is refused, since inside the container that is
the server itself; point at the host's LAN address instead.

DNS rebinding between the check and the connection is still theoretically
possible; put an egress filter in front if that matters to you.

Addon responses are size-capped while they are read: 1 MB for a manifest, 5 MB
for a catalog, meta, stream or subtitle answer. A bigger one counts as an
invalid response, the same as malformed JSON.

## Fan-out

When a page needs several catalogs, the server requests them a few at a time
rather than all at once — a profile with a dozen providers would otherwise open
a dozen simultaneous upstream connections every time you load the home page.
Each request is time-bounded, and a provider that does not answer is simply left
out of the result. See [The addon pipeline](addon-pipeline).
