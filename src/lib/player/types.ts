import type { SubtitleSize } from "#lib/settings/ui-settings.js";
import type { PlayerInfo } from "./info.ts";

export interface SubtitleTrack {
	id?: string;
	lang: string;
	url: string;
	addonName?: string;
	sdh?: boolean;
}

/** A `SubtitleTrack` with the derived fields the picker renders. */
export interface SubtitleOption extends SubtitleTrack {
	key: string;
	name: string;
}

export interface SubtitleAppearance {
	subtitleSize?: SubtitleSize;
	subtitleColor?: string;
	subtitleBackground?: boolean;
}

export interface VideoPlayerProps {
	src: string;
	/** Backdrop image : loading treatment, `<video poster>`, info-overlay bed. */
	poster?: string | null;
	/** 2:3 poster shown in the info overlay. */
	posterImage?: string | null;
	logo?: string | null;
	title: string;
	subheading?: string | null;
	startTime?: number;
	subtitles?: SubtitleTrack[];
	/** Fill the parent instead of holding a 16:9 box (full-page player). */
	fill?: boolean;
	certification?: string | null;
	genres?: string[];
	/** Meta for the in-player info overlay (Info button + auto-on-pause). */
	info?: PlayerInfo | null;
	/** Link to the full detail page, from inside the info overlay. */
	detailHref?: string;
	subtitleSize?: SubtitleSize;
	subtitleColor?: string;
	subtitleBackground?: boolean;
	preferredLanguage?: string;
	/** The stream label hints at an audio codec the browser can't decode. */
	audioRisky?: boolean;
	/** The stream label hints at a video codec the browser can't decode. */
	videoRisky?: boolean;
	/** Direct stream URL for the external-player handoff on a fatal error. */
	externalUrl?: string | null;
	/** Intro window in seconds (from TheIntroDB) : drives "Skip intro". */
	introStart?: number | null;
	introEnd?: number | null;
	/** Seconds at which the end credits start : drives the outro handoff. */
	outroStart?: number | null;
	/** Shrink to a corner PiP (the page's end-of-show takeover). */
	minimized?: boolean;
	onProgress?: (position: number, duration: number) => void;
	onEnded?: () => void;
	/** Fired once when playback first reaches `outroStart`. */
	onOutro?: () => void;
	onBack?: () => void;
	onSources?: () => void;
	onSubtitleAppearance?: (patch: SubtitleAppearance) => void;
	/** Series only: open the episode drawer. */
	onEpisodes?: () => void;
	/** Series only: jump to the next episode. */
	onNext?: () => void;
}
