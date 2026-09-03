/** Meta shown by the in-player info overlay : populated by `playbackContext`. */
export interface PlayerInfo {
	description: string | null;
	imdbRating: string | null;
	releaseInfo: string | null;
	runtime: string | null;
	status: string | null;
	country: string | null;
	awards: string | null;
	cast: string[];
	director: string[];
	writer: string[];
	episodeTitle: string | null;
	episodeOverview: string | null;
}
