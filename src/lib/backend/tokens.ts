import { serviceToken } from "#lib/services/index.js";
import type { BuiltInBackend } from "./handler.ts";

// Server, process-wide. Registered in `#lib/services/server.ts`.
export const BUILT_IN_BACKEND = serviceToken<BuiltInBackend>("BuiltInBackend");
