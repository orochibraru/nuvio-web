import { httpUrlOrNull } from "#lib/core/url.js";
import type { AvatarCatalogEntry, Profile } from "./types.ts";

export interface ProfileView extends Profile {
	/** Resolved avatar image, or null when the profile falls back to a colour tile. */
	avatarImageUrl: string | null;
}

export function toProfileView(
	profile: Profile,
	catalog: Map<string, AvatarCatalogEntry>,
	resolveUrl: (storagePath: string) => string,
): ProfileView {
	const entry = profile.avatar_id ? catalog.get(profile.avatar_id) : undefined;
	// A custom backend picks these, so only an http(s) URL reaches an `src`.
	return {
		...profile,
		avatarImageUrl: httpUrlOrNull(
			profile.avatar_url || (entry ? resolveUrl(entry.storage_path) : null),
		),
	};
}

const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

/** A catalog colour, only when it is a plain hex colour: it goes into a `style`. */
export function safeColor(value: string | null | undefined): string | null {
	return value && COLOR_PATTERN.test(value) ? value : null;
}

export function profileInitial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || "?";
}
