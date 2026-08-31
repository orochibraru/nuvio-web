import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
	const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) {
		return isBlockedIpv4(mapped[1]);
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

async function assertPublicHost(
	rawUrl: string,
	allowHttp: boolean,
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
	const host = url.hostname.replace(/^\[|\]$/g, "");
	const addresses = isIP(host)
		? [host]
		: (await lookup(host, { all: true })).map((entry) => entry.address);
	if (addresses.length === 0) {
		throw new Error("Host did not resolve");
	}
	for (const address of addresses) {
		if (isBlockedAddress(address)) {
			throw new Error("URL resolves to a disallowed address");
		}
	}
}

export interface SafeFetchOptions {
	allowHttp?: boolean;
	maxRedirects?: number;
}

/**
 * Fetches an untrusted (addon-supplied) URL with SSRF guards: a scheme allowlist,
 * a block on loopback / private / link-local ranges, and manual redirect
 * following so every hop is re-checked. DNS rebinding between check and connect
 * is still possible; put an egress filter in front if that matters.
 */
export async function safeFetch(
	rawUrl: string,
	fetchImpl: typeof fetch,
	init: RequestInit = {},
	{ allowHttp = false, maxRedirects = 4 }: SafeFetchOptions = {},
): Promise<Response> {
	let target = rawUrl;
	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: a redirect chain is inherently sequential — each hop's URL comes from the previous response's Location header
		await assertPublicHost(target, allowHttp);
		const response = await fetchImpl(target, { ...init, redirect: "manual" });
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) {
			return response;
		}
		target = new URL(location, target).toString();
	}
	throw new Error("Too many redirects");
}
