# Architecture

SvelteKit 3 on Svelte 5 runes, Tailwind 4 and shadcn-svelte, running on Bun and
compiled to a single binary.

## The shape of a request

```text
Request
  → hooks.server.ts
      build this request's service scope
      read the session cookie, refresh it if expired
      evict the session if the instance is locked
      put nuvio client + session + profile on event.locals
  → route guard (requireProfile / requireAdmin)
  → +layout.server.ts   awaited: profile gate, theme seed
  → +page.server.ts     streamed: promises, not awaited
  → render the shell, stream each promise as it settles
  → apply security headers, log, dispose the scope
```

The scope is disposed in a `finally`, so the request's instances go even when
the response threw. Process-wide singletons on the parent container are
untouched.

## Streamed loads

`+page.server.ts` does not `await`. It returns promises:

```ts
export const load: PageServerLoad = ({ locals, fetch }) => {
  const nuvio = locals.nuvio.withFetch(fetch);
  return {
    library: pullLibraryItems(nuvio, profileId),
    resume: pullContinueWatching(nuvio, profileId, metaLookup).catch(() => []),
    rows: homeCatalogRows().catch(() => null),
  };
};
```

Navigation completes on the shell, and each row fills in behind its own
skeleton. Components bridge a streamed promise to reactive state with
`streamed()` from `#lib/core/stream.svelte.ts`, reading `.current` and `.ready`.

Three rules keep this honest:

- **Every pull catches** to an empty or default value. A rejected streamed
  promise would otherwise surface as an unhandled rejection in the console.
- **No `Promise.all`.** Fan-out goes through `pooledMap`, which caps
  concurrency.
- **The load's own `fetch`.** `locals.nuvio.withFetch(fetch)` lets SvelteKit
  dedupe and inline the response.

`+layout.server.ts` may still `await`: it does not re-run on client navigation,
`parent()` consumers cannot take a streamed promise, and the profile gate and
theme seed need a resolved value. They stay bounded all the same.

## Page data belongs in the load

Anything a page needs to render for its current URL — catalog rows, a title's
metadata, search results — is fetched **by the load, from the route params**,
and streamed down. Addon fan-out included.

A client-side query for that data costs a full extra round trip that can only
_start_ once the page has shipped and hydrated, and makes first paint hostage to
the device.

**Remote functions** are therefore reserved for client-initiated work: a button,
a right-click action, "load more". `form` and `command` for mutations, `query`
for data a _user gesture_ asks for after the page is up. Never for a page's own
initial data.

## Layout of `src/lib`

Every module has one home, and the home says what kind of thing it is.

| Directory     | What lives there                                              |
| ------------- | ------------------------------------------------------------- |
| `core/`       | Small stateless helpers belonging to no feature               |
| `components/` | Shared UI, grouped by what it renders                         |
| `player/`     | Everything the video player is, and nothing else              |
| `watch/`      | The domain _around_ the player: picking a title and a source  |
| `services/`   | Stateful infrastructure, wired through a container            |
| `server/`     | Server-only leftovers: route guards, `safe-fetch`             |
| feature dirs  | `addons/` `nuvio/` `sync/` `settings/` `library/` and friends |

Inside a feature the file suffix is the contract:

- `*-data.ts` — a plain server helper a load can call
- `*.remote.ts` — client-initiated only, and **may export nothing else**
- `*.svelte.ts` — runes state
- `*.test.ts` — sits next to what it tests

Nothing lives at the root of `src/lib` except the `#lib` barrel and `utils.ts`.
When a new module does not obviously belong to a feature, that is a signal it is
`core/` — not a signal to drop it at the root.

Imports go through the `#lib` subpath (SvelteKit 3 dropped the `$lib` alias),
and every internal link goes through `resolve` from `$app/paths` so a renamed or
deleted route fails type-checking instead of 404ing at runtime.

## Deployment

[`svelte-smol`](https://github.com/orochibraru/svelte-smol) compiles the built
app, Bun runtime embedded, into a self-contained server binary. The runtime
image is `debian:slim` plus that binary — no Bun, no `node_modules`, and a
health-check binary alongside it.
