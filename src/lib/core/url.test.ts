import { describe, expect, it } from "vitest";
import { httpUrlOrNull, safeRedirectPath } from "./url.ts";

describe("httpUrlOrNull", () => {
	it("passes http and https through unchanged", () => {
		expect(httpUrlOrNull("https://a.example/x?y=1")).toBe(
			"https://a.example/x?y=1",
		);
		expect(httpUrlOrNull("http://a.example")).toBe("http://a.example");
	});

	it("rejects the injection schemes it exists to catch", () => {
		expect(httpUrlOrNull("javascript:alert(1)")).toBeNull();
		expect(httpUrlOrNull("data:text/html,<script>")).toBeNull();
		expect(httpUrlOrNull("vlc://open")).toBeNull();
	});

	it("rejects a value that is not a URL at all", () => {
		expect(httpUrlOrNull("/relative/path")).toBeNull();
		expect(httpUrlOrNull("not a url")).toBeNull();
	});

	it("rejects empty and absent values", () => {
		expect(httpUrlOrNull("")).toBeNull();
		expect(httpUrlOrNull(null)).toBeNull();
		expect(httpUrlOrNull(undefined)).toBeNull();
	});
});

describe("safeRedirectPath", () => {
	const fallback = "/home";

	it("keeps a same-origin path with its query and hash", () => {
		expect(safeRedirectPath("/detail/x?y=1#z", fallback)).toBe(
			"/detail/x?y=1#z",
		);
	});

	it("refuses what browsers turn into a protocol-relative URL", () => {
		expect(safeRedirectPath("/\\evil.com", fallback)).toBe(fallback);
		expect(safeRedirectPath("/\tevil.com", fallback)).toBe(fallback);
		expect(safeRedirectPath("/\t/evil.com", fallback)).toBe(fallback);
		expect(safeRedirectPath("//evil.com", fallback)).toBe(fallback);
	});

	it("refuses absolute and non-path values", () => {
		expect(safeRedirectPath("https://evil.com", fallback)).toBe(fallback);
		expect(safeRedirectPath("javascript:alert(1)", fallback)).toBe(fallback);
		expect(safeRedirectPath("detail/x", fallback)).toBe(fallback);
		expect(safeRedirectPath("", fallback)).toBe(fallback);
		expect(safeRedirectPath(null, fallback)).toBe(fallback);
	});
});
