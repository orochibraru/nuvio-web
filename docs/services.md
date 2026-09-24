# Services and the container

`src/lib/services/` holds the things that own state, dependencies, or a
lifecycle: the database handle, the logger, the session cookie and the
server-side session store behind it, the admin allowlist, the request budget,
the people lookup.

Each is a class taking its collaborators as constructor arguments, registered
against a token and resolved from a `Container`.

## Two composition roots, and they must not meet

- **`services/server.ts`** reads `$app/env/private` and is server-only. It
  registers the logger, the database, the admin allowlist, the session secret,
  the session store (which also serves `NUVIO_TOKENS`), the session service, and
  the user-data services.
- **`services/browser.ts`** is what the client bundles: the request budget, the
  people lookup.

`services/index.ts` deliberately re-exports **neither** container's env-reading
module. Import the root you need directly. Adding `export * from "./server.ts"`
to the barrel would pull private env into the browser build.

The same applies to `database.service.ts`, which imports `bun:sqlite` and
`node:fs`. The `DATABASE` token _is_ exported from the barrel — it references
`DatabaseService` only as a type, which is erased on emit.

## Scope is the load-bearing part

A registration is one of two things:

- **`singleton`** — one for the life of the container. The database, the logger,
  the admin allowlist.
- **`scoped`** — one per request. Anything holding request state.

`hooks.server.ts` builds one scope per request with `createRequestScope(event)`,
hangs it on `event.locals.services`, and disposes it in a `finally`. Server code
reaches services through `locals.services.get(TOKEN)`; in a remote function that
is `getRequestEvent().locals.services`, and the guards in
`#lib/server/guards.ts` already do it for you.

**Resolving a `scoped` service from the root container throws.** That is on
purpose. A request-scoped service resolved once at module level would be shared
by every visitor, which for `SessionService` means one person's cookies
answering another person's page.

The same rule catches the captive-dependency mistake, since a singleton's
factory resolves against the root — a singleton cannot accidentally capture a
per-request collaborator and hold it forever.

Both are covered in `container.test.ts`. Do not relax them to make something
resolve; if a thing needs request state, it is `scoped`, and its consumer needs
a scope.

## Browser singletons

Module-level singletons are safe on the client in a way they are not on the
server: none of them hold user-specific state, and the request budget only means
anything if every caller shares one.

- **`RequestBudget`** caps concurrent outbound browser fetches (six), so a cast
  list of thirty people does not open thirty connections.
- **`PeopleService`** memoises Wikipedia summaries for cast and crew. There used
  to be a third, a `localStorage` TTL cache layered over SvelteKit's own. It was
  deleted: nothing ever primed it, so it cached nothing and its `clear()` was
  never called.

If the need comes back — SvelteKit's cache is reference-counted and drops a
result the moment nothing on screen holds it, so navigating away and back
re-fans-out to every addon — note what the old one got wrong. Its key folded in
the profile _index_, which is 1..6 within one account and therefore not an
identity; it has to be scoped by account too, the way `syncOwner` does for the
sync store. See [The sync store](sync-store).

## What is not a service

Pure transforms stay plain functions and stay unit-tested as such: `#lib/core/`
(`images`, `motion`, `url`, `pool`), `sync/reconcile.ts`, `player/format.ts`,
`watch/stream-format.ts`, `addons/catalog-queries.ts`.

A class earns its place by having state to encapsulate or a collaborator to
inject. Wrapping a pure function in one buys ceremony and nothing else.

## Testing a service

Construct it with fakes, or `provide()` them into a throwaway container:

```ts
const services = new Container("test").provide(SESSION, fakeSession);
```

Prefer that to `vi.mock` of a module path. `session.service.test.ts` and
`auth.remote.test.ts` show both shapes, and the DI removed several `vi.mock`
calls that existed only to stub module-level state.
