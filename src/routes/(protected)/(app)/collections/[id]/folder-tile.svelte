<script lang="ts">
	import type { CollectionFolder } from "#lib/nuvio/index.js";
	import { cn } from "#lib/utils.js";

	let {
		folder,
		active,
		count = null,
		onSelect,
	}: {
		folder: Pick<
			CollectionFolder,
			"title" | "coverImageUrl" | "coverEmoji" | "tileShape" | "hideTitle"
		>;
		active: boolean;
		/** Titles in the folder, once known. */
		count?: number | null;
		onSelect: () => void;
	} = $props();

	// A tile only when the folder has something to put on one; a bare title
	// reads better as a pill than as an empty box.
	const hasArt = $derived(Boolean(folder.coverImageUrl || folder.coverEmoji));

	// Heights are fixed so a strip of mixed shapes lines up; the shape sets
	// the width.
	const shape = $derived(
		folder.tileShape === "LANDSCAPE"
			? "aspect-video"
			: folder.tileShape === "SQUARE"
				? "aspect-square"
				: "aspect-2/3",
	);

	let imageFailed = $state(false);
</script>

{#if hasArt}
  <button
    type="button"
    onclick={onSelect}
    aria-pressed={active}
    aria-label={folder.title}
    title={folder.title}
    class={cn(
      "group relative h-28 shrink-0 overflow-hidden rounded-lg bg-muted ring-2 ring-offset-2 ring-offset-background transition",
      shape,
      active ? "ring-primary" : "ring-transparent hover:ring-foreground/20",
    )}
  >
    {#if folder.coverImageUrl && !imageFailed}
      <img
        src={folder.coverImageUrl}
        alt=""
        loading="lazy"
        onerror={() => (imageFailed = true)}
        class="absolute inset-0 size-full object-cover"
      />
    {:else}
      <span
        class="absolute inset-0 grid place-items-center text-4xl"
        aria-hidden="true">{folder.coverEmoji}</span
      >
    {/if}
    {#if !folder.hideTitle}
      <span
        class="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5 text-left text-xs font-semibold text-white"
        aria-hidden="true"
      >
        {#if folder.coverImageUrl && folder.coverEmoji}{folder.coverEmoji}{" "}{/if}{folder.title}
      </span>
    {/if}
  </button>
{:else}
  <button
    type="button"
    onclick={onSelect}
    aria-pressed={active}
    class={cn(
      "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-foreground/5 text-muted-foreground hover:text-foreground",
    )}
  >
    {folder.title}
    {#if count != null}<span class="opacity-70">{count}</span>{/if}
  </button>
{/if}
