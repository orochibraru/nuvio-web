import type { NuvioClient, NuvioUser } from "#lib/nuvio/index.js";

declare global {
	namespace App {
		interface Error {
			code?: string;
		}
		interface Locals {
			nuvio: NuvioClient;
			session: { user: NuvioUser } | null;
		}
		interface PageData {
			user?: NuvioUser | null;
		}
	}
}
