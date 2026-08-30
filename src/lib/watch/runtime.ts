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

/** Human "time left" for a resume row: "3 min left", "1 h 12 min left". */
export function formatRemaining(ms: number): string {
	const totalMinutes = Math.round(ms / 60_000);
	if (totalMinutes < 1) {
		return "Almost done";
	}
	if (totalMinutes < 60) {
		return `${totalMinutes} min left`;
	}
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes === 0 ? `${hours} h left` : `${hours} h ${minutes} min left`;
}
