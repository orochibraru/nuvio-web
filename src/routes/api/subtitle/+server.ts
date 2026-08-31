import { error } from "@sveltejs/kit";
import { safeFetch } from "#lib/server/safe-fetch.js";
import type { RequestHandler } from "./$types";

function srtToVtt(input: string): string {
	const body = input
		.replace(/^﻿/, "")
		.replace(/\r+/g, "")
		.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
	return `WEBVTT\n\n${body}`;
}

/** Proxies an addon subtitle file and normalizes SRT → WebVTT so `<track>` can use it. */
export const GET: RequestHandler = async ({ url, fetch, locals }) => {
	if (!locals.session) {
		error(401, "Not signed in");
	}
	const target = url.searchParams.get("url");
	if (!target) {
		error(400, "Missing subtitle url");
	}

	let response: Response;
	try {
		response = await safeFetch(target, fetch, {
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		error(502, "Subtitle source unreachable");
	}
	if (!response.ok) {
		error(502, `Subtitle source responded ${response.status}`);
	}

	const raw = await response.text();
	const vtt = raw.trimStart().startsWith("WEBVTT") ? raw : srtToVtt(raw);

	return new Response(vtt, {
		headers: {
			"content-type": "text/vtt; charset=utf-8",
			"cache-control": "public, max-age=86400",
		},
	});
};
