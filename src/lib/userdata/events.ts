import type { UserDataEvent } from "./types.ts";

export type UserDataListener = (change: UserDataEvent) => void;

/**
 * In-process pub/sub of user-data changes, per (user, profile): local writes
 * and changes pulled from Nuvio alike. A listener that throws is dropped from
 * that emit, never from the others.
 */
export class UserDataEvents {
	readonly #listeners = new Map<string, Set<UserDataListener>>();

	subscribe(
		userId: string,
		profileId: number,
		listener: UserDataListener,
	): () => void {
		const key = channel(userId, profileId);
		const set = this.#listeners.get(key) ?? new Set();
		set.add(listener);
		this.#listeners.set(key, set);
		return () => {
			set.delete(listener);
			if (set.size === 0) {
				this.#listeners.delete(key);
			}
		};
	}

	emit(userId: string, profileId: number, change: UserDataEvent): void {
		for (const listener of this.#listeners.get(channel(userId, profileId)) ??
			[]) {
			try {
				listener(change);
			} catch {
				// one broken subscriber must not starve the rest
			}
		}
	}
}

function channel(userId: string, profileId: number): string {
	return `${userId}:${profileId}`;
}
