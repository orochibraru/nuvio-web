/**
 * Responsive `srcset` for provider poster / backdrop URLs. Only TMDB image URLs
 * expose predictable size variants (`/t/p/w500/…`); everything else is returned
 * as-is with no `srcset`.
 */

const TMDB_IMAGE =
	/^(https?:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/;

const POSTER_WIDTHS = [185, 342, 500, 780];
const BACKDROP_WIDTHS = [300, 780, 1280];

function tmdbSrcset(url: string, widths: number[]): string | null {
	const match = TMDB_IMAGE.exec(url);
	if (!match) {
		return null;
	}
	const [, prefix, , path] = match;
	return widths.map((w) => `${prefix}w${w}${path} ${w}w`).join(", ");
}

/** `{ srcset, sizes }` for a poster tile, or `null` when the URL isn't resizable. */
export function posterSrcset(
	url: string | null | undefined,
): { srcset: string; sizes: string } | null {
	if (!url) {
		return null;
	}
	const srcset = tmdbSrcset(url, POSTER_WIDTHS);
	return srcset ? { srcset, sizes: "(min-width: 640px) 11rem, 40vw" } : null;
}

/** `{ srcset, sizes }` for a full-bleed backdrop, or `null`. */
export function backdropSrcset(
	url: string | null | undefined,
): { srcset: string; sizes: string } | null {
	if (!url) {
		return null;
	}
	const srcset = tmdbSrcset(url, BACKDROP_WIDTHS);
	return srcset ? { srcset, sizes: "100vw" } : null;
}
