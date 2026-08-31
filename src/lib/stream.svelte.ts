/**
 * Bridge a streamed `load` promise (an unawaited value returned from
 * `+*.server.ts`) to plain reactive state, so navigation is never blocked
 * waiting for it. Re-resolves whenever `get()` returns a new promise (i.e. on
 * navigation). Read `.current`; it holds `initial` until the promise settles and
 * stays at the last value on rejection.
 */
export function streamed<T>(get: () => Promise<T>, initial: T) {
	let value = $state<T>(initial);
	let settled = $state(false);

	$effect(() => {
		const promise = get();
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
