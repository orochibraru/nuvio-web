<script lang="ts">
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import CaptionsOffIcon from "@lucide/svelte/icons/captions-off";
	import CastIcon from "@lucide/svelte/icons/cast";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import ListVideoIcon from "@lucide/svelte/icons/list-video";
	import MaximizeIcon from "@lucide/svelte/icons/maximize";
	import MinimizeIcon from "@lucide/svelte/icons/minimize";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PictureInPictureIcon from "@lucide/svelte/icons/picture-in-picture-2";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";
	import TvMinimalPlayIcon from "@lucide/svelte/icons/tv-minimal-play";
	import Volume1Icon from "@lucide/svelte/icons/volume-1";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { m } from "#lib/i18n/index.js";
	import type { createPlayerTransportActions } from "#lib/player/state/transport-actions.svelte.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";
	import { cn } from "#lib/utils.js";
	import SettingsMenu from "./settings-menu.svelte";

	let {
		transport,
		player,
		media,
		onNext,
		onEpisodes,
		hasSubtitles,
		activeCaption,
		castAvailable,
		casting,
		onCast,
		subtitlesOpen,
		onToggleSubtitles,
		settingsOpen,
		onSettingsOpenChange,
		boost,
		boostPending,
		onBoostSelect,
	}: {
		transport: PlayerTransportState;
		player: Pick<
			ReturnType<typeof createPlayerTransportActions>,
			"togglePlay" | "toggleFullscreen" | "togglePip"
		>;
		media: {
			audioTracks: Array<{ id: number; label: string }>;
			activeAudioTrack: number;
			selectAudioTrack: (id: number) => void;
		};
		onNext?: () => void;
		onEpisodes?: () => void;
		hasSubtitles: boolean;
		activeCaption: string | null;
		/** A cast target exists : the button is hidden entirely otherwise. */
		castAvailable: boolean;
		casting: boolean;
		onCast: () => void;
		subtitlesOpen: boolean;
		onToggleSubtitles: () => void;
		settingsOpen: boolean;
		onSettingsOpenChange: (open: boolean) => void;
		boost: number;
		boostPending: boolean;
		onBoostSelect: (level: number) => void;
	} = $props();
</script>

<div class="flex items-center gap-2 sm:gap-3">
  <Button
    variant="ghost"
    size="icon"
    aria-label={transport.ended
      ? m.player_replay()
      : transport.paused
        ? m.common_play()
        : m.player_pause()}
    title={transport.ended
      ? m.player_replay_hint()
      : transport.paused
        ? m.player_play_hint()
        : m.player_pause_hint()}
    onclick={player.togglePlay}
    class="size-10 rounded-full bg-white text-black shadow-[0_0_20px_rgb(255_255_255/0.25)] transition-transform hover:scale-105 hover:bg-white/85 hover:text-black dark:hover:bg-white/85 [&_svg]:size-5"
  >
    {#if transport.ended}
      <RotateCwIcon />
    {:else if transport.paused}
      <PlayIcon class="fill-current " />
    {:else}
      <PauseIcon class="fill-current" />
    {/if}
  </Button>

  <div class="flex items-center gap-1.5">
    <Button
      variant="ghost"
      size="icon"
      aria-label={transport.muted ? m.player_unmute() : m.player_mute()}
      title={transport.muted ? m.player_unmute_hint() : m.player_mute_hint()}
      onclick={() => (transport.muted = !transport.muted)}
      class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
    >
      {#if transport.muted || transport.volume === 0}
        <VolumeXIcon />
      {:else if transport.volume < 0.5}
        <Volume1Icon />
      {:else}
        <Volume2Icon />
      {/if}
    </Button>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      bind:value={transport.volume}
      aria-label={m.player_volume()}
      title={m.player_volume_hint()}
      class="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-white sm:block [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
    />
    {#if boost > 1}
      <span
        class="rounded-full bg-primary/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white ring-1 ring-primary/50"
        >{boost * 100}%</span
      >
    {/if}
  </div>


  <div
    class="ml-auto flex items-center gap-0.5 rounded-full bg-white/5 p-1 ring-1 ring-white/10 sm:gap-1"
  >
    {#if onNext}
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.player_next_episode()}
        title={m.player_next_episode_hint()}
        onclick={onNext}
        class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
      >
        <SkipForwardIcon />
      </Button>
    {/if}
    {#if onEpisodes}
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.common_episodes()}
        title={m.player_episodes_hint()}
        onclick={onEpisodes}
        class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
      >
        <ListVideoIcon />
      </Button>
    {/if}
    {#if hasSubtitles}
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.player_subtitles()}
        title={activeCaption
          ? m.player_subtitles_on_hint({ caption: activeCaption })
          : m.player_subtitles_off_hint()}
        aria-pressed={subtitlesOpen}
        onclick={onToggleSubtitles}
        class={cn(
          "rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5",
          activeCaption && "text-primary",
        )}
      >
        {#if activeCaption}
          <CaptionsIcon />
        {:else}
          <CaptionsOffIcon />
        {/if}
      </Button>
    {/if}

    <DropdownMenu.Root open={settingsOpen} onOpenChange={onSettingsOpenChange}>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.nav_settings()}
            title={m.player_settings_hint()}
            class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
            {...props}
          >
            <GaugeIcon />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <SettingsMenu
        rate={transport.rate}
        audioTracks={media.audioTracks}
        activeAudioTrack={media.activeAudioTrack}
        onRateSelect={(value) => (transport.rate = value)}
        onAudioTrackSelect={(id) => media.selectAudioTrack(id)}
        {boost}
        {boostPending}
        {onBoostSelect}
      />
    </DropdownMenu.Root>

    {#if castAvailable}
      <Button
        variant="ghost"
        size="icon"
        aria-label={casting ? m.player_stop_casting() : m.common_cast()}
        title={casting ? m.player_stop_casting() : m.player_cast_hint()}
        aria-pressed={casting}
        onclick={onCast}
        class={cn("rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5", casting && "text-primary")}
      >
        {#if casting}
          <TvMinimalPlayIcon />
        {:else}
          <CastIcon />
        {/if}
      </Button>
    {/if}

    {#if typeof document !== "undefined" && document.pictureInPictureEnabled}
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.player_pip()}
        title={m.player_pip()}
        onclick={player.togglePip}
        class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
      >
        <PictureInPictureIcon />
      </Button>
    {/if}

    <Button
      variant="ghost"
      size="icon"
      aria-label={transport.fullscreen
        ? m.player_exit_fullscreen()
        : m.player_fullscreen()}
      title={transport.fullscreen
        ? m.player_exit_fullscreen_hint()
        : m.player_fullscreen_hint()}
      onclick={player.toggleFullscreen}
      class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
    >
      {#if transport.fullscreen}<MinimizeIcon />{:else}<MaximizeIcon />{/if}
    </Button>
  </div>
</div>
