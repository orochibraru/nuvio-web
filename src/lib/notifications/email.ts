/** What an email says, once: `emailHtml` and `emailText` both render it. */
export interface EmailContent {
	/** The inbox preview line. */
	preview: string;
	heading: string;
	paragraphs: string[];
	/** A value shown on its own, monospaced (a URL, an address). */
	detail?: string;
	action?: { label: string; url: string };
	footnote: string;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const FONT =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

// Tables and inline styles only: that is all mail clients reliably render.
export function emailHtml(content: EmailContent): string {
	const paragraphs = content.paragraphs
		.map(
			(text) =>
				`<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#d4d4d8">${escapeHtml(text)}</p>`,
		)
		.join("");
	const detail = content.detail
		? `<div style="margin:0 0 24px;padding:12px 14px;border-radius:10px;background:#0b0b10;border:1px solid #27272f;font-family:${MONO};font-size:13px;line-height:20px;color:#f4f4f5;word-break:break-all">${escapeHtml(content.detail)}</div>`
		: "";
	const action = content.action
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr><td style="border-radius:999px;background:#2563eb"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(content.action.label)}</a></td></tr></table>`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#09090b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT}">
<tr><td style="padding:0 4px 20px;font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#ffffff">nuvio</td></tr>
<tr><td style="border-radius:16px;overflow:hidden;background:#16161d;border:1px solid #27272f">
<div style="height:4px;background:#6d28d9;background-image:linear-gradient(90deg,#06b6d4,#2563eb,#7c3aed,#db2777)"></div>
<div style="padding:28px 28px 20px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:#ffffff">${escapeHtml(content.heading)}</h1>
${paragraphs}${detail}${action}
</div>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#71717a">${escapeHtml(content.footnote)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function emailText(content: EmailContent): string {
	return [
		content.heading,
		...content.paragraphs,
		...(content.detail ? [content.detail] : []),
		...(content.action
			? [`${content.action.label}: ${content.action.url}`]
			: []),
		"--",
		content.footnote,
	].join("\n\n");
}
