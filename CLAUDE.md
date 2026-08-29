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
