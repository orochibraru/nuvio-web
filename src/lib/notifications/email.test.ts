import { describe, expect, it } from "vitest";
import { type EmailContent, emailHtml, emailText } from "./email.ts";

const CONTENT: EmailContent = {
	preview: "Preview",
	heading: "A new custom backend is in use",
	paragraphs: ["Someone signed in."],
	detail: 'https://evil.example/"><script>alert(1)</script>',
	action: {
		label: "Review it",
		url: "https://nuvio.example.com/admin?tab=backends&x=1",
	},
	footnote: "Footnote",
};

describe("emailHtml", () => {
	it("escapes every value it puts in the markup", () => {
		const html = emailHtml(CONTENT);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain(
			'href="https://nuvio.example.com/admin?tab=backends&amp;x=1"',
		);
	});

	it("leaves out the detail and the button when there are none", () => {
		const html = emailHtml({
			...CONTENT,
			detail: undefined,
			action: undefined,
		});
		expect(html).not.toContain("<a ");
		expect(html).not.toContain("evil.example");
	});
});

describe("emailText", () => {
	it("carries the same content, the link spelled out", () => {
		const text = emailText(CONTENT);
		expect(text).toContain("A new custom backend is in use");
		expect(text).toContain(
			"Review it: https://nuvio.example.com/admin?tab=backends&x=1",
		);
		expect(text).toContain("Footnote");
	});
});
