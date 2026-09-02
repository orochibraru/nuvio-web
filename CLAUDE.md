# Nuvio web

`TODO.md` is the authoritative build plan. Keep it current as work lands.

## Conventions

- **Always brace control statements.** `if (x) { return; }` : never
  `if (x) return;` on one line, never a braceless body. Same for `for` / `while`
  / `else`. Enforced by Biome (`style/useBlockStatements: error`); its fix is
  "unsafe" so `bun run lint:fix` won't add the braces for you : write them.
- Package manager is **bun**. `bun run lint` / `lint:fix` / `check`. Never
  npx/npm.
- **`#lib` subpath imports** (SvelteKit 3 dropped the `$lib` alias). Explicit
  extensions, barrels as `#lib/foo/index.js`. Configured in `package.json`
  `imports`. `$app/*` / `$env` → `$app/env` still work as before.
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
  `#lib/stream.svelte.ts` (`.current` / `.ready`). Use
  `locals.nuvio.withFetch(fetch)` (the load's own `fetch`), a plain `*-data.ts`
  helper (never a remote `query`), `.catch()` every pull to an empty/default,
  and **no `Promise.all`** (use `pooledMap` from `#lib/pool.ts` for fan-out).
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

## Verifying UI changes

`bun run check` and `bun run lint` are necessary but not sufficient : they don't
catch runtime errors (bad reactive access, hydration mismatch, a broken remote
call). **After any UI or route change, run `bun run test:e2e`** (Playwright, in
`e2e/`) and make it pass before calling the work done. Add a spec when you add a
screen or a flow. Needs `NUVIO_TEST_EMAIL` / `NUVIO_TEST_PASSWORD` in `.env`
(see `.env.example`). Playwright **reuses your running `bun run dev` on :5173**
(`reuseExistingServer`), only starting one if nothing's listening : never kill
the dev server to run tests.

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
