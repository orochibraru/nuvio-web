import process from "node:process";
import { error, json } from "@sveltejs/kit";
import * as v from "valibot";
import type { AuthSession } from "#lib/nuvio/index.js";
import { SESSION } from "#lib/services/index.js";
import type { RequestHandler } from "./$types";

const bodySchema = v.object({
	access_token: v.pipe(v.string(), v.nonEmpty()),
	refresh_token: v.pipe(v.string(), v.nonEmpty()),
	expires_in: v.pipe(v.number(), v.integer(), v.minValue(0)),
	user: v.looseObject({ id: v.pipe(v.string(), v.nonEmpty()) }),
	profileId: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6)),
	),
});

/**
 * Hands the Playwright run a signed-in session from tokens it got with one
 * password grant, so every spec shares that grant instead of each signing in
 * (the real auth endpoint rate-limits). It trusts the posted `user` blindly,
 * which is why it exists only under `NUVIO_E2E` : `playwright.config.ts` sets
 * it on the server it starts, nothing else does, and without it this is a 404.
 * Not `dev` too, unlike `/dev/player`: a local dev server has no business
 * minting sessions for whoever asks.
 *
 * Read straight off `process.env` for the reason `/dev/player` gives.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!process.env.NUVIO_E2E) {
		error(404, "Not found");
	}
	const body = v.safeParse(bodySchema, await request.json().catch(() => null));
	if (!body.success) {
		error(400, "Expected { access_token, refresh_token, expires_in, user }");
	}
	const { profileId, ...tokens } = body.output;
	const session = locals.services.get(SESSION);
	session.write({ ...tokens, token_type: "bearer" } as AuthSession);
	if (profileId !== undefined) {
		session.writeProfileId(profileId, true);
	}
	return json({ ok: true });
};
