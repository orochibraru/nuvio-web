import { browser } from "$app/env";

/**
 * The page title shown in the browser tab. The root layout renders
 * `{pageTitle.full}` into `<svelte:head>`; each page sets its own segment (in a
 * `$effect` when it depends on loaded data, or once at script top when static).
 * `beforeNavigate` in the root layout clears it so a page that sets nothing
 * falls back to the bare app name.
 *
 * Client-only on purpose: it's a module singleton, so writing to it during SSR
 * would leak one request's title into another. The server always renders
 * the bare app name and the client fills in the real title on mount. The page
 * comes first so a narrow tab still shows it.
 */
const APP_NAME = "Nuvio Web (unofficial)";

class PageTitle {
	#segment = $state<string | null>(null);

	get full(): string {
		return this.#segment ? `${this.#segment} · ${APP_NAME}` : APP_NAME;
	}

	set(segment: string | null | undefined) {
		if (!browser) {
			return;
		}
		this.#segment = segment?.trim() ? segment.trim() : null;
	}
}

export const pageTitle = new PageTitle();
