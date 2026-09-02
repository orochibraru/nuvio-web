/**
 * Bridge a streamed `load` promise (an unawaited value returned from
 * `+*.server.ts`) to plain reactive state, so navigation is never blocked
 * waiting for it. Re-resolves whenever `get()` returns a new promise (i.e. on
 * navigation). Read `.current`; it holds `initial` until the promise settles and
 * stays at the last value on rejection.
 *
 * `get()` may return `undefined` : a `forkPreloads` speculative render can
 * instantiate the component before its `data` prop is populated.
 */
export function streamed<T>(get: () => Promise<T> | undefined, initial: T) {
	let value = $state<T>(initial);
	let settled = $state(false);

	$effect(() => {
		const promise = get();
		if (!promise) {
			return;
		}
		let cancelled = false;
		settled = false;
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
