import { describe, expect, it } from "vitest";
import {
	Container,
	type DisposableService,
	ServiceResolutionError,
	serviceToken,
} from "./container.ts";

class Counter {
	static built = 0;
	readonly id: number;
	constructor() {
		Counter.built += 1;
		this.id = Counter.built;
	}
}

const COUNTER = serviceToken<Counter>("Counter");
const SCOPED = serviceToken<{ tag: string }>("Scoped");
const MISSING = serviceToken<string>("Missing");

function root() {
	Counter.built = 0;
	return new Container("root");
}

describe("resolution", () => {
	it("builds a service once and hands back the same instance", () => {
		const c = root().register(COUNTER, () => new Counter());
		expect(c.get(COUNTER)).toBe(c.get(COUNTER));
		expect(Counter.built).toBe(1);
	});

	it("throws a named error for an unregistered token", () => {
		expect(() => root().get(MISSING)).toThrow(ServiceResolutionError);
		expect(() => root().get(MISSING)).toThrow(/Missing/);
	});

	it("reports what it can resolve", () => {
		const c = root().register(COUNTER, () => new Counter());
		expect(c.has(COUNTER)).toBe(true);
		expect(c.has(MISSING)).toBe(false);
	});

	it("provides a pre-built instance, which is how request inputs get in", () => {
		const c = root().provide(COUNTER, { id: 99 } as Counter);
		expect(c.get(COUNTER).id).toBe(99);
		expect(Counter.built).toBe(0);
	});

	it("detects a dependency cycle instead of overflowing the stack", () => {
		const a = serviceToken<unknown>("A");
		const b = serviceToken<unknown>("B");
		const c = root()
			.register(a, (self) => self.get(b))
			.register(b, (self) => self.get(a));
		expect(() => c.get(a)).toThrow(/Dependency cycle: A → B → A/);
	});
});

describe("scoping", () => {
	it("shares one singleton across every scope", () => {
		const parent = root().register(COUNTER, () => new Counter());
		const one = parent.createScope("one");
		const two = parent.createScope("two");
		expect(one.get(COUNTER)).toBe(two.get(COUNTER));
		expect(Counter.built).toBe(1);
	});

	it("gives each scope its own instance of a scoped service", () => {
		let n = 0;
		const parent = root().register(
			SCOPED,
			() => ({ tag: `s${++n}` }),
			"scoped",
		);
		expect(parent.createScope("a").get(SCOPED).tag).toBe("s1");
		expect(parent.createScope("b").get(SCOPED).tag).toBe("s2");
	});

	it("returns the same scoped instance within one scope", () => {
		const parent = root().register(SCOPED, () => ({ tag: "x" }), "scoped");
		const scope = parent.createScope("a");
		expect(scope.get(SCOPED)).toBe(scope.get(SCOPED));
	});

	// The guarantee the server depends on: a request-scoped service resolved
	// from the root would be shared by every request, which for SessionService
	// means one visitor's cookies answering another visitor's page.
	it("refuses to resolve a scoped service from the root", () => {
		const parent = root().register(SCOPED, () => ({ tag: "x" }), "scoped");
		expect(() => parent.get(SCOPED)).toThrow(ServiceResolutionError);
		expect(() => parent.get(SCOPED)).toThrow(/request-scoped/);
	});

	// Same rule catches the captive dependency: a singleton's factory resolves
	// against the root, so asking it for a scoped service throws there too.
	it("refuses to let a singleton capture a scoped service", () => {
		const holder = serviceToken<unknown>("Holder");
		const parent = root()
			.register(SCOPED, () => ({ tag: "x" }), "scoped")
			.register(holder, (self) => ({ inner: self.get(SCOPED) }));
		expect(() => parent.createScope("req").get(holder)).toThrow(
			/request-scoped/,
		);
	});

	it("inherits registrations from the parent", () => {
		const parent = root().register(COUNTER, () => new Counter());
		expect(parent.createScope("child").get(COUNTER)).toBeInstanceOf(Counter);
	});
});

describe("dispose", () => {
	it("disposes what it built, newest first", () => {
		const order: string[] = [];
		const make = (tag: string): DisposableService => ({
			dispose: () => order.push(tag),
		});
		const first = serviceToken<DisposableService>("First");
		const second = serviceToken<DisposableService>("Second");
		const c = root()
			.register(first, () => make("first"))
			.register(second, () => make("second"));
		c.get(first);
		c.get(second);
		c.dispose();
		expect(order).toEqual(["second", "first"]);
	});

	it("a scope disposing does not touch the parent's singletons", () => {
		let disposed = false;
		const token = serviceToken<DisposableService>("Singleton");
		const parent = root().register(token, () => ({
			dispose: () => {
				disposed = true;
			},
		}));
		const scope = parent.createScope("req");
		scope.get(token);
		scope.dispose();
		expect(disposed).toBe(false);
		parent.dispose();
		expect(disposed).toBe(true);
	});

	it("rebuilds after dispose", () => {
		const c = root().register(COUNTER, () => new Counter());
		c.get(COUNTER);
		c.dispose();
		c.get(COUNTER);
		expect(Counter.built).toBe(2);
	});
});
