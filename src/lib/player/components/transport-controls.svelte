<script lang="ts">
	import type { Chapter } from "#lib/player/chapters.js";
	import { formatTime } from "#lib/player/format.js";
	import type { createPlayerTransportActions } from "#lib/player/state/transport-actions.svelte.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";
	import { cn } from "#lib/utils.js";
	import CenterControls from "./center-controls.svelte";
	import ControlRow from "./control-row.svelte";
	import ScrubBar from "./scrub-bar.svelte";
	import TopBar from "./top-bar.svelte";

	let {
		transport,
		player,
		media,
		minimized,
		fatalError,
		infoOpen,
		subtitlesOpen,
		settingsOpen,
		title,
		subheading = null,
		hasInfo,
		onToggleInfo,
		onBack,
		onSources,
		bufferedRatio,
		progressRatio,
		chapters,
		onNext,
		onEpisodes,
		hasSubtitles,
		activeCaption,
		castAvailable,
		casting,
		onCast,
		onToggleSubtitles,
		onSettingsOpenChange,
		boost,
		boostPending,
		onBoostSelect,
	}: {
		transport: PlayerTransportState;
		player: ReturnType<typeof createPlayerTransportActions>;
		media: {
			audioTracks: Array<{ id: number; label: string }>;
			activeAudioTrack: number;
			selectAudioTrack: (id: number) => void;
		};
		minimized: boolean;
		fatalError: boolean;
		infoOpen: boolean;
		subtitlesOpen: boolean;
		settingsOpen: boolean;
		title: string;
		subheading?: string | null;
		hasInfo: boolean;
		onToggleInfo: () => void;
		onBack?: () => void;
		onSources?: () => void;
		bufferedRatio: number;
		progressRatio: number;
		chapters: Chapter[];
		onNext?: () => void;
		onEpisodes?: () => void;
		hasSubtitles: boolean;
		activeCaption: string | null;
		castAvailable: boolean;
		casting: boolean;
		onCast: () => void;
		onToggleSubtitles: () => void;
		onSettingsOpenChange: (open: boolean) => void;
		boost: number;
		boostPending: boolean;
		onBoostSelect: (level: number) => void;
	} = $props();
</script>

<!-- The container is click-transparent so the info overlay behind it stays
     interactive; each bar re-enables pointer events. `invisible` (not just
     opacity-0) so a hidden bar can't swallow a tap. -->
<div
  class={cn(
    "pointer-events-none absolute inset-0 z-30 flex flex-col justify-between bg-linear-to-t from-black/60 via-transparent to-black/60 transition-[opacity,visibility] duration-200",
    minimized || !transport.controlsVisible || fatalError
      ? "invisible opacity-0"
      : "opacity-100",
  )}
>
  <TopBar
    {title}
    {subheading}
    {hasInfo}
    {infoOpen}
    {onToggleInfo}
    {onBack}
    {onSources}
  />

  <!-- Centre transport cluster : hidden while the info or subtitles overlay
       owns the frame. -->
  {#if !transport.loading && !fatalError && !infoOpen && !subtitlesOpen}
    <CenterControls
      {transport}
      onSeek={player.seek}
      onTogglePlay={player.togglePlay}
    />
  {/if}

  <!-- Bottom bar : a floating glass panel, TV-app style. -->
  <div
    class={cn(
      "pointer-events-auto mx-3 mb-3 flex flex-col gap-2 rounded-3xl bg-linear-to-b from-white/12 to-black/55 px-4 pt-3.5 pb-2.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-300 ease-out sm:mx-auto sm:mb-6 sm:w-[min(64rem,calc(100%-3rem))] sm:px-5",
      minimized || !transport.controlsVisible || fatalError
        ? "translate-y-4"
        : "translate-y-0",
    )}
  >
    <div
      class="flex items-center gap-3 text-xs font-medium tabular-nums text-white/80"
    >
      <span class="w-12 shrink-0">{formatTime(transport.currentTime)}</span>
      <div class="min-w-0 flex-1">
        <ScrubBar
          {transport}
          {bufferedRatio}
          {progressRatio}
          {chapters}
          onScrub={player.onScrub}
        />
      </div>
      <span class="w-12 shrink-0 text-right text-white/55"
        >-{formatTime(
          Math.max(0, transport.duration - transport.currentTime),
        )}</span
      >
    </div>
    <ControlRow
      {transport}
      {player}
      {media}
      {onNext}
      {onEpisodes}
      {hasSubtitles}
      {activeCaption}
      {castAvailable}
      {casting}
      {onCast}
      {subtitlesOpen}
      {onToggleSubtitles}
      {settingsOpen}
      {onSettingsOpenChange}
      {boost}
      {boostPending}
      {onBoostSelect}
    />
  </div>
</div>
