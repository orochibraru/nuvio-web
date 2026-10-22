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

	// Resolution reads at a glance by colour, highest first.
	function qualityClass(quality: string): string {
		if (/4k|2160/i.test(quality)) {
			return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
		}
		if (/1080|1440/.test(quality)) {
			return "bg-primary/15 text-accent-label";
		}
		if (/720/.test(quality)) {
			return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
		}
		return "bg-foreground/10 text-foreground/80";
	}
</script>

<button
  type="button"
  {disabled}
  {onclick}
  class="group/row flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-foreground/10 bg-foreground/5 p-2.5 text-left transition-all enabled:hover:border-primary/40 enabled:hover:bg-foreground/10 enabled:active:scale-[0.99] disabled:opacity-50"
>
  <span
    class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-enabled/row:group-hover/row:bg-primary group-enabled/row:group-hover/row:text-primary-foreground"
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
      <span class="flex items-center gap-0.5 font-semibold text-accent-label"
        ><PuzzleIcon class="size-2.5" />{row.addonName}</span
      >

      {#if info.quality}
        <span
          class={`rounded-md px-1.5 py-px font-semibold ${qualityClass(info.quality)}`}
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
      {#if info.hdr}<span
          class="rounded-md bg-fuchsia-500/15 px-1.5 py-px font-semibold text-fuchsia-700 dark:text-fuchsia-300"
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
        <span
          class="flex items-center gap-0.5 font-medium text-emerald-700 dark:text-emerald-400"
        >
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
