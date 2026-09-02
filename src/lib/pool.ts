/**
 * `Promise.all(items.map(fn))` with a hard cap on how many `fn`s run at once —
 * used for the addon fan-out so a profile with a dozen stream providers doesn't
 * open a dozen simultaneous upstream requests. Results keep input order; `fn`
 * never sees a rejection swallowed (it should catch its own).
 */
export async function pooledMap<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	const width = Math.max(1, Math.min(limit, items.length));
	let cursor = 0;

	async function worker(): Promise<void> {
		while (cursor < items.length) {
			const index = cursor++;
			// biome-ignore lint/performance/noAwaitInLoops: the sequential await is the throttle : each worker pulls the next item only when the previous settles
			results[index] = await fn(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: width }, worker));
	return results;
}

/**
 * Split settled outcomes into the values that fulfilled and the reasons that
 * rejected. The building block for the "count the results, count the errors"
 * checks below : works the same whether the outcomes came from `Promise.all`
 * (via a catch) or `Promise.allSettled`.
 */
export function partitionSettled<T>(outcomes: Array<PromiseSettledResult<T>>): {
	results: T[];
	errors: unknown[];
} {
	const results: T[] = [];
	const errors: unknown[] = [];
	for (const outcome of outcomes) {
		if (outcome.status === "fulfilled") {
			results.push(outcome.value);
		} else {
			errors.push(outcome.reason);
		}
	}
	return { results, errors };
}

/**
 * Run every task concurrently and require that *all* of them succeed: the
 * fulfilled count must match the number scheduled and there must be zero errors,
 * otherwise it throws an `AggregateError` carrying every rejection reason. Use
 * for batches where a partial write would leave inconsistent state and the
 * caller retries the whole thing.
 */
export async function settleAll<T>(work: Array<Promise<T>>): Promise<T[]> {
	const { results, errors } = partitionSettled(await Promise.allSettled(work));
	if (results.length !== work.length || errors.length > 0) {
		throw new AggregateError(
			errors,
			`${errors.length} of ${work.length} tasks failed`,
		);
	}
	return results;
}

/**
 * Run every task concurrently and tolerate partial failure: returns the
 * fulfilled `results` alongside the `errors` so the caller can decide (proceed
 * with what came back, surface a warning, …). Use for best-effort fan-out like
 * addon queries where some providers are expected not to answer.
 */
export async function settleSome<T>(
	work: Array<Promise<T>>,
): Promise<{ results: T[]; errors: unknown[] }> {
	return partitionSettled(await Promise.allSettled(work));
}
