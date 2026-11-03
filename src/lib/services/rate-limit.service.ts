// Fixed-window attempt counter, in memory: a restart forgets every window.
export class RateLimiter {
	readonly #windows = new Map<string, { count: number; resetAt: number }>();

	constructor(private readonly now: () => number = Date.now) {}

	attempt(key: string, limit: number, windowMs: number): boolean {
		const now = this.now();
		const current = this.#windows.get(key);
		if (current && current.resetAt > now) {
			current.count += 1;
			return current.count <= limit;
		}
		for (const [stale, entry] of this.#windows) {
			if (entry.resetAt <= now) {
				this.#windows.delete(stale);
			}
		}
		this.#windows.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
}
