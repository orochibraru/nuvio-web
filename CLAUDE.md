# Nuvio web

`TODO.md` is the authoritative build plan. Keep it current as work lands.

## Conventions

- **Always brace control statements.** `if (x) { return; }` — never `if (x) return;`
  on one line, never a braceless body. Same for `for` / `while` / `else`. Enforced
  by Biome (`style/useBlockStatements: error`); its fix is "unsafe" so `bun run
  lint:fix` won't add the braces for you — write them.
- Package manager is **bun**. `bun run lint` / `lint:fix` / `check`. Never npx/npm.
- `$lib` alias (SvelteKit). Import barrels as `$lib/foo/index.js`.
- Remote `query` functions are `await`ed in `+page.server.ts` loads for real SSR.
- A `.remote.ts` file may export **only** remote functions — put schemas / types /
  constants in a sibling `*.ts` (see `$lib/settings/ui-settings.ts`).

## Verifying UI changes

`bun run check` and `bun run lint` are necessary but not sufficient — they don't
catch runtime errors (bad reactive access, hydration mismatch, a broken remote
call). **After any UI or route change, run `bun run test:e2e`** (Playwright, in
`e2e/`) and make it pass before calling the work done. Add a spec when you add a
screen or a flow. Needs `NUVIO_TEST_EMAIL` / `NUVIO_TEST_PASSWORD` in `.env`
(see `.env.example`); the config starts its own dev server on :4173.
