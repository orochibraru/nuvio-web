import { describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box.ts";

describe("SecretBox", () => {
	it("round-trips a value bound to its context", () => {
		const box = new SecretBox("secret", "purpose v1");
		const sealed = box.seal("smtp.password", "hunter2");
		expect(sealed).not.toContain("hunter2");
		expect(box.open("smtp.password", sealed)).toBe("hunter2");
	});

	it("refuses another context, purpose or secret", () => {
		const sealed = new SecretBox("secret", "purpose v1").seal("a", "value");
		expect(() =>
			new SecretBox("secret", "purpose v1").open("b", sealed),
		).toThrow();
		expect(() =>
			new SecretBox("secret", "purpose v2").open("a", sealed),
		).toThrow();
		expect(() =>
			new SecretBox("other", "purpose v1").open("a", sealed),
		).toThrow();
	});
});
