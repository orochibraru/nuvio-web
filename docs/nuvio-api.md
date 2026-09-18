# The Nuvio API spec

Nuvio publishes its public API as prose markdown, not as a machine-readable
document. Two scripts bridge the gap, and a daily CI job watches for drift.

## The two files

- `src/lib/nuvio/nuvio-public-api.snapshot.md` — a **verbatim copy** of the
  upstream page. It is in `.prettierignore` and excluded from the typo check:
  formatting it would make the drift check diff our own line wrapping forever,
  and upstream's typos are upstream's.
- `src/lib/nuvio/nuvio-public-api.json` — an OpenAPI 3.1 document generated from
  that snapshot.

## Drift checking

```bash
bun run nuvio:check          # compare the live spec to the snapshot
bun run nuvio:check:accept   # accept a new spec, regenerate the JSON
```

`scripts/check-nuvio-spec.ts` fetches the live spec and compares it. It fails
**only when the generated OpenAPI document moves**. A reworded or rewrapped page
is reported as a notice and left green — an "API drifted" issue raised over a
reflowed paragraph is how a drift check stops being believed.

CI runs this daily and opens an issue when it fails.

## Generating

```bash
bun run nuvio:spec           # regenerate the JSON from the snapshot
bun run nuvio:spec:check     # fail if the committed JSON is stale
```

`scripts/build-nuvio-spec.ts` parses the snapshot into OpenAPI. It is a real
parser, not an LLM: request blocks become operations, the JSON examples give
each payload its shape, and the field and parameter tables supply types,
nullability, defaults, descriptions and which fields are required.

The parser lives in `scripts/nuvio-spec/` and is unit-tested. CI runs
`nuvio:spec:check` on every PR, so a stale committed JSON fails the build.

## The generated types

`bun run nuvio:spec` writes a third file next to the JSON:
`src/lib/nuvio/nuvio-public-api.types.ts`, one request / response type pair per
operation (`getLibraryDelta` → `GetLibraryDeltaRequest`,
`GetLibraryDeltaResponse`) plus a `NuvioOperations` map. `nuvio:spec:check`
fails when it is stale, the same as for the JSON, and Biome leaves it alone so
the byte-for-byte check holds.

Two things the prose spec only says in words are recovered on the way:

- **Enums.** A field whose description is nothing but a list of values ("`movie`
  or `series`") gets that `enum`, and so does every string field of the same
  name elsewhere in the document : the spec describes `content_type` on the
  library push but not on the delta feed. "e.g." lists are examples and stay
  plain strings.
- **Which fields are there.** Request fields follow the tables' "required"
  column; response fields are all present, because response schemas are built
  from what the API's examples actually return (nullability included).

## `types.ts`, derived

`src/lib/nuvio/types.ts` no longer describes the API by hand. Most wire types
are plain aliases of the generated ones (`LibraryItem`, the three delta events,
`Profile`, `Addon`, …), and even `ContentType` and `PosterShape` are read off
them. The rest are the generated type with named fields overridden, for one of
three reasons, each said where it happens:

- the spec's table under-types what its prose allows (`avatar_id: null`, a
  `null` progress cursor, the health-check `status` values);
- the spec's example is the only evidence and is too specific (a settings blob
  typed as one client's settings) or too empty (`[]` for a supporter list);
- the app is stricter than the API on what it sends (it always names the profile
  rather than lean on the server's default of profile 1).

A `SpecContract` tuple at the bottom of `types.ts` checks each override against
the generated type in the direction that matters : what the app sends is a
request the API accepts, what the API returns fits what the app reads. When the
API changes under one of them, `bun run check` fails there.

## Workflow when the API changes

1. The daily job fails, or `bun run nuvio:check` fails locally.
2. `bun run nuvio:check:accept` updates the snapshot and regenerates the JSON.
3. Diff the regenerated JSON — that is the real change.
4. `bun run check`. The generated types moved with the spec, so any call site or
   `SpecContract` entry the change breaks is now a type error; fix those, and
   `client.ts` where a route itself changed.
5. Commit all of it together, so the snapshot and the client never disagree in
   `main`.
