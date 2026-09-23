<script lang="ts">
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
	import { formatFileSize } from "#lib/watch/stream-format.js";
	import { failureText } from "./failure.ts";
	import type { DownloadRecord } from "./types.ts";

	/**
	 * The downloads, as rows. Shared by the Downloads page (which manages them)
	 * and the offline page (which only plays them) : so it reads nothing but its
	 * props, and knows nothing about the queue or the session.
	 */
	let {
		items,
		onPlay,
		manage,
	}: {
		items: readonly DownloadRecord[];
		onPlay: (record: DownloadRecord) => void;
		manage?: {
			pause: (id: string) => void;
			resume: (id: string) => void;
			remove: (id: string) => void;
		};
	} = $props();

	// Deleting can't be undone (the bytes are gone), so it takes a second click.
	let confirming = $state<string | null>(null);

	/** 0–1 when it can be known : bytes for a file, segments for HLS. */
	function fraction(record: DownloadRecord): number | null {
		if (record.totalBytes) {
			return Math.min(1, record.bytes / record.totalBytes);
		}
		// A direct file is one "file" : counting it says nothing until it's done.
		if (record.kind === "hls" && record.filesTotal) {
			return Math.min(1, record.filesDone / record.filesTotal);
		}
		return null;
	}

	function statusText(record: DownloadRecord): string {
		const size = formatFileSize(record.bytes);
		switch (record.status) {
			case "done":
				return size ?? m.media_downloaded();
			case "queued":
				return m.downloads_waiting();
			case "paused":
				return size ? m.downloads_paused_size({ size }) : m.downloads_paused();
			case "error":
				return failureText(record.error);
			default: {
				const part = fraction(record);
				const percent = part === null ? null : `${Math.floor(part * 100)}%`;
				return (
					[percent, size].filter(Boolean).join(" · ") || m.downloads_starting()
				);
			}
		}
	}
</script>

<ul class="flex flex-col gap-2">
  {#each items as record (record.id)}
    {@const part = fraction(record)}
    <li
      class="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
    >
      {#if record.poster}
        <img
          src={record.poster}
          alt=""
          class="aspect-2/3 w-12 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      {:else}
        <div class="aspect-2/3 w-12 shrink-0 rounded-md bg-muted"></div>
      {/if}
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="truncate text-sm font-medium">{record.title}</p>
        {#if record.subtitle}
          <p class="truncate text-xs text-muted-foreground">
            {record.subtitle}
          </p>
        {/if}
        <p
          class={record.status === "error"
            ? "text-xs text-destructive"
            : "text-xs text-muted-foreground"}
        >
          {statusText(record)}
        </p>
        {#if record.status !== "done"}
          <div
            class="h-1 overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-label={m.downloads_progress_label({ title: record.title })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={part === null ? undefined : Math.floor(part * 100)}
          >
            <!-- Size unknown (a server that sends no length) : pulse instead of sitting at 0. -->
            <div
              class={part === null && record.status === "downloading"
                ? "h-full w-full animate-pulse rounded-full bg-primary/40"
                : "h-full rounded-full bg-primary transition-[width]"}
              style:width={part === null && record.status === "downloading"
                ? undefined
                : `${Math.floor((part ?? 0) * 100)}%`}
            ></div>
          </div>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-1">
        {#if record.status === "done"}
          <Button
            size="icon"
            variant="secondary"
            aria-label={m.media_play_title({ title: record.title })}
            onclick={() => onPlay(record)}
          >
            <PlayIcon class="fill-current" />
          </Button>
        {:else if manage && (record.status === "downloading" || record.status === "queued")}
          <Button
            size="icon"
            variant="ghost"
            aria-label={m.downloads_pause_title({ title: record.title })}
            onclick={() => manage.pause(record.id)}
          >
            <PauseIcon />
          </Button>
        {:else if manage}
          <Button
            size="icon"
            variant="ghost"
            aria-label={m.media_resume_title({ title: record.title })}
            onclick={() => manage.resume(record.id)}
          >
            <RotateCwIcon />
          </Button>
        {/if}
        {#if manage}
          {@const armed = confirming === record.id}
          <!-- One button either way, so focus stays put between the clicks. -->
          <Button
            size={armed ? "sm" : "icon"}
            variant={armed ? "destructive" : "ghost"}
            aria-label={armed
              ? m.downloads_confirm_delete({ title: record.title })
              : m.downloads_delete_title({ title: record.title })}
            onclick={() => {
              if (armed) {
                confirming = null;
                manage.remove(record.id);
              } else {
                confirming = record.id;
              }
            }}
            onblur={() => {
              if (armed) {
                confirming = null;
              }
            }}
          >
            {#if armed}{m.common_delete()}{:else}<Trash2Icon />{/if}
          </Button>
        {/if}
      </div>
    </li>
  {/each}
</ul>
