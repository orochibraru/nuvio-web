import { browser } from "$app/env";

/**
 * The page title shown in the browser tab. The root layout renders
 * `{pageTitle.full}` into `<svelte:head>`; each page sets its own segment (in a
 * `$effect` when it depends on loaded data, or once at script top when static).
 * `beforeNavigate` in the root layout clears it so a page that sets nothing
 * falls back to plain "Nuvio".
 *
 * Client-only on purpose: it's a module singleton, so writing to it during SSR
 * would leak one request's title into another. The server always renders
 * "Nuvio" and the client fills in the real title on mount.
 */
class PageTitle {
	#segment = $state<string | null>(null);

	get full(): string {
		return this.#segment
			? `Nuvio · ${this.#segment}`
			: "Nuvio · Watch your library, everywhere.";
	}

	set(segment: string | null | undefined) {
		if (!browser) {
			return;
		}
		this.#segment = segment?.trim() ? segment.trim() : null;
	}
}

export const pageTitle = new PageTitle();
