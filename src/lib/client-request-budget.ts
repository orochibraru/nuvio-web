/**
 * A global cap on simultaneous "nice to have" background requests the browser
 * has in flight at once : cast bios (`#lib/people.ts`) today, any future
 * client-side addon fan-out tomorrow. `AddonClient`'s `FANOUT_CONCURRENCY`
 * throttles one server-side fan-out call; this throttles across *all* of
 * them, app-wide, regardless of which component kicked each one off : e.g. a
 * detail page's 18-cast-member row shouldn't open 18 simultaneous Wikipedia
 * requests just because it fetched them from one `$effect`.
 *
 * FIFO: callers are admitted in the order they call `budgeted`.
 */
const GLOBAL_BUDGET = 6;

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
	if (active < GLOBAL_BUDGET) {
		active++;
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		queue.push(() => {
			active++;
			resolve();
		});
	});
}

function release(): void {
	active--;
	const next = queue.shift();
	if (next) {
		next();
	}
}

/** Runs `fn` once fewer than `GLOBAL_BUDGET` other budgeted calls are in flight. */
export async function budgeted<T>(fn: () => Promise<T>): Promise<T> {
	await acquire();
	try {
		return await fn();
	} finally {
		release();
	}
}
