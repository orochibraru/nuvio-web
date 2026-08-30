/**
 * Parse an addon `runtime` string ("49 min", "1h 22m", "142") to milliseconds.
 * Falls back to 45 minutes when nothing usable is found.
 */
export function parseRuntimeMs(runtime: string | null | undefined): number {
	const fallback = 45 * 60_000;
	if (!runtime) {
		return fallback;
	}
	const hours = runtime.match(/(\d+)\s*h/i);
	const minutes = runtime.match(/(\d+)\s*m(?!s)/i);
	if (hours || minutes) {
		return (
			(Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0)) * 60_000 ||
			fallback
		);
	}
	const bare = runtime.match(/(\d+)/);
	return bare ? Number(bare[1]) * 60_000 : fallback;
}
