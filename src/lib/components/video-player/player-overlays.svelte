<script lang="ts">
	import PlaybackLoading from "#lib/components/playback-loading.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import type { PlayerInfo } from "#lib/watch/player-info.js";
	import PlayerInfoOverlay from "#lib/watch/player-info-overlay.svelte";
	import type { AudioIssue } from "#lib/watch/silent-audio.svelte.js";
	import FatalErrorScreen from "./fatal-error-screen.svelte";
	import SilentAudioBanner from "./silent-audio-banner.svelte";
	import VideoDecodeBanner from "./video-decode-banner.svelte";

	let {
		poster = null,
		posterImage = null,
		logo = null,
		title,
		subheading = null,
		certification = null,
		genres = [],
		info = null,
		detailHref = "",
		minimized,
		loading,
		fatalError,
		silentAudioIssue,
		videoDecodeIssue,
		externalUrl = null,
		onSources,
		onBack,
		onDismissSilentAudio,
		onDismissVideoDecode,
		showSkipIntro,
		onSkipIntro,
		infoOpen,
		infoAutoOpened,
		onResumeInfo,
		onCloseInfo,
	}: {
		poster?: string | null;
		posterImage?: string | null;
		logo?: string | null;
		title: string;
		subheading?: string | null;
		certification?: string | null;
		genres?: string[];
		info?: PlayerInfo | null;
		detailHref?: string;
		minimized: boolean;
		loading: boolean;
		fatalError: string | null;
		silentAudioIssue: AudioIssue | null;
		videoDecodeIssue: boolean;
		externalUrl?: string | null;
		onSources?: () => void;
		onBack?: () => void;
		onDismissSilentAudio: () => void;
		onDismissVideoDecode: () => void;
		showSkipIntro: boolean;
		onSkipIntro: () => void;
		infoOpen: boolean;
		infoAutoOpened: boolean;
		onResumeInfo: () => void;
		onCloseInfo: () => void;
	} = $props();
</script>

{#if loading && !fatalError}
  <PlaybackLoading
    backdrop={poster}
    {logo}
    {title}
    {certification}
    {genres}
    label="Loading stream"
  />
{/if}

{#if silentAudioIssue && !fatalError && !minimized}
  <SilentAudioBanner
    noTrack={silentAudioIssue === "no-track"}
    {onSources}
    onDismiss={onDismissSilentAudio}
  />
{/if}

{#if videoDecodeIssue && !fatalError && !minimized}
  <VideoDecodeBanner {onSources} onDismiss={onDismissVideoDecode} />
{/if}

{#if fatalError}
  <FatalErrorScreen message={fatalError} {externalUrl} {onSources} {onBack} />
{/if}

{#if showSkipIntro}
  <Button
    onclick={onSkipIntro}
    class="absolute right-4 bottom-20 z-20 shadow-lg sm:right-6 sm:bottom-24"
  >
    Skip intro
  </Button>
{/if}

{#if infoOpen && info && !minimized}
  <PlayerInfoOverlay
    {title}
    {subheading}
    {logo}
    background={poster}
    poster={posterImage}
    {certification}
    {genres}
    {info}
    {detailHref}
    autoOpened={infoAutoOpened}
    onResume={onResumeInfo}
    onClose={onCloseInfo}
  />
{/if}
