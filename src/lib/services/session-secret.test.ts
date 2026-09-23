import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSessionSecret } from "./session-secret.ts";

function tempDir() {
	return path.join(mkdtempSync(path.join(tmpdir(), "nuvio-secret-")), "data");
}

describe("loadSessionSecret", () => {
	it("prefers the env value and touches no file", () => {
		const dir = tempDir();
		expect(loadSessionSecret("from-env", dir)).toBe("from-env");
		expect(() => statSync(dir)).toThrow();
	});

	it("generates a private file once and reuses it", () => {
		const dir = tempDir();
		const first = loadSessionSecret("", dir);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		const file = path.join(dir, "session-secret");
		expect(readFileSync(file, "utf8")).toBe(first);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(loadSessionSecret("", dir)).toBe(first);
	});

	it("refuses an empty secret file instead of signing with nothing", () => {
		const dir = tempDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "session-secret"), "\n");
		expect(() => loadSessionSecret("", dir)).toThrow(/empty/);
	});

	it("rethrows a filesystem error other than an existing file", () => {
		const parent = tempDir();
		writeFileSync(parent.replace(/data$/, "file"), "");
		expect(() =>
			loadSessionSecret("", path.join(parent.replace(/data$/, "file"), "x")),
		).toThrow();
	});
});
