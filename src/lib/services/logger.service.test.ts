import { describe, expect, it } from "vitest";
import { Logger } from "./logger.service.ts";

function sink() {
	const out: string[] = [];
	const err: string[] = [];
	return {
		lines: { out, err },
		sink: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
	};
}

describe("Logger", () => {
	it("drops anything below the minimum level", () => {
		const { lines, sink: s } = sink();
		const logger = new Logger("warn", s);
		logger.debug("nope");
		logger.info("nope");
		logger.warn("yes");
		expect(lines.out).toEqual([]);
		expect(lines.err).toHaveLength(1);
	});

	it("sends warn and error to the error sink, the rest to out", () => {
		const { lines, sink: s } = sink();
		const logger = new Logger("debug", s);
		logger.debug("d");
		logger.info("i");
		logger.warn("w");
		logger.error("e");
		expect(lines.out).toHaveLength(2);
		expect(lines.err).toHaveLength(2);
	});

	it("carries bound fields and a scope onto every line", () => {
		const { lines, sink: s } = sink();
		new Logger("info", s).scoped("Hooks").with({ errorId: "abc" }).info("hi", {
			status: 500,
		});
		expect(lines.out[0]).toContain("[Hooks]");
		expect(lines.out[0]).toContain("errorId=");
		expect(lines.out[0]).toContain("abc");
		expect(lines.out[0]).toContain("500");
	});

	it("emits one parseable object per line in json format, with the Error's stack", () => {
		const { lines, sink: s } = sink();
		const logger = new Logger("info", s, { format: "json", scope: "Hooks" });
		logger.error("boom", { cause: new Error("kaboom") });
		const parsed = JSON.parse(lines.err[0]);
		expect(parsed.level).toBe("error");
		expect(parsed.scope).toBe("Hooks");
		expect(parsed.message).toBe("boom");
		// JSON.stringify alone turns an Error into `{}`.
		expect(parsed.cause).toContain("kaboom");
	});

	it("keeps the parent untouched when deriving with `with`", () => {
		const { lines, sink: s } = sink();
		const parent = new Logger("info", s);
		parent.with({ a: 1 }).info("child");
		parent.info("parent");
		expect(lines.out[0]).toContain("a=");
		expect(lines.out[1]).not.toContain("a=");
	});
});
