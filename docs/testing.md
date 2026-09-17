# Testing

Three levels, each with a different job.

```bash
bun run test:unit    # vitest, node env, src/**/*.test.ts
bun run test:e2e     # playwright, chromium
```

## Unit tests

Vitest, node environment, `*.test.ts` sitting next to what it tests.

This level covers the framework-agnostic logic — the parts where a subtle bug is
invisible in a screenshot:

- `sync/reconcile.ts` — merge order and conflict resolution
- `watch/stream-format.ts` — parsing quality, codec, size out of addon labels
- `player/codec-support.ts`, `player/external-player.ts` — probes and deep links
- `addons/catalog-queries.ts` — orchestration, against a fake client
- `services/container.ts` — scope rules, including the ones that must throw
- `server/safe-fetch.ts` — the SSRF address blocks

Keep these pure. A class earns a test by having state; a pure function earns one
by having edge cases, and most of these are the second kind.

Construct services with fakes, or `provide()` them into a throwaway container,
rather than `vi.mock`-ing a module path.

## End-to-end

Playwright, in `e2e/`. **After any UI or route change, run it** —
`bun run check` and `bun run lint` do not catch a bad reactive access, a
hydration mismatch, or a broken remote call.

It runs against a **production build on `:3000`**
(`bun run build && bun run start`), not `vite dev`: a cold dev-server compile
made the run flaky. It reuses an existing server on `:3000` and starts one
otherwise, so a `bun run dev` on `:5173` is untouched either way.

It needs `NUVIO_TEST_EMAIL` and `NUVIO_TEST_PASSWORD` in `.env` — see
`.env.example`.

The whole suite shares **one** auth token (`e2e/auth.ts` memoises the password
grant), because the real `api.nuvio.tv` rate-limits. Do not re-run the full
suite gratuitously; run the spec you touched.

Add a spec when you add a screen or a flow.

## Zero console errors

Every spec that loads a page uses `collectRuntimeErrors` (`e2e/errors.ts`) and
asserts the list is empty. An uncaught exception or a genuine `console.error`
fails the test.

Do not widen the `IGNORE` list to make a test pass — fix the error. The only
pre-approved ignores are third-party asset 404s: posters, favicons, `net::ERR_`.

Two timing notes:

- A page with a playing `<video>` never reaches `networkidle`, so bound that
  wait: `waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})`.
- Give async errors a `waitForTimeout` beat before asserting, or you assert
  before the error has been raised.

## Accessibility

`e2e/a11y.spec.ts` runs [axe](https://github.com/dequelabs/axe-core) over every
main route and a couple of open-overlay states, asserting zero WCAG 2 A/AA
violations, plus skip-link and focus-on-navigation checks.

**New screens go in its `pages` list.** Fix what it flags rather than filtering
the rule — a filtered rule is a permanent exemption nobody revisits.

## Coverage

```bash
bun run test:unit:coverage
```

Istanbul. Coverage is a diagnostic, not a target: a number going up because a
test exercised a line without asserting anything is worse than the number
staying put.

## CI

- **Code Quality** runs the prek hook set on every PR.
- **Test** runs the unit suite.
- **Nuvio API contract** runs daily, checking the committed spec snapshot
  against the live one. See [The Nuvio API spec](nuvio-api).
- **Docker** builds `linux/amd64` and `linux/arm64` per PR and on main.
