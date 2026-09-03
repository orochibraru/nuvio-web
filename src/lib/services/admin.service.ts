/**
 * Who may reach the admin page. Deliberately *not* stored in the database:
 * that has to be decided by the deployment, not by anything a signed-in user
 * can write.
 *
 * @param rawEmails `NUVIO_ADMIN_EMAILS`, passed in rather than read here so a
 * unit test doesn't pass or fail depending on whoever's `.env` is on the box.
 */
export class AdminService {
	readonly #emails: string[];

	constructor(rawEmails: string) {
		this.#emails = AdminService.parse(rawEmails);
	}

	/** Splits on commas or whitespace and folds case. Pure, so it is testable. */
	static parse(raw: string): string[] {
		return raw
			.split(/[,\s]+/)
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}

	get emails(): readonly string[] {
		return this.#emails;
	}

	/**
	 * Callers also use this to let an admin sign in while the instance is
	 * locked and their address is off the allowlist : otherwise a typo in the
	 * allowlist locks the host out of the page that fixes it.
	 */
	isAdmin(email: string | null | undefined): boolean {
		if (!email) {
			return false;
		}
		return this.#emails.includes(email.trim().toLowerCase());
	}
}
