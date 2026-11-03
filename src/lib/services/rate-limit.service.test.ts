import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.service.ts";

describe("RateLimiter", () => {
	it("allows up to the limit, then refuses until the window ends", () => {
		let now = 0;
		const limiter = new RateLimiter(() => now);
		for (let attempt = 0; attempt < 3; attempt++) {
			expect(limiter.attempt("ip:1", 3, 1000)).toBe(true);
		}
		expect(limiter.attempt("ip:1", 3, 1000)).toBe(false);
		now = 999;
		expect(limiter.attempt("ip:1", 3, 1000)).toBe(false);
		now = 1000;
		expect(limiter.attempt("ip:1", 3, 1000)).toBe(true);
	});

	it("counts each key on its own", () => {
		const limiter = new RateLimiter(() => 0);
		expect(limiter.attempt("a", 1, 1000)).toBe(true);
		expect(limiter.attempt("a", 1, 1000)).toBe(false);
		expect(limiter.attempt("b", 1, 1000)).toBe(true);
	});
});
