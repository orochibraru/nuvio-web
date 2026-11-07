<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
	import type { createMpvFallback } from "#lib/player/state/mpv-fallback.svelte.js";
	import MpvEnginePlayer from "./mpv-engine-player.svelte";

	// What the player page shows while mpv has the source: our controls over
	// it when it draws in this window, else a screen about mpv's own window.
	let {
		mpv,
		title,
		subheading,
		onBack,
		onSources,
	}: {
		mpv: ReturnType<typeof createMpvFallback>;
		title: string;
		subheading?: string | null;
		onBack: () => void;
		onSources: () => void;
	} = $props();
</script>

{#if mpv.shown?.embedded && mpv.shown.status === "playing" && mpv.engine}
  <MpvEnginePlayer
    engine={mpv.engine}
    {title}
    {subheading}
    {onBack}
    {onSources}
  />
{:else if mpv.shown}
  {@const session = mpv.shown}
  <div
    class="relative z-10 flex max-w-md flex-col items-center gap-4 px-6 text-center"
    data-testid="mpv-screen"
  >
    <p class="text-lg font-semibold">
      {#if session.status === "playing"}
        {m.player_mpv_playing()}
      {:else if session.status === "failed"}
        {m.player_mpv_failed()}
      {:else}
        {m.player_mpv_closed()}
      {/if}
    </p>
    <p class="text-sm text-white/60">{m.player_mpv_body()}</p>
    <div class="flex flex-wrap items-center justify-center gap-2">
      {#if session.status !== "playing"}
        <Button onclick={() => mpv.play(session.position)}>
          <PlayIcon data-icon="inline-start" class="fill-current" />
          {m.player_mpv_reopen()}
        </Button>
      {/if}
      <Button variant="secondary" onclick={onSources}>
        {m.watch_choose_source()}
      </Button>
      <Button variant="ghost" onclick={onBack}>
        <ArrowLeftIcon data-icon="inline-start" /> {m.common_back()}
      </Button>
    </div>
  </div>
{/if}
