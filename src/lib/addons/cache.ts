/** In-memory TTL cache. Per server instance / per tab — swap for IndexedDB in Phase 2 if needed. */
export class TtlCache<T> {
	private readonly store = new Map<string, { value: T; expiresAt: number }>();

	constructor(private readonly defaultTtlMs: number) {}

	get(key: string): T | undefined {
		const hit = this.store.get(key);
		if (!hit) {
			return undefined;
		}
		if (hit.expiresAt <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}
		return hit.value;
	}

	set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
		this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
	}

	async wrap(
		key: string,
		produce: () => Promise<T>,
		ttlMs = this.defaultTtlMs,
	): Promise<T> {
		const cached = this.get(key);
		if (cached !== undefined) {
			return cached;
		}
		const value = await produce();
		this.set(key, value, ttlMs);
		return value;
	}

	delete(key: string): void {
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}
}
