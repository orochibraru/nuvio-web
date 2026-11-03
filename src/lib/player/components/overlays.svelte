<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
	import type { PlayerInfo } from "#lib/player/info.js";
	import type { AudioIssue } from "#lib/player/state/silent-audio.svelte.js";
	import FatalErrorScreen from "./fatal-error-screen.svelte";
	import PlayerInfoOverlay from "./info-overlay.svelte";
	import PlaybackLoading from "./playback-loading.svelte";
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
		loadingLabel,
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
		loadingLabel: string;
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
    label={loadingLabel}
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
  <div
    class="player-frame pointer-events-none absolute inset-x-0 bottom-32 z-20 flex justify-end px-4 sm:bottom-40 sm:px-6"
  >
    <Button onclick={onSkipIntro} class="pointer-events-auto shadow-lg">
      {m.player_skip_intro()}
    </Button>
  </div>
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
