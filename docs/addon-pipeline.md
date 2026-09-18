# The addon pipeline

From "this profile has some addon URLs" to "this page has rows".

## Registry

`addons/registry.ts` turns the profile's addon rows into an `AddonRegistry`:
enabled addons only, sorted by the order you arranged them, each with its
fetched manifest.

The registry is the thing that answers "who serves this?".
`providersFor( resource, type, id)` filters addons by what their manifest claims
— a resource, the content types it covers, and its id prefixes — so a
`tt`-prefixed IMDb id never goes to an addon that only serves `kitsu:` ids.

A manifest that fails to load produces an `AddonLoadError` rather than taking
the registry down. The addon is left out; the others work.

## Caching

| Cache    | Key                   | TTL                                   |
| -------- | --------------------- | ------------------------------------- |
| Manifest | addon base URL        | 30 minutes                            |
| Registry | **account** + profile | 60s, or 5s while any addon is failing |

The registry cache is process-wide, so its key has to identify the account and
not just the profile. `profileId` is the profile _index_, 1..6 within one Nuvio
account, so on an instance with more than one account — which `/admin` exists to
support — keying on it alone served account B account A's addons, catalogs and
streams for the length of the TTL. Invalidation is per-entry for the same
reason: one person editing their addons should not re-fan-out everyone else's
next page.

The shorter retry TTL is what makes a transient addon outage recover in seconds
rather than up to a minute, and it is why the Addons page can usefully re-poll.

## Client

`addons/client.ts` is the request layer. It takes the registry and a `fetch`,
and every outbound request goes through `safeFetch` — see [Security](security).

Fan-out is capped at six simultaneous upstream requests. Addon responses are
normalized defensively: an entry missing what installing it needs (a URL), or
what displaying it needs (an id and a name), is dropped rather than rendered.

## Queries

`addons/catalog-queries.ts` holds the orchestration — home rows, search across
catalogs, "more like this", a catalog page, a title's metadata — as **pure
functions taking an injected client**. They reach for no request context, so
they are unit-tested against a fake.

Home fetches up to eight catalogs (sixteen once the user has arranged them in
Settings → Home), four at a time: fetching all of them at once is a burst at
whichever addons serve them.

## Request-scoped wrappers

`addons/server.ts` is the thin layer the loads actually call. Each wrapper grabs
this request's client and delegates:

```ts
export async function homeCatalogRows(): Promise<HomeRow[]> {
  const { client, registry } = await getAddonClient();
  return queries.homeCatalogRows(client, registry);
}
```

Loads call these directly and **stream** the result — never awaited in the load
itself — so addon fetches start server-side instead of after the page has
shipped, hydrated, and made a second round trip.

## Why pooling rather than `Promise.all`

A profile with a dozen stream providers would otherwise open a dozen
simultaneous upstream connections on every page load. `pooledMap` from
`#lib/core/pool.ts` caps the width while preserving input order:

```ts
const rows = await pooledMap(catalogs, 4, async (catalog) => fetchRow(catalog));
```

`pool.ts` also carries `settleAll` (every task must succeed, throws an
`AggregateError` otherwise) and `settleSome` (returns results _and_ errors, for
best-effort fan-out where some providers are expected not to answer).

Addon fan-out is `settleSome` territory. A batch write where a partial result
would leave inconsistent state is `settleAll` territory.

## Where to add things

| You want to...                           | Touch                                   |
| ---------------------------------------- | --------------------------------------- |
| Add a new kind of addon query            | `catalog-queries.ts`, pure, with a test |
| Expose it to a load                      | A wrapper in `server.ts`                |
| Change how addons are ranked or filtered | `registry.ts`                           |
| Change transport, retries, normalization | `client.ts`                             |
| Change what a manifest is allowed to be  | `manifest.ts`                           |
