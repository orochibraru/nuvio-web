import { m } from "#lib/i18n/index.js";
import type { LoadFailure } from "./registry.ts";

export function failureText(reason: LoadFailure): string {
	switch (reason) {
		case "timeout":
			return m.settings_addons_failure_timeout();
		case "invalid":
			return m.settings_addons_failure_invalid();
		case "blocked":
			return m.settings_addons_failure_blocked();
		case "unreachable":
			return m.settings_addons_failure_unreachable();
		default:
			return m.settings_addons_failure_http({ status: reason });
	}
}

const TYPE_LABELS: Record<string, () => string> = {
	movie: m.common_movies,
	series: m.common_series,
	anime: m.addons_type_anime,
	tv: m.addons_type_tv,
	channel: m.addons_type_channel,
};

const RESOURCE_LABELS: Record<string, () => string> = {
	catalog: m.addons_resource_catalog,
	meta: m.addons_resource_meta,
	stream: m.addons_resource_stream,
	subtitles: m.addons_resource_subtitles,
};

export function typeLabel(type: string): string {
	return Object.hasOwn(TYPE_LABELS, type) ? TYPE_LABELS[type]() : type;
}

export function resourceLabel(resource: string): string {
	return Object.hasOwn(RESOURCE_LABELS, resource)
		? RESOURCE_LABELS[resource]()
		: resource;
}
