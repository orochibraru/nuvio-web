<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import UsersIcon from "@lucide/svelte/icons/users";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
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

	const m = $derived(row.info);
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
      {m.title}
    </p>

    <div
      class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground"
    >
      <span
        class="flex items-center gap-0.5 font-medium text-foreground/70"
        ><PuzzleIcon class="size-2.5" />{row.addonName}</span
      >

      {#if m.quality}
        <span
          class="rounded bg-foreground/10 px-1 py-px font-medium text-foreground/80"
        >
          {m.quality}
        </span>
      {/if}
      {#if m.source}<span class="rounded bg-foreground/5 px-1 py-px"
          >{m.source}</span
        >{/if}
      {#if m.videoCodec}<span
          class="rounded bg-foreground/5 px-1 py-px"
          >{m.videoCodec}</span
        >{/if}
      {#if m.hdr}<span class="rounded bg-foreground/5 px-1 py-px"
          >{m.hdr}</span
        >{/if}
      {#if m.tenBit}<span class="rounded bg-foreground/5 px-1 py-px"
          >10-bit</span
        >{/if}
      {#if m.audioCodec}<span
          class="rounded bg-foreground/5 px-1 py-px"
          >{m.audioCodec}</span
        >{/if}
      {#each m.languages as lang (lang)}
        <span class="rounded bg-foreground/5 px-1 py-px">{lang}</span>
      {/each}

      {#if m.size}<span class="text-foreground/60">{m.size}</span
        >{/if}
      {#if row.kind === "p2p" && m.seeders != null}
        <span class="flex items-center gap-0.5">
          <UsersIcon class="size-2.5" />{m.seeders}
        </span>
      {/if}
      {#if row.kind === "p2p"}
        <span class="rounded bg-foreground/5 px-1 py-px">P2P</span>
      {/if}

      {#if playable && m.audio === "risky"}
        <span
          class="flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-warning-foreground"
          title="This audio codec may not play in the browser (no sound)"
        >
          <VolumeXIcon class="size-2.5" /> may be silent
        </span>
      {/if}
      {#if playable && m.video === "risky"}
        <span
          class="flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-warning-foreground"
          title="This video codec (HEVC / AV1) may not decode in the browser"
        >
          <FilmIcon class="size-2.5" /> may not play
        </span>
      {/if}
      {#if !playable}<span
          class="rounded bg-warning/15 px-1 py-px text-warning-foreground"
          >external</span
        >{/if}
    </div>
  </div>
</button>
