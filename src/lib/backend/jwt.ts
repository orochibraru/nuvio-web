import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import * as v from "valibot";

export const ACCESS_TOKEN_SECONDS = 60 * 60;
const MAX_TOKEN_LENGTH = 4096;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface AccessClaims {
	sub: string;
	email: string;
	session_id: string;
	aud: "authenticated";
	role: "authenticated";
	iat: number;
	exp: number;
	is_anonymous: false;
}

const headerSchema = v.object({
	alg: v.literal("HS256"),
	typ: v.optional(v.literal("JWT")),
});

const claimsSchema = v.object({
	sub: v.pipe(v.string(), v.uuid()),
	email: v.pipe(v.string(), v.maxLength(254)),
	session_id: v.pipe(v.string(), v.uuid()),
	aud: v.literal("authenticated"),
	role: v.literal("authenticated"),
	iat: v.pipe(v.number(), v.integer()),
	exp: v.pipe(v.number(), v.integer()),
	is_anonymous: v.literal(false),
});

export type VerifiedToken =
	| { ok: true; claims: AccessClaims }
	| { ok: false; reason: "invalid" | "expired" };

export function deriveSigningKey(secret: string): Buffer {
	return Buffer.from(
		hkdfSync("sha256", secret, "", "nuvio-web built-in backend jwt v1", 32),
	);
}

function encode(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(key: Buffer, input: string): Buffer {
	return createHmac("sha256", key).update(input).digest();
}

export function signAccessToken(
	key: Buffer,
	claims: Omit<AccessClaims, "aud" | "role" | "iat" | "exp" | "is_anonymous">,
	nowSeconds: number,
): string {
	const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
		...claims,
		aud: "authenticated",
		role: "authenticated",
		iat: nowSeconds,
		exp: nowSeconds + ACCESS_TOKEN_SECONDS,
		is_anonymous: false,
	} satisfies AccessClaims)}`;
	return `${body}.${signature(key, body).toString("base64url")}`;
}

function decodeJson(segment: string): unknown {
	try {
		return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

export function verifyAccessToken(
	key: Buffer,
	token: string,
	nowSeconds: number,
): VerifiedToken {
	const parts = token.length <= MAX_TOKEN_LENGTH ? token.split(".") : [];
	if (parts.length !== 3 || !parts.every((part) => SEGMENT.test(part))) {
		return { ok: false, reason: "invalid" };
	}
	const [header, payload, given] = parts as [string, string, string];
	if (!v.is(headerSchema, decodeJson(header))) {
		return { ok: false, reason: "invalid" };
	}
	const expected = signature(key, `${header}.${payload}`);
	const actual = Buffer.from(given, "base64url");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
		return { ok: false, reason: "invalid" };
	}
	const claims = v.safeParse(claimsSchema, decodeJson(payload));
	if (!claims.success) {
		return { ok: false, reason: "invalid" };
	}
	if (claims.output.exp <= nowSeconds) {
		return { ok: false, reason: "expired" };
	}
	return { ok: true, claims: claims.output };
}
