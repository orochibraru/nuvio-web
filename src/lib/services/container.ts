/**
 * How long a service lives.
 *
 * - `singleton` : one instance for the life of the container it was registered
 *   on, shared by every scope beneath it. The database handle, the logger.
 * - `scoped` : one instance per child scope. Anything holding request state.
 */
export type ServiceScope = "singleton" | "scoped";

export class ServiceToken<T> {
	/**
	 * Phantom: carries `T` through the registry so `get()` is typed. `declare`
	 * emits nothing : it exists only for the type checker, never at runtime.
	 */
	declare readonly $type: T;

	constructor(readonly name: string) {}

	toString(): string {
		return `ServiceToken(${this.name})`;
	}
}

/** Names a service and its type. Keep these in `tokens.ts`, not inline. */
export function serviceToken<T>(name: string): ServiceToken<T> {
	return new ServiceToken<T>(name);
}

/** Implement to get cleaned up by `Container.dispose()`. */
export interface DisposableService {
	dispose: () => void;
}

export type ServiceFactory<T> = (container: Container) => T;

interface Registration {
	factory: ServiceFactory<unknown>;
	scope: ServiceScope;
	owner: Container;
}

export class ServiceResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ServiceResolutionError";
	}
}

function hasDispose(value: unknown): value is DisposableService {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as DisposableService).dispose === "function"
	);
}

/**
 * A typed service registry. Register with {@link Container.register}, resolve
 * with {@link Container.get}, and build a child scope per request with
 * {@link Container.createScope}.
 *
 * Scope is the load-bearing part on the server: a `scoped` service resolved
 * from the root would be shared by every request, which for `SessionService`
 * means one visitor's cookies answering another visitor's page. `get` throws
 * rather than let that happen.
 */
export class Container {
	readonly #registrations = new Map<ServiceToken<unknown>, Registration>();
	readonly #instances = new Map<ServiceToken<unknown>, unknown>();
	readonly #created: unknown[] = [];
	readonly #resolving = new Set<ServiceToken<unknown>>();
	readonly #parent: Container | null;

	constructor(
		readonly name = "root",
		parent: Container | null = null,
	) {
		this.#parent = parent;
	}

	get isRoot(): boolean {
		return this.#parent === null;
	}

	/** Registers how to build a service. Later registrations replace earlier ones. */
	register<T>(
		token: ServiceToken<T>,
		factory: ServiceFactory<T>,
		scope: ServiceScope = "singleton",
	): this {
		this.#registrations.set(token as ServiceToken<unknown>, {
			factory: factory as ServiceFactory<unknown>,
			scope,
			owner: this,
		});
		return this;
	}

	/**
	 * Registers an already-built instance : for request inputs a factory can't
	 * invent (the cookie jar, the request event) and for fakes in tests.
	 */
	provide<T>(token: ServiceToken<T>, instance: T): this {
		this.#instances.set(token as ServiceToken<unknown>, instance);
		return this;
	}

	has(token: ServiceToken<unknown>): boolean {
		return this.#instances.has(token) || this.#find(token) !== null;
	}

	/**
	 * Resolves a service, building it on first use.
	 *
	 * @throws {ServiceResolutionError} when nothing is registered for `token`,
	 * when a `scoped` service is resolved from the root container (including
	 * from a singleton's factory, which is the captive-dependency mistake), or
	 * when the factories form a cycle.
	 */
	get<T>(token: ServiceToken<T>): T {
		const key = token as ServiceToken<unknown>;
		if (this.#instances.has(key)) {
			return this.#instances.get(key) as T;
		}

		const registration = this.#find(key);
		if (!registration) {
			throw new ServiceResolutionError(
				`No provider registered for ${key.name} (resolving from "${this.name}").`,
			);
		}

		if (registration.scope === "scoped" && this.isRoot) {
			throw new ServiceResolutionError(
				`${key.name} is request-scoped and cannot be resolved from the root container. ` +
					"Resolve it from a request scope (see createRequestScope in #lib/services/server.js), " +
					"and check that no singleton depends on it.",
			);
		}

		// A singleton lives on the container it was registered on so every scope
		// below shares one; a scoped service is built fresh on this scope.
		const home = registration.scope === "singleton" ? registration.owner : this;
		if (home !== this && home.#instances.has(key)) {
			return home.#instances.get(key) as T;
		}
		return home.#instantiate(key, registration) as T;
	}

	/** A child scope: inherits every registration, owns its own scoped instances. */
	createScope(name: string): Container {
		return new Container(name, this);
	}

	/** Disposes what this container built, newest first. Scopes only own their own. */
	dispose(): void {
		for (let i = this.#created.length - 1; i >= 0; i--) {
			const instance = this.#created[i];
			if (hasDispose(instance)) {
				instance.dispose();
			}
		}
		this.#created.length = 0;
		this.#instances.clear();
	}

	#find(token: ServiceToken<unknown>): Registration | null {
		let container: Container | null = this;
		while (container) {
			const registration = container.#registrations.get(token);
			if (registration) {
				return registration;
			}
			container = container.#parent;
		}
		return null;
	}

	#instantiate(
		token: ServiceToken<unknown>,
		registration: Registration,
	): unknown {
		if (this.#resolving.has(token)) {
			const chain = [...this.#resolving, token]
				.map((entry) => entry.name)
				.join(" → ");
			throw new ServiceResolutionError(`Dependency cycle: ${chain}.`);
		}
		this.#resolving.add(token);
		try {
			const instance = registration.factory(this);
			this.#instances.set(token, instance);
			this.#created.push(instance);
			return instance;
		} finally {
			this.#resolving.delete(token);
		}
	}
}
