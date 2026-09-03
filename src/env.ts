import { defineEnvVars } from "@sveltejs/kit/env";

/**
 * Explicitly declared environment variables (`experimental.explicitEnvironmentVariables`
 * in vite.config.ts). Only what is declared here is readable from
 * `$app/env/private`, and each name is its own export from that module.
 *
 * Both are optional with a default, because the admin surface is opt-in: an
 * instance with no `NUVIO_ADMIN_EMAILS` simply has no admin page.
 */
export const variables = defineEnvVars({
	NUVIO_ADMIN_EMAILS: {
		description:
			"Addresses allowed to reach /admin, comma or whitespace separated. Unset means nobody can.",
		schema: (value: string | undefined) => value ?? "",
	},
	NUVIO_DATA_DIR: {
		description:
			"Directory holding the admin database (sign-in metrics + instance lock).",
		schema: (value: string | undefined) => value ?? "data",
	},
});
