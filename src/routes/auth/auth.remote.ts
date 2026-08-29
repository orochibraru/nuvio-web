import { invalid, redirect } from "@sveltejs/kit";
import * as v from "valibot";
import { NuvioApiError, NuvioClient } from "#lib/nuvio/index.js";
import { clearStoredSession, writeStoredSession } from "#lib/server/session.js";
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

function safeTarget(value: string): string {
	return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export const signIn = form(signInSchema, async (data, issue) => {
	const { cookies, fetch } = getRequestEvent();
	try {
		const session = await new NuvioClient({ fetch }).signInWithPassword({
			email: data.email,
			password: data.password,
		});
		writeStoredSession(cookies, session);
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
	const { cookies, fetch } = getRequestEvent();
	let hasSession = false;
	try {
		const session = await new NuvioClient({ fetch }).signUp({
			email: data.email,
			password: data.password,
		});
		hasSession = Boolean(session.access_token);
		if (hasSession) writeStoredSession(cookies, session);
	} catch (error) {
		if (error instanceof NuvioApiError) {
			if (error.status === 409 || error.status === 422) {
				invalid(issue.email("An account with this email already exists."));
			}
			invalid("Unable to create your account right now. Please try again.");
		}
		throw error;
	}
	redirect(
		303,
		hasSession ? safeTarget(data.redirectTo) : "/auth/sign-in?registered=1",
	);
});

export const signOut = form(async () => {
	const { cookies, locals } = getRequestEvent();
	try {
		await locals.nuvio.signOut();
	} catch (error) {
		if (!(error instanceof NuvioApiError)) throw error;
	}
	clearStoredSession(cookies);
	redirect(303, "/auth/sign-in");
});
