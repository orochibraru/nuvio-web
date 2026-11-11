// What the window shows while the server starts: the logo popping in over the
// brand's aurora, the name rising letter by letter, a sweeping bar. Adding
// `leave` to the root zooms it all out, just before the app loads.

/** The intro has landed by then: leaving earlier cuts it off mid-way. */
export const INTRO_MS = 900;
export const LEAVE_MS = 350;
export const LEAVE_SCRIPT = `document.documentElement.classList.add("leave")`;

const escapeHtml = (text: string) =>
	text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const letters = (word: string, from: number) =>
	[...word]
		.map(
			(letter, index) =>
				`<span class="l" style="--i:${from + index}">${escapeHtml(letter)}</span>`,
		)
		.join("");

const STYLE = `
:root {
	--bg: #0a0a0a; --fg: #fafafa; --muted: #a3a3a3; --track: #ffffff1a;
	--indigo: #4f5bf0; --violet: #b14cf0; --cyan: #3fd5ea;
	--blob: 0.55;
	color-scheme: dark;
}
@media (prefers-color-scheme: light) {
	:root { --bg: #ffffff; --fg: #0a0a0a; --muted: #737373; --track: #0000000f; --blob: 0.3; color-scheme: light; }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body {
	display: grid; place-items: center;
	background: var(--bg); color: var(--fg);
	font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
	-webkit-user-select: none; user-select: none; cursor: default;
}
.aurora { position: fixed; inset: -25%; filter: blur(90px); opacity: 0; animation: fade 1.4s ease-out forwards; }
.aurora i { position: absolute; width: 60vmax; height: 60vmax; border-radius: 50%; opacity: var(--blob); }
.aurora i:nth-child(1) { top: 0; left: 0; background: var(--indigo); animation: drift-a 9s ease-in-out infinite alternate; }
.aurora i:nth-child(2) { right: 0; bottom: 0; background: var(--violet); animation: drift-b 11s ease-in-out infinite alternate; }
.aurora i:nth-child(3) { top: 10%; right: 15%; width: 40vmax; height: 40vmax; background: var(--cyan); animation: drift-c 8s ease-in-out infinite alternate; }
main { position: relative; display: grid; justify-items: center; gap: 22px; }
.mark { position: relative; width: 112px; height: 120px; }
.mark img, .shine { position: absolute; inset: 0; width: 100%; height: 100%; }
.mark img {
	object-fit: contain; opacity: 0;
	animation: pop 0.75s cubic-bezier(0.2, 0.9, 0.25, 1.2) 0.1s forwards, float 3.2s ease-in-out 1s infinite;
}
.halo {
	position: absolute; inset: -40%; border-radius: 50%; opacity: 0;
	background: radial-gradient(circle, var(--violet), var(--cyan) 35%, transparent 65%);
	filter: blur(28px);
	animation: halo 2.6s ease-in-out 0.35s infinite;
}
.shine {
	background: linear-gradient(105deg, transparent 38%, #ffffffcc 50%, transparent 62%) 160% 0 / 260% 100% no-repeat;
	-webkit-mask: var(--logo) center / contain no-repeat; mask: var(--logo) center / contain no-repeat;
	animation: shine 2.8s ease-in-out 0.6s infinite;
}
h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 0.01em; white-space: pre; }
h1 .l { display: inline-block; opacity: 0; animation: rise 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) calc(0.3s + var(--i) * 40ms) forwards; }
h1 .web .l { color: var(--violet); font-weight: 500; }
.bar { width: 148px; height: 3px; border-radius: 3px; overflow: hidden; background: var(--track); opacity: 0; animation: fade 0.4s ease-out 0.7s forwards; }
.bar i { display: block; width: 40%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--cyan), var(--violet)); animation: sweep 1.15s ease-in-out infinite; }
p { margin: 0; max-width: 32rem; padding: 0 16px; text-align: center; color: var(--muted); opacity: 0; animation: fade 0.4s ease-out 0.8s forwards; -webkit-user-select: text; user-select: text; }
.failed .bar, .failed .halo, .failed .shine { display: none; }
.leave main { animation: leave ${LEAVE_MS}ms ease-in forwards; }
.leave .aurora { animation: out ${LEAVE_MS}ms ease-in forwards; }
@keyframes fade { to { opacity: 1; } }
@keyframes out { from { opacity: 1; } to { opacity: 0; } }
@keyframes pop {
	from { opacity: 0; transform: scale(0.4) rotate(-14deg); filter: blur(12px); }
	to { opacity: 1; transform: none; filter: none; }
}
@keyframes float { 50% { transform: translateY(-5px); } }
@keyframes halo { 0%, 100% { opacity: 0.25; transform: scale(0.85); } 50% { opacity: 0.6; transform: scale(1.1); } }
@keyframes shine { 0% { background-position: 160% 0; } 45%, 100% { background-position: -60% 0; } }
@keyframes rise {
	from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
	to { opacity: 1; transform: none; filter: none; }
}
@keyframes sweep { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@keyframes drift-a { to { transform: translate(12%, 10%) scale(1.15); } }
@keyframes drift-b { to { transform: translate(-14%, -8%) scale(0.9); } }
@keyframes drift-c { to { transform: translate(-20%, 18%) scale(1.2); } }
@keyframes leave { to { opacity: 0; transform: scale(1.35); filter: blur(10px); } }
@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
	.bar, .halo, .shine { display: none; }
}`;

/**
 * The splash page. `logo` is a data URL (empty when the bundle has none), and
 * `message` a line under the name; `failed` drops what says it's still going.
 */
export function splash({
	logo,
	message = "",
	failed = false,
}: {
	logo: string;
	message?: string;
	failed?: boolean;
}): string {
	const mark = logo
		? `<div class="mark" style="--logo:url('${escapeHtml(logo)}')"><div class="halo"></div><img src="${escapeHtml(logo)}" alt=""><div class="shine"></div></div>`
		: "";
	return `<!doctype html><html${failed ? ' class="failed"' : ""}><head><meta charset="utf-8"><title>Nuvio Web</title><style>${STYLE}</style></head><body><div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div><main>${mark}<h1 aria-label="Nuvio Web">${letters("Nuvio", 0)}<span class="web"> ${letters("Web", 6)}</span></h1>${failed ? "" : '<div class="bar" aria-hidden="true"><i></i></div>'}${message ? `<p role="status">${escapeHtml(message)}</p>` : ""}</main></body></html>`;
}
