import type { NuvioClient, NuvioUser } from "#lib/nuvio/index.js";
import type { ProfileView } from "#lib/nuvio/profile.js";
import type { Container } from "#lib/services/index.js";

declare global {
	namespace App {
		interface Locals {
			nuvio: NuvioClient;
			/** This request's service scope. See `#lib/services/server.js`. */
			services: Container;
			/**
			 * `accountKey` is what this server keys the user's data by (see
			 * `#lib/nuvio/backend.ts`); `backend` is a non-official backend's
			 * URL, null for the official Nuvio API; `trusted` is true when it is
			 * the instance default, the only backend whose emails count for
			 * admin and the allowlist.
			 */
			session: {
				user: NuvioUser;
				accountKey: string;
				backend: string | null;
				trusted: boolean;
			} | null;
			profileId: number | null;
			authCookie: string;
			error: string;
			errorId: string;
			errorStackTrace: string;
			isAdmin: boolean;
			message: unknown;
			userAgent: string;
		}
		interface PageData {
			user?: NuvioUser | null;
			profiles?: ProfileView[];
			profile?: ProfileView | null;
		}
		interface Platform {
			server: Bun.Server;
			request: Request;
		}
		interface Error {
			code?: string;
			errorId?: string;
		}
	}
}
