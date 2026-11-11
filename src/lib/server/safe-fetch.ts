import { lookup } from "node:dns/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

// Ceiling on one name resolution, whatever the caller's own signal says: a
// resolver that never answers must not hold a request (or a load) forever.
const DNS_TIMEOUT_MS = 5000;

function ipv4ToInt(ip: string): number {
	return (
		ip
			.split(".")
			.reduce((accumulator, part) => accumulator * 256 + Number(part), 0) >>> 0
	);
}

function inRange(value: number, base: string, bits: number): boolean {
	const mask = bits === 0 ? 0 : (0xff_ff_ff_ff << (32 - bits)) >>> 0;
	return (value & mask) >>> 0 === (ipv4ToInt(base) & mask) >>> 0;
}

// LAN ranges (RFC 1918, CGNAT, IPv6 unique-local) pass: self-hosted addons live
// there. Loopback (the server itself) and link-local (cloud metadata) never do.
function isBlockedIpv4(ip: string): boolean {
	const value = ipv4ToInt(ip);
	return (
		inRange(value, "0.0.0.0", 8) ||
		inRange(value, "127.0.0.0", 8) ||
		inRange(value, "169.254.0.0", 16) ||
		inRange(value, "192.0.0.0", 24) ||
		inRange(value, "198.18.0.0", 15) ||
		inRange(value, "224.0.0.0", 4) ||
		inRange(value, "240.0.0.0", 4)
	);
}

/** The eight 16-bit groups of an address `isIP` accepted, dotted IPv4 tail included. */
function ipv6Groups(ip: string): number[] {
	let text = ip.toLowerCase().replace(/^\[|\]$/g, "");
	const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (dotted) {
		const [a, b, c, d] = dotted.slice(1).map(Number);
		text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const [head, tail] = text.split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const fill =
		tail === undefined
			? []
			: new Array<string>(8 - left.length - right.length).fill("0");
	return [...left, ...fill, ...right].map((group) =>
		Number.parseInt(group, 16),
	);
}

function isBlockedIpv6(ip: string): boolean {
	const groups = ipv6Groups(ip);
	const zeroBefore = (end: number) =>
		groups.slice(0, end).every((group) => group === 0);
	const embeddedIpv4 = [
		groups[6] >>> 8,
		groups[6] & 0xff,
		groups[7] >>> 8,
		groups[7] & 0xff,
	].join(".");
	// `::/96`: unspecified, loopback and the deprecated IPv4-compatible `::a.b.c.d`.
	if (zeroBefore(6)) {
		return true;
	}
	// IPv4-mapped and NAT64 addresses reach an IPv4 host, so they get the IPv4 rules.
	if (zeroBefore(5) && groups[5] === 0xff_ff) {
		return isBlockedIpv4(embeddedIpv4);
	}
	if (groups[0] === 0x64 && groups[1] === 0xff_9b) {
		return (
			!groups.slice(2, 6).every((group) => group === 0) ||
			isBlockedIpv4(embeddedIpv4)
		);
	}
	const first = groups[0];
	return (
		(first & 0xff_c0) === 0xfe_80 ||
		(first & 0xff_c0) === 0xfe_c0 ||
		(first & 0xff_00) === 0xff_00
	);
}

function isBlockedAddress(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) {
		return isBlockedIpv4(ip);
	}
	if (kind === 6) {
		return isBlockedIpv6(ip);
	}
	return true;
}

/** Rejects as soon as `signal` aborts, instead of whenever `work` gets round to settling. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		work
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

interface Resolved {
	address: string;
	family: number;
}

/** Resolves `host` (a name or a literal) and throws unless *every* answer is allowed. */
async function resolvePublic(
	host: string,
	signal?: AbortSignal | null,
): Promise<Resolved[]> {
	const bare = host.replace(/^\[|\]$/g, "");
	const kind = isIP(bare);
	let answers: Resolved[] = [{ address: bare, family: kind }];
	if (!kind) {
		const deadline = AbortSignal.timeout(DNS_TIMEOUT_MS);
		answers = await raceAbort(
			lookup(bare, { all: true }),
			signal ? AbortSignal.any([signal, deadline]) : deadline,
		);
	}
	if (answers.length === 0) {
		throw new Error("Host did not resolve");
	}
	for (const answer of answers) {
		if (isBlockedAddress(answer.address)) {
			throw new Error("URL resolves to a disallowed address");
		}
	}
	return answers;
}

async function assertPublicHost(
	rawUrl: string,
	allowHttp: boolean,
	allowPrivate: boolean,
	signal?: AbortSignal | null,
): Promise<void> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error("Invalid URL");
	}
	if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
		throw new Error("URL must use https");
	}
	if (!allowPrivate) {
		await resolvePublic(url.hostname, signal);
	}
}

/** Node's `IncomingMessage` as a streamed WHATWG `Response`. */
function toResponse(response: IncomingMessage, method: string): Response {
	const headers = new Headers();
	for (const [name, value] of Object.entries(response.headers)) {
		for (const entry of [value ?? []].flat()) {
			headers.append(name, entry);
		}
	}
	const status = response.statusCode ?? 502;
	if (method === "HEAD" || [204, 205, 304].includes(status)) {
		response.resume();
		return new Response(null, { status, headers });
	}
	return new Response(Readable.toWeb(response) as unknown as ReadableStream, {
		status,
		statusText: response.statusMessage,
		headers,
	});
}

/**
 * A `fetch` that can only connect to an allowed address. The check runs inside
 * the socket's `lookup`, i.e. on the very answer the connection then uses, so
 * a TTL-0 name that answers public for a pre-check and `169.254.169.254` for
 * the connect (DNS rebinding) gets nowhere. The URL keeps its hostname, so
 * `Host` and TLS SNI / certificate checks are the normal ones. Never follows
 * redirects (`safeFetch` does, re-checking each hop) and never sends cookies.
 *
 * Deliberately small: a string request body at most, no decompression (it
 * sends no `accept-encoding`, so servers answer identity). Enough for addon
 * JSON, a streamed download and a custom Nuvio backend's JSON API.
 */
export const pinnedFetch = (async (
	input: string | URL | Request,
	init: RequestInit = {},
): Promise<Response> => {
	const url = new URL(input instanceof Request ? input.url : input);
	const transport =
		url.protocol === "https:" ? https : url.protocol === "http:" ? http : null;
	if (!transport) {
		throw new Error("URL must use http(s)");
	}
	const signal = init.signal ?? undefined;
	// A literal never reaches `lookup`, so it is checked here instead.
	const literal = url.hostname.replace(/^\[|\]$/g, "");
	if (isIP(literal) && isBlockedAddress(literal)) {
		throw new Error("URL resolves to a disallowed address");
	}
	const pinnedLookup: LookupFunction = (hostname, options, callback) => {
		resolvePublic(hostname, signal).then(
			(answers) => {
				if (options.all) {
					callback(null, answers);
				} else {
					callback(null, answers[0].address, answers[0].family);
				}
			},
			(error: NodeJS.ErrnoException) => callback(error, "", 0),
		);
	};
	const method = init.method ?? "GET";
	const body = typeof init.body === "string" ? init.body : undefined;
	const headers = Object.fromEntries(new Headers(init.headers));
	if (body !== undefined) {
		headers["content-length"] = String(Buffer.byteLength(body));
	}
	return await new Promise<Response>((resolve, reject) => {
		const request = transport.request(
			url,
			{ method, headers, lookup: pinnedLookup, signal },
			(response) => resolve(toResponse(response, method)),
		);
		// Surface an abort as the caller's reason (a `TimeoutError` for
		// `AbortSignal.timeout`), the way `fetch` does, not a generic AbortError.
		request.on("error", (error) =>
			reject(signal?.aborted ? signal.reason : error),
		);
		request.end(body);
	});
}) as typeof fetch;

export interface SafeFetchOptions {
	allowHttp?: boolean;
	/** Skips the address block: only for a URL an admin set, never a user's. */
	allowPrivate?: boolean;
	maxRedirects?: number;
}

const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

/**
 * Fetches an untrusted (addon-supplied) URL with SSRF guards: a scheme allowlist,
 * a block on loopback / link-local / reserved ranges, and manual redirect
 * following so every hop is re-checked. Pass `pinnedFetch` as `fetchImpl` in
 * production: only it closes DNS rebinding (the check here resolves the name,
 * the transport resolves it again to connect) and it carries no cookies,
 * unlike a load's `event.fetch`. Tests inject their own.
 */
export async function safeFetch(
	rawUrl: string,
	fetchImpl: typeof fetch,
	init: RequestInit = {},
	{
		allowHttp = false,
		allowPrivate = false,
		maxRedirects = 4,
	}: SafeFetchOptions = {},
): Promise<Response> {
	let target = rawUrl;
	let request = init;
	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: a redirect chain is inherently sequential : each hop's URL comes from the previous response's Location header
		await assertPublicHost(target, allowHttp, allowPrivate, request.signal);
		const response = await fetchImpl(target, {
			...request,
			redirect: "manual",
		});
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) {
			return response;
		}
		const next = new URL(location, target);
		// Credentials stay with the host they were meant for, as a browser does.
		if (next.hostname !== new URL(target).hostname) {
			const headers = new Headers(request.headers);
			for (const name of CREDENTIAL_HEADERS) {
				headers.delete(name);
			}
			request = { ...request, headers };
		}
		target = next.toString();
	}
	throw new Error("Too many redirects");
}

/** `response.json()` that refuses a body past `maxBytes`, declared or streamed. */
export async function readJsonCapped(
	response: Response,
	maxBytes: number,
): Promise<unknown> {
	return JSON.parse(await readTextCapped(response, maxBytes));
}

/** `response.text()` that refuses a body past `maxBytes`, declared or streamed. */
export async function readTextCapped(
	response: Response,
	maxBytes: number,
): Promise<string> {
	if (Number(response.headers.get("content-length")) > maxBytes) {
		await response.body?.cancel().catch(() => undefined);
		throw new Error("Response too large");
	}
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = response.body?.getReader();
	for (;;) {
		// biome-ignore lint/performance/noAwaitInLoops: reading a stream is sequential by nature
		const chunk = reader ? await reader.read() : { done: true as const };
		if (chunk.done) {
			break;
		}
		size += chunk.value.byteLength;
		if (size > maxBytes) {
			await reader?.cancel().catch(() => undefined);
			throw new Error("Response too large");
		}
		chunks.push(chunk.value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}
