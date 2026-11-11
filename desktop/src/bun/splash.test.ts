import { describe, expect, it } from "vitest";
import { splash } from "./splash.ts";

describe("splash", () => {
	it("escapes the message", () => {
		const html = splash({ logo: "", message: `<img src=x onerror="a()">` });
		expect(html).not.toContain("<img src=x");
		expect(html).toContain("&#60;img src=x onerror=&#34;a()&#34;&#62;");
	});

	it("shows the logo only when the bundle has one", () => {
		expect(splash({ logo: "" })).not.toContain('class="mark"');
		expect(splash({ logo: "data:image/webp;base64,AA==" })).toContain(
			'<img src="data:image/webp;base64,AA=="',
		);
	});

	it("drops the progress bar once it failed", () => {
		expect(splash({ logo: "" })).toContain('class="bar"');
		const failed = splash({ logo: "", message: "Down", failed: true });
		expect(failed).not.toContain('class="bar"');
		expect(failed).toContain('<html class="failed">');
	});
});
