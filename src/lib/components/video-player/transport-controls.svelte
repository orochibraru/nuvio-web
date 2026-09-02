<script lang="ts">
	import { cn } from "#lib/utils.js";
	import CenterControls from "./center-controls.svelte";
	import ControlRow from "./control-row.svelte";
	import type { createPlayerTransportActions } from "./player-transport-actions.svelte.js";
	import type { PlayerTransportState } from "./player-transport-state.svelte.js";
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
		onNext,
		onEpisodes,
		hasSubtitles,
		activeCaption,
		castAvailable,
		casting,
		onCast,
		onToggleSubtitles,
		onSettingsOpenChange,
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
		onNext?: () => void;
		onEpisodes?: () => void;
		hasSubtitles: boolean;
		activeCaption: string | null;
		castAvailable: boolean;
		casting: boolean;
		onCast: () => void;
		onToggleSubtitles: () => void;
		onSettingsOpenChange: (open: boolean) => void;
	} = $props();
</script>

<!-- The container is click-transparent so the info overlay behind it stays
     interactive; each bar re-enables pointer events. `invisible` (not just
     opacity-0) so a hidden bar can't swallow a tap. -->
<div
  class={cn(
    "pointer-events-none absolute inset-0 z-30 flex flex-col justify-between bg-linear-to-t from-black/80 via-black/10 to-black/60 transition-[opacity,visibility] duration-200",
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

  <!-- Bottom bar -->
  <div
    class="pointer-events-auto flex flex-col gap-2 px-3 pb-3 text-white sm:px-4 sm:pb-4"
  >
    <ScrubBar
      {transport}
      {bufferedRatio}
      {progressRatio}
      onScrub={player.onScrub}
    />
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
    />
  </div>
</div>
