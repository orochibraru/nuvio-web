import { invalid } from "@sveltejs/kit";
import * as v from "valibot";
import {
	addToAllowlist,
	removeFromAllowlist,
	setLocked,
} from "#lib/admin/admin-data.js";
import { requireAdmin } from "#lib/server/guards.js";
import { DATABASE, LOGGER } from "#lib/services/index.js";
import { form } from "$app/server";

// Every one of these re-checks `requireAdmin()`. The page guard only protects
// the page: a remote function is its own endpoint and is reachable directly.

export const setInstanceLock = form(
	v.object({ locked: v.picklist(["on", "off"]) }),
	(data) => {
		const { email, event } = requireAdmin();
		const services = event.locals.services;
		const locked = data.locked === "on";
		setLocked(services.get(DATABASE).connect(), locked);
		services
			.get(LOGGER)
			.warn(`Instance ${locked ? "locked" : "unlocked"}`, { by: email });
	},
);

export const allowEmail = form(
	v.object({
		email: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty("Enter an email address."),
			v.email("Enter a valid email address."),
		),
	}),
	(data) => {
		const { email, event } = requireAdmin();
		addToAllowlist(
			event.locals.services.get(DATABASE).connect(),
			data.email,
			email,
		);
	},
);

export const revokeEmail = form(
	v.object({ email: v.pipe(v.string(), v.nonEmpty()) }),
	(data) => {
		const { email, event } = requireAdmin();
		if (data.email.trim().toLowerCase() === email.toLowerCase()) {
			invalid("You cannot remove your own address while you are signed in.");
		}
		removeFromAllowlist(
			event.locals.services.get(DATABASE).connect(),
			data.email,
		);
	},
);
