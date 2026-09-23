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

function isBlockedIpv4(ip: string): boolean {
	const value = ipv4ToInt(ip);
	return (
		inRange(value, "0.0.0.0", 8) ||
		inRange(value, "10.0.0.0", 8) ||
		inRange(value, "100.64.0.0", 10) ||
		inRange(value, "127.0.0.0", 8) ||
		inRange(value, "169.254.0.0", 16) ||
		inRange(value, "172.16.0.0", 12) ||
		inRange(value, "192.0.0.0", 24) ||
		inRange(value, "192.168.0.0", 16) ||
		inRange(value, "198.18.0.0", 15) ||
		inRange(value, "224.0.0.0", 4) ||
		inRange(value, "240.0.0.0", 4)
	);
}

function isBlockedIpv6(ip: string): boolean {
	const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
	if (normalized === "::" || normalized === "::1") {
		return true;
	}
	if (
		normalized.startsWith("fe80") ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd")
	) {
		return true;
	}
	// IPv4-mapped addresses reach the IPv4 host, so they get the IPv4 rules.
	// Two spellings arrive here: `lookup()` hands back the dotted form
	// (`::ffff:10.0.0.1`), while `new URL()` normalizes a literal in the host
	// to hex (`[::ffff:a00:1]`) : missing the second let a mapped literal
	// through to a private address.
	const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) {
		return isBlockedIpv4(mapped[1]);
	}
	const mappedHex = normalized.match(
		/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
	);
	if (mappedHex) {
		const high = Number.parseInt(mappedHex[1], 16);
		const low = Number.parseInt(mappedHex[2], 16);
		return isBlockedIpv4(
			[high >>> 8, high & 0xff, low >>> 8, low & 0xff].join("."),
		);
	}
	return false;
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

/** Resolves `host` (a name or a literal) and throws unless *every* answer is public. */
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
	await resolvePublic(url.hostname, signal);
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
 * A `fetch` that can only connect to a public address. The check runs inside
 * the socket's `lookup`, i.e. on the very answer the connection then uses, so
 * a TTL-0 name that answers public for a pre-check and `169.254.169.254` for
 * the connect (DNS rebinding) gets nowhere. The URL keeps its hostname, so
 * `Host` and TLS SNI / certificate checks are the normal ones. Never follows
 * redirects (`safeFetch` does, re-checking each hop) and never sends cookies.
 *
 * Deliberately small: no request body, no decompression (it sends no
 * `accept-encoding`, so servers answer identity). Enough for addon JSON and a
 * streamed download; reach for more only when a caller needs it.
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
	return await new Promise<Response>((resolve, reject) => {
		const request = transport.request(
			url,
			{
				method,
				headers: Object.fromEntries(new Headers(init.headers)),
				lookup: pinnedLookup,
				signal,
			},
			(response) => resolve(toResponse(response, method)),
		);
		// Surface an abort as the caller's reason (a `TimeoutError` for
		// `AbortSignal.timeout`), the way `fetch` does, not a generic AbortError.
		request.on("error", (error) =>
			reject(signal?.aborted ? signal.reason : error),
		);
		request.end();
	});
}) as typeof fetch;

export interface SafeFetchOptions {
	allowHttp?: boolean;
	maxRedirects?: number;
}

/**
 * Fetches an untrusted (addon-supplied) URL with SSRF guards: a scheme allowlist,
 * a block on loopback / private / link-local ranges, and manual redirect
 * following so every hop is re-checked. Pass `pinnedFetch` as `fetchImpl` in
 * production: only it closes DNS rebinding (the check here resolves the name,
 * the transport resolves it again to connect) and it carries no cookies,
 * unlike a load's `event.fetch`. Tests inject their own.
 */
export async function safeFetch(
	rawUrl: string,
	fetchImpl: typeof fetch,
	init: RequestInit = {},
	{ allowHttp = false, maxRedirects = 4 }: SafeFetchOptions = {},
): Promise<Response> {
	let target = rawUrl;
	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: a redirect chain is inherently sequential : each hop's URL comes from the previous response's Location header
		await assertPublicHost(target, allowHttp, init.signal);
		const response = await fetchImpl(target, { ...init, redirect: "manual" });
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) {
			return response;
		}
		target = new URL(location, target).toString();
	}
	throw new Error("Too many redirects");
}
