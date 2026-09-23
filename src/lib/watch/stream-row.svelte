<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import UsersIcon from "@lucide/svelte/icons/users";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import { m } from "#lib/i18n/index.js";
	import {
		isPlayable,
		type ResolvedStream,
		type StreamKind,
		type StreamMeta,
	} from "./stream-format.ts";

	/** One source in the drawer : its label, parsed into chips. */
	let {
		row,
		disabled,
		onclick,
	}: {
		row: ResolvedStream & { info: StreamMeta; kind: StreamKind };
		disabled: boolean;
		onclick: () => void;
	} = $props();

	const info = $derived(row.info);
	const playable = $derived(isPlayable(row));
</script>

<button
  type="button"
  {disabled}
  {onclick}
  class="group/row flex min-w-0 flex-1 items-start gap-3 rounded-lg border border-border bg-card p-2.5 text-left transition-all enabled:hover:border-primary/40 enabled:hover:bg-card disabled:opacity-50"
>
  <span
    class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground transition-colors group-enabled/row:group-hover/row:bg-primary group-enabled/row:group-hover/row:text-primary-foreground"
  >
    {#if playable}
      <PlayIcon class="size-3.5 fill-current" />
    {:else}
      <ExternalLinkIcon class="size-3.5" />
    {/if}
  </span>
  <div class="min-w-0 flex-1">
    <p class="line-clamp-2 text-xs font-medium leading-snug">
      {info.title}
    </p>

    <div
      class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground"
    >
      <span
        class="flex items-center gap-0.5 font-medium text-foreground/70"
        ><PuzzleIcon class="size-2.5" />{row.addonName}</span
      >

      {#if info.quality}
        <span
          class="rounded bg-foreground/10 px-1 py-px font-medium text-foreground/80"
        >
          {info.quality}
        </span>
      {/if}
      {#if info.source}<span class="rounded bg-foreground/5 px-1 py-px"
          >{info.source}</span
        >{/if}
      {#if info.videoCodec}<span
          class="rounded bg-foreground/5 px-1 py-px"
          >{info.videoCodec}</span
        >{/if}
      {#if info.hdr}<span class="rounded bg-foreground/5 px-1 py-px"
          >{info.hdr}</span
        >{/if}
      {#if info.tenBit}<span class="rounded bg-foreground/5 px-1 py-px"
          >10-bit</span
        >{/if}
      {#if info.audioCodec}<span
          class="rounded bg-foreground/5 px-1 py-px"
          >{info.audioCodec}</span
        >{/if}
      {#each info.languages as lang (lang)}
        <span class="rounded bg-foreground/5 px-1 py-px">{lang}</span>
      {/each}

      {#if info.size}<span class="text-foreground/60">{info.size}</span
        >{/if}
      {#if row.kind === "p2p" && info.seeders != null}
        <span class="flex items-center gap-0.5">
          <UsersIcon class="size-2.5" />{info.seeders}
        </span>
      {/if}
      {#if row.kind === "p2p"}
        <span class="rounded bg-foreground/5 px-1 py-px">P2P</span>
      {/if}

      {#if playable && info.audio === "risky"}
        <span
          class="flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-warning-foreground"
          title={m.watch_row_audio_risky_title()}
        >
          <VolumeXIcon class="size-2.5" /> {m.watch_row_may_be_silent()}
        </span>
      {/if}
      {#if playable && info.video === "risky"}
        <span
          class="flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-warning-foreground"
          title={m.watch_row_video_risky_title()}
        >
          <FilmIcon class="size-2.5" /> {m.watch_row_may_not_play()}
        </span>
      {/if}
      {#if !playable}<span
          class="rounded bg-warning/15 px-1 py-px text-warning-foreground"
          >{m.watch_row_external()}</span
        >{/if}
    </div>
  </div>
</button>
