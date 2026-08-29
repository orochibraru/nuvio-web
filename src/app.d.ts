import type { NuvioClient, NuvioUser, Profile } from "#lib/nuvio/index.js";

declare global {
	namespace App {
		interface Error {
			code?: string;
		}
		interface Locals {
			nuvio: NuvioClient;
			session: { user: NuvioUser } | null;
			profileId: number | null;
		}
		interface PageData {
			user?: NuvioUser | null;
			profiles?: Profile[];
			profile?: Profile | null;
		}
	}
}
