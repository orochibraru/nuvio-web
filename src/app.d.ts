import type { NuvioClient, NuvioUser } from "$lib/nuvio/index.js";
import type { ProfileView } from "$lib/profile.js";

declare global {
	namespace App {
		interface Error {
			code?: string;
		}
		interface Locals {
			nuvio: NuvioClient;
			session: { user: NuvioUser } | null;
			profileId: number | null;
			authCookie: string;
			error: string;
			errorId: string;
			errorStackTrace: string;
			isAdmin: boolean;
			logger: Logger;
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
