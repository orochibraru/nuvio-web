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

## The hand-written client

`src/lib/nuvio/types.ts` and `client.ts` are still written by hand. The
generated JSON is what you reconcile them against, not something they are
derived from.

That is a known gap: deriving the types from the generated document would settle
it, and would also remove the file-length pressure on `types.ts`. It is on the
roadmap rather than done.

## Workflow when the API changes

1. The daily job fails, or `bun run nuvio:check` fails locally.
2. `bun run nuvio:check:accept` updates the snapshot and regenerates the JSON.
3. Diff the regenerated JSON — that is the real change.
4. Update `types.ts` and `client.ts` to match, with tests.
5. Commit all of it together, so the snapshot and the client never disagree in
   `main`.
