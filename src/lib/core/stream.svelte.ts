import { untrack } from "svelte";
import { page } from "$app/state";

/**
 * Bridge a streamed `load` promise (an unawaited value returned from
 * `+*.server.ts`) to plain reactive state, so navigation is never blocked
 * waiting for it. Re-resolves whenever `get()` returns a new promise (i.e. on
 * navigation). Read `.current`; it holds `initial` until the promise settles
 * (a new promise on a new path resets it to `initial`, so the next page never
 * shows the previous one's data; a re-run on the same path, e.g. after a form
 * or `invalidateAll`, keeps the current value until the fresh one lands, so
 * grids don't flash empty) and keeps its value on rejection.
 *
 * `get()` may return `undefined` : a `forkPreloads` speculative render can
 * instantiate the component before its `data` prop is populated.
 */
export function streamed<T>(get: () => Promise<T> | undefined, initial: T) {
	let value = $state<T>(initial);
	let settled = $state(false);
	let path: string | null = null;

	$effect(() => {
		const promise = get();
		if (!promise) {
			return;
		}
		let cancelled = false;
		const nextPath = untrack(() => page.url.pathname);
		if (nextPath !== path) {
			path = nextPath;
			value = initial;
			settled = false;
		}
		promise
			.then((next) => {
				if (!cancelled) {
					value = next;
					settled = true;
				}
			})
			.catch(() => {
				if (!cancelled) {
					settled = true;
				}
			});
		return () => {
			cancelled = true;
		};
	});

	return {
		get current() {
			return value;
		},
		get ready() {
			return settled;
		},
	};
}
