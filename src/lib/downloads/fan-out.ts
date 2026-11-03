import { pooledMap } from "#lib/core/pool.js";

/** `pooledMap` that stops on the first failure and rethrows it once every started `work` has settled. */
export async function eachUntilFailure<T>(
	items: readonly T[],
	limit: number,
	signal: AbortSignal,
	work: (item: T, signal: AbortSignal) => Promise<void>,
): Promise<void> {
	const controller = new AbortController();
	const linked = AbortSignal.any([signal, controller.signal]);
	let failure: { error: unknown } | null = null;
	await pooledMap(items, limit, async (item) => {
		if (linked.aborted) {
			return;
		}
		try {
			await work(item, linked);
		} catch (error) {
			failure ??= { error };
			controller.abort();
		}
	});
	if (failure) {
		throw (failure as { error: unknown }).error;
	}
}
