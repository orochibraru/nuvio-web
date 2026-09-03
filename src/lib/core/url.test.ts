import { describe, expect, it } from "vitest";
import { httpUrlOrNull } from "./url.ts";

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
