import { invalid } from "@sveltejs/kit";
import * as v from "valibot";
import {
	addToAllowlist,
	removeFromAllowlist,
	setLocked,
} from "#lib/admin/admin-data.js";
import { requireAdmin } from "#lib/server/admin.js";
import { getDb } from "#lib/server/db.js";
import { log } from "#lib/server/log.js";
import { form } from "$app/server";

// Every one of these re-checks `requireAdmin()`. The page guard only protects
// the page: a remote function is its own endpoint and is reachable directly.

export const setInstanceLock = form(
	v.object({ locked: v.picklist(["on", "off"]) }),
	(data) => {
		const { email } = requireAdmin();
		const locked = data.locked === "on";
		setLocked(getDb(), locked);
		log.warn(`Instance ${locked ? "locked" : "unlocked"}`, { by: email });
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
		const { email } = requireAdmin();
		addToAllowlist(getDb(), data.email, email);
	},
);

export const revokeEmail = form(
	v.object({ email: v.pipe(v.string(), v.nonEmpty()) }),
	(data) => {
		const { email } = requireAdmin();
		if (data.email.trim().toLowerCase() === email.toLowerCase()) {
			invalid("You cannot remove your own address while you are signed in.");
		}
		removeFromAllowlist(getDb(), data.email);
	},
);
