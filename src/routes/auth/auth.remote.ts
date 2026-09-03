import { invalid, redirect } from "@sveltejs/kit";
import * as v from "valibot";
import { canSignIn, recordSignIn } from "#lib/admin/admin-data.js";
import { NuvioApiError, NuvioClient } from "#lib/nuvio/index.js";
import { ADMIN, DATABASE, LOGGER, SESSION } from "#lib/services/index.js";
import { resolve } from "$app/paths";
import { form, getRequestEvent } from "$app/server";

const email = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Enter your email address."),
	v.email("Enter a valid email address."),
);
const redirectTo = v.optional(v.string(), "/");

const signInSchema = v.object({
	email,
	password: v.pipe(v.string(), v.nonEmpty("Enter your password.")),
	redirectTo,
});

const signUpSchema = v.object({
	email,
	password: v.pipe(
		v.string(),
		v.minLength(8, "Password must be at least 8 characters."),
	),
	redirectTo,
});

/**
 * The instance lock. Checked before the credentials reach Nuvio, so a locked
 * instance never becomes an oracle for which accounts exist upstream, and the
 * refusal is identical whether or not the password was right.
 */
function assertAllowed(email: string): void {
	const services = getRequestEvent().locals.services;
	const db = services.get(DATABASE).tryConnect();
	if (!db || canSignIn(db, email, services.get(ADMIN).isAdmin(email))) {
		return;
	}
	services.get(LOGGER).warn("Blocked sign-in: instance is locked", { email });
	invalid(
		"This server is invite-only. Ask the server admin to add your email address.",
	);
}

/**
 * Metrics are a side-effect of signing in, never a condition of it: a failed
 * write is logged and swallowed rather than turning a valid sign-in into a 500.
 */
function record(email: string, userId: string): void {
	const services = getRequestEvent().locals.services;
	const db = services.get(DATABASE).tryConnect();
	if (!db) {
		return;
	}
	try {
		recordSignIn(db, email, userId);
	} catch (error) {
		services.get(LOGGER).error("Could not record a sign-in", {
			error: error instanceof Error ? error : "Unknown error",
		});
	}
}

function safeTarget(value: string): string {
	return value.startsWith("/") && !value.startsWith("//")
		? value
		: resolve("/(protected)/(app)");
}

export const signIn = form(signInSchema, async (data, issue) => {
	const { fetch, locals } = getRequestEvent();
	assertAllowed(data.email);
	try {
		const session = await new NuvioClient({ fetch }).signInWithPassword({
			email: data.email,
			password: data.password,
		});
		locals.services.get(SESSION).write(session);
		record(session.user.email ?? data.email, session.user.id);
	} catch (error) {
		if (error instanceof NuvioApiError) {
			if (
				error.status === 400 ||
				error.status === 401 ||
				error.status === 403
			) {
				invalid(issue.password("Invalid email or password."));
			}
			invalid("Unable to sign in right now. Please try again.");
		}
		throw error;
	}
	redirect(303, safeTarget(data.redirectTo));
});

export const signUp = form(signUpSchema, async (data, issue) => {
	const { fetch, locals } = getRequestEvent();
	assertAllowed(data.email);
	let hasSession = false;
	try {
		const session = await new NuvioClient({ fetch }).signUp({
			email: data.email,
			password: data.password,
		});
		hasSession = Boolean(session.access_token);
		if (hasSession) {
			locals.services.get(SESSION).write(session);
			record(session.user.email ?? data.email, session.user.id);
		}
	} catch (error) {
		if (error instanceof NuvioApiError) {
			if (error.status === 409 || error.status === 422) {
				invalid(issue.email("An account with this email already exists."));
			}
			invalid("Unable to create your account right now. Please try again.");
		}
		throw error;
	}
	const params = new URLSearchParams({ registered: "1" });
	if (data.redirectTo && data.redirectTo !== "/") {
		params.set("redirectTo", data.redirectTo);
	}
	redirect(
		303,
		hasSession
			? safeTarget(data.redirectTo)
			: `${resolve("auth/sign-in")}?${params}`,
	);
});

export const signOut = form(async () => {
	const { locals } = getRequestEvent();
	try {
		await locals.nuvio.signOut();
	} catch (error) {
		if (!(error instanceof NuvioApiError)) {
			throw error;
		}
	}
	locals.services.get(SESSION).clear();
	redirect(303, resolve("auth/sign-in"));
});
