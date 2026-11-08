import { serviceToken } from "#lib/services/index.js";
import type { LocalDownloads } from "./local-downloads.ts";

/** Server, process-wide: null unless `NUVIO_DOWNLOADS_DIR` names a folder. */
export const LOCAL_DOWNLOADS = serviceToken<LocalDownloads | null>(
	"LocalDownloads",
);
