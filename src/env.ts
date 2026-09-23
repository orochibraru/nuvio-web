import { defineEnvVars } from "@sveltejs/kit/env";
import {
	LOG_FORMATS,
	LOG_LEVELS,
	type LogFormat,
	type LogLevel,
} from "#lib/services/logger.service.js";

const defaults = {
	adminEmails: "",
	dataDir: "data",
	logFormat: "console",
	// Empty, not "info": services/server.ts picks debug in dev, info otherwise.
	logLevel: "",
	sessionSecret: "",
};

const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Explicitly declared environment variables (`experimental.explicitEnvironmentVariables`
 * in vite.config.ts). Only what is declared here is readable from
 * `$app/env/private`, and each name is its own export from that module.
 *
 * All are optional with a default: the admin surface is opt-in (an instance
 * with no `NUVIO_ADMIN_EMAILS` simply has no admin page), and the session
 * secret falls back to a generated file in the data directory.
 */
export const variables = defineEnvVars({
	NUVIO_ADMIN_EMAILS: {
		description:
			"Addresses allowed to reach /admin, comma or whitespace separated. Unset means nobody can.",
		schema: (value: string | undefined) => value ?? defaults.adminEmails,
	},
	NUVIO_DATA_DIR: {
		description:
			"Directory holding the admin database (sign-in metrics + instance lock).",
		schema: (value: string | undefined) => value ?? defaults.dataDir,
	},
	NUVIO_SESSION_SECRET: {
		description:
			"Signs the session-id cookie and encrypts the Nuvio tokens stored in <NUVIO_DATA_DIR> (32+ characters); changing it signs everyone out. Unset means one is generated into <NUVIO_DATA_DIR>/session-secret on first boot.",
		schema: (value: string | undefined) => {
			if (value && value.length < MIN_SESSION_SECRET_LENGTH) {
				throw new Error(
					`NUVIO_SESSION_SECRET is too short: use at least ${MIN_SESSION_SECRET_LENGTH} characters (openssl rand -hex 32).`,
				);
			}
			return value || defaults.sessionSecret;
		},
	},
	NUVIO_LOG_FORMAT: {
		description:
			"Log output shape: 'console' (colorized, default) or 'json' (one object per line, for a log shipper).",
		schema: (value: string | undefined) => {
			if (value && !LOG_FORMATS.includes(value as LogFormat)) {
				throw new Error(
					`Invalid NUVIO_LOG_FORMAT: ${value}. Valid formats are: ${LOG_FORMATS.join(", ")}`,
				);
			}
			return (value || defaults.logFormat) as LogFormat;
		},
	},
	NUVIO_LOG_LEVEL: {
		description:
			"Minimum level to print. Unset means 'debug' in dev and 'info' in production.",
		schema: (value: string | undefined) => {
			if (value && !LOG_LEVELS.includes(value as LogLevel)) {
				throw new Error(
					`Invalid NUVIO_LOG_LEVEL: ${value}. Valid levels are: ${LOG_LEVELS.join(", ")}`,
				);
			}
			return (value || defaults.logLevel) as LogLevel | "";
		},
	},
});
