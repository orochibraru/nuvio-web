import ArchiveIcon from "@lucide/svelte/icons/archive";
import BabyIcon from "@lucide/svelte/icons/baby";
import BookUserIcon from "@lucide/svelte/icons/book-user";
import ClapperboardIcon from "@lucide/svelte/icons/clapperboard";
import CompassIcon from "@lucide/svelte/icons/compass";
import DramaIcon from "@lucide/svelte/icons/drama";
import FaceGrinningIcon from "@lucide/svelte/icons/face-grinning";
import Gamepad2Icon from "@lucide/svelte/icons/gamepad-2";
import GhostIcon from "@lucide/svelte/icons/ghost";
import HeartIcon from "@lucide/svelte/icons/heart";
import HourglassIcon from "@lucide/svelte/icons/hourglass";
import LandmarkIcon from "@lucide/svelte/icons/landmark";
import ListVideoIcon from "@lucide/svelte/icons/list-video";
import MicIcon from "@lucide/svelte/icons/mic";
import MountainIcon from "@lucide/svelte/icons/mountain";
import MusicIcon from "@lucide/svelte/icons/music";
import RocketIcon from "@lucide/svelte/icons/rocket";
import ScanEyeIcon from "@lucide/svelte/icons/scan-eye";
import SirenIcon from "@lucide/svelte/icons/siren";
import SkullIcon from "@lucide/svelte/icons/skull";
import SparklesIcon from "@lucide/svelte/icons/sparkles";
import SwordsIcon from "@lucide/svelte/icons/swords";
import TagIcon from "@lucide/svelte/icons/tag";
import TrophyIcon from "@lucide/svelte/icons/trophy";
import TvIcon from "@lucide/svelte/icons/tv";
import UsersIcon from "@lucide/svelte/icons/users";
import UtensilsCrossedIcon from "@lucide/svelte/icons/utensils-crossed";
import WandSparklesIcon from "@lucide/svelte/icons/wand-sparkles";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

// Matched on a fragment of the lowercased name: addons spell genres their own
// way ("Sci-Fi", "Science Fiction", "Sci-Fi & Fantasy"). First match wins.
const GENRE_ICONS: Array<[string, Component]> = [
	["sci", RocketIcon],
	["anim", SparklesIcon],
	["action", ZapIcon],
	["martial", SwordsIcon],
	["war", SwordsIcon],
	["adventure", CompassIcon],
	["comedy", FaceGrinningIcon],
	["crime", SirenIcon],
	["document", ClapperboardIcon],
	["drama", DramaIcon],
	["kid", BabyIcon],
	["family", UsersIcon],
	["fantasy", WandSparklesIcon],
	["horror", GhostIcon],
	["music", MusicIcon],
	["myster", ScanEyeIcon],
	["romance", HeartIcon],
	["sport", TrophyIcon],
	["thriller", SkullIcon],
	["suspense", HourglassIcon],
	["western", MountainIcon],
	["histor", LandmarkIcon],
	["biograph", BookUserIcon],
	["talk", MicIcon],
	["game", Gamepad2Icon],
	["food", UtensilsCrossedIcon],
	["reality", TvIcon],
	["mini", ListVideoIcon],
	["soap", TvIcon],
	["classic", ArchiveIcon],
];

/** An icon for a genre name, or a plain tag for one nobody planned for. */
export function genreIcon(name: string): Component {
	const key = name.toLowerCase();
	return (
		GENRE_ICONS.find(([fragment]) => key.includes(fragment))?.[1] ?? TagIcon
	);
}
