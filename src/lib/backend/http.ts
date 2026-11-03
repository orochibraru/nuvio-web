import { createHash, timingSafeEqual } from "node:crypto";
import * as v from "valibot";
import { readTextCapped } from "#lib/server/safe-fetch.js";

const MAX_BODY_BYTES = 1024 * 1024;

export type Body =
	| { ok: true; value: unknown }
	| { ok: false; response: Response };

export function json(
	status: number,
	body: unknown,
	headers?: HeadersInit,
): Response {
	const response = new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
	for (const [name, value] of new Headers(headers)) {
		response.headers.set(name, value);
	}
	return response;
}

/** PostgREST's error body, for everything under `rest/v1`. */
export function restError(
	status: number,
	code: string,
	message: string,
): Response {
	return json(status, { code, message, details: null, hint: null });
}

/** GoTrue's error body, for everything under `auth/v1`. */
export function authError(
	status: number,
	errorCode: string,
	message: string,
): Response {
	return json(status, { code: status, error_code: errorCode, msg: message });
}

/** The gateway's answer for a path it doesn't route. */
export function notFound(): Response {
	return json(404, { message: "no Route matched with those values" });
}

export function safeEqual(left: string, right: string): boolean {
	const digest = (value: string) => createHash("sha256").update(value).digest();
	return timingSafeEqual(digest(left), digest(right));
}

export function bearerOf(request: Request): string | null {
	const header = request.headers.get("authorization") ?? "";
	return /^Bearer\s+(\S+)$/i.exec(header)?.[1] ?? null;
}

/** The JSON body, capped at 1 MB; an empty body is `{}`, as PostgREST takes it. */
export async function readBody(request: Request): Promise<Body> {
	let text: string;
	try {
		text = await readTextCapped(
			new Response(request.body, { headers: request.headers }),
			MAX_BODY_BYTES,
		);
	} catch {
		return {
			ok: false,
			response: json(413, { message: "Request size limit exceeded" }),
		};
	}
	if (!text.trim()) {
		return { ok: true, value: {} };
	}
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return {
			ok: false,
			response: restError(400, "PGRST102", "Empty or invalid json"),
		};
	}
}

export function issueMessage(issues: v.BaseIssue<unknown>[]): string {
	const [first] = issues;
	const path = first ? v.getDotPath(first) : null;
	return path
		? `Invalid value for ${path}: ${first?.message}`
		: `Invalid parameters: ${first?.message}`;
}
