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
	return {
		...profile,
		avatarImageUrl:
			profile.avatar_url || (entry ? resolveUrl(entry.storage_path) : null),
	};
}

export function profileInitial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || "?";
}
