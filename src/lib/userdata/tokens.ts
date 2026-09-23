import { serviceToken } from "#lib/services/index.js";
import type { UserDataEvents } from "./events.ts";
import type { NuvioSync } from "./nuvio-sync.ts";
import type { UserDataStore } from "./store.ts";

// Server, process-wide. Registered by `registerUserDataServices`.
export const USER_DATA_STORE = serviceToken<UserDataStore>("UserDataStore");
export const USER_DATA_EVENTS = serviceToken<UserDataEvents>("UserDataEvents");
export const NUVIO_SYNC = serviceToken<NuvioSync>("NuvioSync");
