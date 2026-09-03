# Nuvio web

`TODO.md` is the authoritative build plan. Keep it current as work lands.

## Conventions

- **Always brace control statements.** `if (x) { return; }` : never
  `if (x) return;` on one line, never a braceless body. Same for `for` / `while`
  / `else`. Enforced by Biome (`style/useBlockStatements: error`); its fix is
  "unsafe" so `bun run lint:fix` won't add the braces for you : write them.
- Package manager is **bun**. `bun run lint` / `lint:fix` / `check`. Never
  npx/npm.
- **`#lib` subpath imports** (SvelteKit 3 dropped the `$lib` alias). Configured
  in `package.json` `imports`. `$app/*` / `$env` → `$app/env` still work as
  before. Extensions are explicit, and which one you write depends on the form:
  **`#lib/…` always ends `.js`** (`#lib/core/pool.js`, `#lib/foo/index.js`) :
  the alias isn't rewritten on emit, so a `.ts` there fails `bun run check`; **a
  relative import ends `.ts`** (`./stream-format.ts`), naming the real file.
  Reach for a relative import only inside the same directory : anything crossing
  a directory goes through `#lib/…`, so a future move is one find-and-replace.
- **Every internal link goes through `resolve` from `$app/paths`.** `href`,
  `goto(...)`, `redirect(...)`, `depends(...)` targets : all of them. SvelteKit
  3 type-checks both forms against the route table, so either fails
  `bun run check` on a renamed/deleted route. Use the pathname form **without a
  leading slash** (`resolve('detail/' + type + '/' + id)`,
  `resolve('discover')`) or the route-id form with params
  (`resolve('/(protected)/(app)/(watch)/detail/[type]/[id]', { type, id })`).
  Prefer the pathname form : it's shorter and route groups don't leak into it.
  The site root is `resolve('/(protected)/(app)')` (there is no bare `/` route).
  Only external URLs (`https://…`, `vlc://…`, provider deep links) skip
  `resolve`.
- `redirect()` / `error()` from `@sveltejs/kit` **throw on their own** : call
  them bare (`redirect(303, resolve('profiles'))`), never `throw redirect(...)`.
- **`+page.server.ts` loads don't `await` : they stream.** Return the promises
  from `*-data.ts` helpers directly (`return { items: pullX(nuvio, id) }`);
  navigation completes on the shell and the page fills in behind a skeleton.
  Bridge each streamed promise to reactive state with `streamed()` from
  `#lib/core/stream.svelte.ts` (`.current` / `.ready`). Use
  `locals.nuvio.withFetch(fetch)` (the load's own `fetch`), a plain `*-data.ts`
  helper (never a remote `query`), `.catch()` every pull to an empty/default,
  and **no `Promise.all`** (use `pooledMap` from `#lib/core/pool.ts` for
  fan-out).
- **Page data belongs in the load : including addon fan-out.** Anything the page
  needs to render for the current URL (catalog rows, a title's meta, search
  results) is fetched by the load from the route params / query string and
  streamed down. A client `query` for that costs the page a full extra round
  trip that can only _start_ once the page has shipped and hydrated, and makes
  first paint hostage to the device. The addon-touching helpers live in
  `#lib/addons/catalog-queries.ts` (pure, client injected : unit-tested) with
  request-scoped wrappers in `#lib/addons/server.ts`.
- `+layout.server.ts` loads may still `await` : they don't re-run on client
  navigation, `parent()` consumers can't take a streamed promise, and the
  profile gate / theme seed need the resolved value. Keep them bounded
  (`withFetch`, `.catch`, no `Promise.all`).
- Remote functions are for **client-initiated** work only : a button, a
  right-click action, "Load more": `form` / `command` mutations, and `query`
  functions for data a _user gesture_ asks for after the page is up. Never for
  the page's own initial data.
- **Anything that crosses structured clone gets `$state.snapshot()` first** —
  `BroadcastChannel.postMessage` and IndexedDB both throw on a `$state` proxy,
  and records reaching the sync store may come from a page that read them out of
  a streamed load (see `store.svelte.ts`'s `#broadcast` / `#persist`).
- A `.remote.ts` file may export **only** remote functions : put schemas / types
  / constants / server data-helpers in a sibling `*.ts` (see
  `#lib/settings/settings-data.ts`).

## Layout of `src/lib`

Every module has one home, and the home says what kind of thing it is. Nothing
lives at the root of `src/lib` except `index.ts` (the `#lib` barrel : don't grow
it) and `utils.ts` (pinned there by `components.json`; `cn` and the shadcn
prop-type helpers only).

- **`core/`** : small, stateless, cross-cutting helpers that belong to no
  feature : `pool.ts` (`pooledMap`), `stream.svelte.ts` (`streamed()`),
  `title.svelte.ts` (`pageTitle`), `motion.ts`, `images.ts`, `url.ts`
  (`httpUrlOrNull`). If a helper needs to know about addons, playback, or the
  Nuvio API, it isn't `core/`; if it owns state or a dependency, it's a service,
  not a `core/` function.
- **`components/`** : shared UI, grouped by what it renders. `media/` (poster,
  row, grid, hero, cast, ratings, a title's cards), `chrome/` (app shell :
  command palette, banners, notices, avatar), `layout/` (presentational shells :
  `scroll-rail`, `aurora-background`), `feedback/` (`empty-state`,
  `query-error`), and `ui/` : the shadcn-svelte primitives, **CLI-managed, don't
  hand-edit or move them**.
- **`player/`** : everything the video player is, and nothing else.
  `components/` (its Svelte UI), `state/` (its `.svelte.ts` controllers), and
  pure logic at the top level (`format.ts`, `keymap.ts`, `codec-support.ts`,
  `segments.ts`, …) so it stays unit-testable. Names aren't prefixed `player-` :
  the directory already says it.
- **`watch/`** : the watch domain _around_ the player : picking a title and a
  source. Page-load helpers (`watch-data.ts`), the source drawer
  (`stream-panel.svelte`, `sources-panel.svelte.ts`), the detail page's playback
  context, watch providers, and the `playback.svelte.ts` handoff that hands a
  chosen stream from the drawer to the player.
- **`services/`** : the app's stateful infrastructure, as classes wired through
  a container. See "Services" below.
- **Feature directories** (`addons/`, `nuvio/`, `sync/`, `settings/`,
  `library/`, `collections/`, `history/`, `stats/`, `admin/`, `system/`,
  `search/`) own their own data helpers, remote functions, and types.
  **`server/`** holds what's left that is server-only and isn't a service: the
  route guards and `safe-fetch`.

Inside a feature the file suffix is the contract : `*-data.ts` is a plain server
helper a load can call, `*.remote.ts` is client-initiated only, `*.svelte.ts`
holds runes state, `*.test.ts` sits next to what it tests.

When a new module doesn't obviously belong to a feature, that's a signal it's
`core/` : it is not a signal to drop it at the root.

## Services

`src/lib/services/` holds the things that own state, dependencies, or a
lifecycle : the database handle, the logger, the session cookies, the admin
allowlist, the request budget, the people lookup, the query cache. Each is a
class taking its collaborators as constructor arguments, registered against a
token and resolved from a `Container`.

**Two composition roots, and they must not meet.** `services/server.ts` reads
`$app/env/private` and is server-only; `services/browser.ts` is what the client
bundles. `services/index.ts` deliberately re-exports neither of those
containers' env-reading module : import the root you need directly. Adding a
`export * from "./server.ts"` to the barrel would pull private env into the
browser build.

**Scope is the load-bearing part.** A registration is `singleton` (one for the
life of the container : the database, the logger) or `scoped` (one per request :
anything holding request state). `hooks.server.ts` builds one scope per request
with `createRequestScope(event)`, hangs it on `event.locals.services`, and
disposes it in a `finally`. Server code reaches services through
`locals.services.get(TOKEN)` : in a remote function that's
`getRequestEvent().locals.services`, and the guards in `#lib/server/guards.ts`
already do it for you.

**Resolving a `scoped` service from the root container throws.** That is on
purpose: a request-scoped service resolved once at module level would be shared
by every visitor, which for `SessionService` means one person's cookies
answering another person's page. The same rule catches the captive-dependency
mistake, since a singleton's factory resolves against the root. Both are covered
in `container.test.ts` : don't relax them to make something resolve.

**What is not a service.** Pure transforms stay plain functions and stay
unit-tested as such : `#lib/core/` (`images`, `motion`, `url`, `pool`),
`sync/reconcile.ts`, `player/format.ts`, `watch/stream-format.ts`,
`addons/catalog-queries.ts`. A class earns its place by having state to
encapsulate or a collaborator to inject; wrapping a pure function in one buys
ceremony and nothing else.

**Testing.** Construct the class with fakes, or `provide()` them into a
throwaway `Container` : `new Container("test").provide(SESSION, fake)`. Prefer
that to `vi.mock` of a module path : `session.service.test.ts` and
`auth.remote.test.ts` show both shapes, and the DI removed several `vi.mock`
calls that only existed to stub module-level state.

## Verifying UI changes

`bun run check` and `bun run lint` are necessary but not sufficient : they don't
catch runtime errors (bad reactive access, hydration mismatch, a broken remote
call). **After any UI or route change, run `bun run test:e2e`** (Playwright, in
`e2e/`) and make it pass before calling the work done. Add a spec when you add a
screen or a flow. Needs `NUVIO_TEST_EMAIL` / `NUVIO_TEST_PASSWORD` in `.env`
(see `.env.example`). Playwright runs against a **production build on :3000**
(`bun run build && bun run start`), not `vite dev` : a cold dev-server compile
made the run flaky. It reuses an existing server on :3000 and starts one
otherwise, so your `bun run dev` on :5173 is untouched either way.

**Zero console errors.** Every spec that loads a page uses
`collectRuntimeErrors` (`e2e/errors.ts`) and asserts `errors` is empty : an
uncaught exception or a genuine `console.error` fails the test. Don't relax this
by widening the `IGNORE` list; fix the error. The only pre-approved ignores are
third-party asset 404s (posters, favicons, `net::ERR_`). A page with a playing
`<video>` never reaches `networkidle`, so bound that wait
(`waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})`) and give
async errors a `waitForTimeout` beat before asserting.

The e2e run shares **one** auth token across all specs (`e2e/auth.ts` memoises
the password grant) : the real `api.nuvio.tv` rate-limits (429). Don't re-run
the full suite gratuitously; run the specific spec you touched.

`e2e/a11y.spec.ts` runs **axe** (`@axe-core/playwright`) over every main route
and a couple of open-overlay states, asserting zero WCAG 2 A/AA violations, plus
skip-link + focus-on-nav checks. New screens go in its `pages` list; fix what it
flags rather than filtering rules.

`bun run test:unit` (Vitest, node env, `src/**/*.test.ts`) covers
framework-agnostic logic : currently `src/lib/sync/reconcile.ts`. Keep the sync
reconcile pure and tested.

## Sync store

`src/lib/sync/store.svelte.ts` exports `sync`, a local-first mirror of library /
watch-progress / history (IndexedDB + optimistic write queue + background delta
pull). Components read `sync.ready ? sync.X : data.X` and write through `sync.*`
(no more direct `toggleLibrary` / `saveProgress` / `deleteHistory` remote calls
from pages). Reactive reads must go through the published `$state` arrays
(`sync.library` etc.), never the private maps. `+page.server.ts` loads stay for
SSR.
