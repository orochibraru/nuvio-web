<script lang="ts">
	import AudioLinesIcon from "@lucide/svelte/icons/audio-lines";
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
	import SpeakerIcon from "@lucide/svelte/icons/speaker";
	import TvMinimalPlayIcon from "@lucide/svelte/icons/tv-minimal-play";
	import Volume1Icon from "@lucide/svelte/icons/volume-1";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
	import { BOOST_LEVELS } from "#lib/player/boost.js";
	import type { PlayerMenu } from "#lib/player/state/panel-toggles.svelte.js";
	import type { createPlayerTransportActions } from "#lib/player/state/transport-actions.svelte.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";
	import { cn } from "#lib/utils.js";
	import Hint from "./hint.svelte";
	import OptionMenu from "./option-menu.svelte";

	const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
		openMenu,
		onMenuOpenChange,
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
		openMenu: PlayerMenu | null;
		onMenuOpenChange: (menu: PlayerMenu, open: boolean) => void;
		boost: number;
		boostPending: boolean;
		onBoostSelect: (level: number) => void;
	} = $props();
</script>

<div class="flex items-center gap-2 sm:gap-3">
  <Hint label={transport.ended ? m.player_replay_hint() : transport.paused ? m.player_play_hint() : m.player_pause_hint()}>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        aria-label={transport.ended
          ? m.player_replay()
          : transport.paused
            ? m.common_play()
            : m.player_pause()}
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
    {/snippet}
  </Hint>

  <div class="flex items-center gap-1.5">
    <Hint label={transport.muted ? m.player_unmute_hint() : m.player_mute_hint()}>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          aria-label={transport.muted ? m.player_unmute() : m.player_mute()}
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
      {/snippet}
    </Hint>
    <Hint label={m.player_volume_hint()}>
      {#snippet child({ props })}
        <input
          {...props}
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={transport.volume}
          aria-label={m.player_volume()}
          class="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-white sm:block [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
      {/snippet}
    </Hint>
    <OptionMenu
      open={openMenu === "boost"}
      onOpenChange={(open) => onMenuOpenChange("boost", open)}
      label={m.player_volume_boost()}
      options={BOOST_LEVELS.map((level) => ({
        value: String(level),
        label: level === 1 ? m.player_boost_off() : `${level * 100}%`,
      }))}
      value={String(boost)}
      onSelect={(value) => onBoostSelect(Number(value))}
      active={boost > 1}
      disabled={boostPending}
      align="start"
    >
      <SpeakerIcon />
    </OptionMenu>
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
      <Hint label={m.player_next_episode_hint()}>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={m.player_next_episode()}
            onclick={onNext}
            class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
          >
            <SkipForwardIcon />
          </Button>
        {/snippet}
      </Hint>
    {/if}
    {#if onEpisodes}
      <Hint label={m.player_episodes_hint()}>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={m.common_episodes()}
            onclick={onEpisodes}
            class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
          >
            <ListVideoIcon />
          </Button>
        {/snippet}
      </Hint>
    {/if}
    {#if hasSubtitles}
      <Hint label={activeCaption ? m.player_subtitles_on_hint({ caption: activeCaption }) : m.player_subtitles_off_hint()}>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={m.player_subtitles()}
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
        {/snippet}
      </Hint>
    {/if}

    {#if media.audioTracks.length > 1}
      <OptionMenu
        open={openMenu === "audio"}
        onOpenChange={(open) => onMenuOpenChange("audio", open)}
        label={m.player_audio()}
        options={media.audioTracks.map((track) => ({
          value: String(track.id),
          label: track.label,
        }))}
        value={String(media.activeAudioTrack)}
        onSelect={(value) => media.selectAudioTrack(Number(value))}
      >
        <AudioLinesIcon />
      </OptionMenu>
    {/if}

    <OptionMenu
      open={openMenu === "speed"}
      onOpenChange={(open) => onMenuOpenChange("speed", open)}
      label={m.player_playback_speed()}
      options={RATES.map((rate) => ({
        value: String(rate),
        label: rate === 1 ? m.player_speed_normal() : `${rate}×`,
      }))}
      value={String(transport.rate)}
      onSelect={(value) => (transport.rate = Number(value))}
      active={transport.rate !== 1}
    >
      <GaugeIcon />
    </OptionMenu>

    {#if castAvailable}
      <Hint label={casting ? m.player_stop_casting() : m.player_cast_hint()}>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={casting ? m.player_stop_casting() : m.player_cast_hint()}
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
        {/snippet}
      </Hint>
    {/if}

    {#if typeof document !== "undefined" && document.pictureInPictureEnabled}
      <Hint label={m.player_pip()}>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={m.player_pip()}
            onclick={player.togglePip}
            class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
          >
            <PictureInPictureIcon />
          </Button>
        {/snippet}
      </Hint>
    {/if}

    <Hint label={transport.fullscreen ? m.player_exit_fullscreen_hint() : m.player_fullscreen_hint()}>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          aria-label={transport.fullscreen
            ? m.player_exit_fullscreen()
            : m.player_fullscreen()}
          onclick={player.toggleFullscreen}
          class="rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5"
        >
          {#if transport.fullscreen}<MinimizeIcon />{:else}<MaximizeIcon />{/if}
        </Button>
      {/snippet}
    </Hint>
  </div>
</div>
