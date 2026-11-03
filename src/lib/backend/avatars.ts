import type { AvatarCatalogEntry } from "#lib/nuvio/types.js";

interface Avatar {
	id: string;
	name: string;
	background: string;
	foreground: string;
	shape: string;
}

const AVATARS: Avatar[] = [
	{
		id: "builtin_sun",
		name: "Sun",
		background: "#FFB74D",
		foreground: "#E65100",
		shape: '<circle cx="64" cy="64" r="34"/>',
	},
	{
		id: "builtin_moon",
		name: "Moon",
		background: "#3949AB",
		foreground: "#E8EAF6",
		shape: '<path d="M78 26a40 40 0 1 0 24 70A34 34 0 0 1 78 26z"/>',
	},
	{
		id: "builtin_peak",
		name: "Peak",
		background: "#26A69A",
		foreground: "#004D40",
		shape: '<path d="M14 100 52 38l20 30 12-18 30 50z"/>',
	},
	{
		id: "builtin_diamond",
		name: "Diamond",
		background: "#EC407A",
		foreground: "#FCE4EC",
		shape: '<path d="M64 20 104 64 64 108 24 64z"/>',
	},
	{
		id: "builtin_rings",
		name: "Rings",
		background: "#5C6BC0",
		foreground: "#C5CAE9",
		shape:
			'<circle cx="64" cy="64" r="40" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="64" cy="64" r="16"/>',
	},
	{
		id: "builtin_waves",
		name: "Waves",
		background: "#29B6F6",
		foreground: "#01579B",
		shape:
			'<path d="M8 52q14-14 28 0t28 0 28 0 28 0v14q-14-14-28 0t-28 0-28 0-28 0zM8 80q14-14 28 0t28 0 28 0 28 0v14q-14-14-28 0t-28 0-28 0-28 0z"/>',
	},
	{
		id: "builtin_bloom",
		name: "Bloom",
		background: "#AB47BC",
		foreground: "#F3E5F5",
		shape:
			'<circle cx="64" cy="40" r="18"/><circle cx="88" cy="64" r="18"/><circle cx="64" cy="88" r="18"/><circle cx="40" cy="64" r="18"/>',
	},
	{
		id: "builtin_stripes",
		name: "Stripes",
		background: "#66BB6A",
		foreground: "#1B5E20",
		shape:
			'<path d="M0 24 24 0h20L0 44zM0 64 64 0h20L0 84zM0 104 104 0h20L0 124zM20 128 128 20v20L40 128zM60 128l68-68v20l-48 48z"/>',
	},
	{
		id: "builtin_grid",
		name: "Grid",
		background: "#78909C",
		foreground: "#ECEFF1",
		shape:
			'<circle cx="36" cy="36" r="10"/><circle cx="64" cy="36" r="10"/><circle cx="92" cy="36" r="10"/><circle cx="36" cy="64" r="10"/><circle cx="64" cy="64" r="10"/><circle cx="92" cy="64" r="10"/><circle cx="36" cy="92" r="10"/><circle cx="64" cy="92" r="10"/><circle cx="92" cy="92" r="10"/>',
	},
	{
		id: "builtin_spark",
		name: "Spark",
		background: "#FF7043",
		foreground: "#FFF3E0",
		shape: '<path d="M64 14 76 52 114 64 76 76 64 114 52 76 14 64 52 52z"/>',
	},
];

const CREATED_AT = "2026-11-01T00:00:00.000Z";

function storagePath(avatar: Avatar): string {
	return `built-in/${avatar.id}.svg`;
}

export function avatarCatalog(): AvatarCatalogEntry[] {
	return AVATARS.map((avatar, index) => ({
		id: avatar.id,
		display_name: avatar.name,
		storage_path: storagePath(avatar),
		category: "shape",
		sort_order: index,
		is_active: true,
		bg_color: avatar.background,
		created_at: CREATED_AT,
	}));
}

export function avatarSvg(path: string): string | null {
	const avatar = AVATARS.find((entry) => storagePath(entry) === path);
	if (!avatar) {
		return null;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256"><rect width="128" height="128" fill="${avatar.background}"/><g fill="${avatar.foreground}" color="${avatar.foreground}">${avatar.shape}</g></svg>`;
}
