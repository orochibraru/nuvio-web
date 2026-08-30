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
			results[index] = await fn(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: width }, worker));
	return results;
}
