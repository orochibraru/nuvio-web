/**
 * A FIFO cap on how many "nice to have" background requests are in flight at
 * once, app-wide. `AddonClient` throttles one server-side fan-out; this
 * throttles across all of them, so a detail page's 18-person cast row can't
 * open 18 simultaneous Wikipedia requests from one `$effect`.
 */
export class RequestBudget {
	#active = 0;
	readonly #queue: Array<() => void> = [];

	constructor(private readonly limit = 6) {}

	/** In-flight calls right now. */
	get active(): number {
		return this.#active;
	}

	/** Callers admitted but still waiting for a slot. */
	get waiting(): number {
		return this.#queue.length;
	}

	/** Runs `fn` once fewer than `limit` other budgeted calls are in flight. */
	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.#acquire();
		try {
			return await fn();
		} finally {
			this.#release();
		}
	}

	#acquire(): Promise<void> {
		if (this.#active < this.limit) {
			this.#active++;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.#queue.push(() => {
				this.#active++;
				resolve();
			});
		});
	}

	#release(): void {
		this.#active--;
		const next = this.#queue.shift();
		if (next) {
			next();
		}
	}
}
