import { m } from "#lib/i18n/index.js";
import { formatFileSize } from "#lib/watch/stream-format.js";

/**
 * A failed download's `error`, in the viewer's language. The worker records a
 * `DownloadFailure` code; anything else (a record from before codes) reads as
 * a plain "Failed".
 */
export function failureText(error: string | null): string {
	switch (error) {
		case "drm":
			return m.downloads_error_drm();
		case "live":
			return m.downloads_error_live();
		case "playlist":
			return m.downloads_error_playlist();
		case "no-data":
			return m.downloads_error_no_data();
		default:
			break;
	}
	const http = (error ?? "").match(/^http:(\d+)$/);
	if (http) {
		return m.downloads_error_http({ status: http[1] });
	}
	const storage = (error ?? "").match(/^storage:(\d+):(-?\d+)$/);
	if (storage) {
		const size = (bytes: string) => formatFileSize(Number(bytes)) ?? "0 B";
		return m.downloads_error_storage({
			needed: size(storage[1]),
			free: size(storage[2]),
		});
	}
	return m.downloads_failed();
}
