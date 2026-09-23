<script lang="ts">
	import { BookmarkXIcon } from "@lucide/svelte";
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import FilmIcon from "@lucide/svelte/icons/film";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import TvIcon from "@lucide/svelte/icons/tv";
	import { toast } from "svelte-sonner";
	import { getMeta } from "#lib/addons/addons.remote.js";
	import type { MetaPreview } from "#lib/addons/index.js";
	import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
	import { posterSrcset } from "#lib/core/images.js";
	import { m } from "#lib/i18n/index.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { cn } from "#lib/utils.js";
	import { titleProgressFor } from "#lib/watch/playback-context.js";
	import { parseRuntimeMs } from "#lib/watch/runtime.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import ImdbRating from "./imdb-rating.svelte";

	let {
		item,
		progress,
		class: className,
		preload = "hover",
	}: {
		item: Pick<
			MetaPreview,
			| "id"
			| "type"
			| "name"
			| "poster"
			| "posterShape"
			| "releaseInfo"
			| "imdbRating"
		>;
		progress?: number;
		class?: string;
		/**
		 * When to start loading the title's page. `hover` everywhere by
		 * default; see the collection page for the one place that needs `tap`.
		 */
		preload?: "hover" | "tap";
	} = $props();

	let posterEl = $state<HTMLImageElement>();
	let broken = $state(false);
	let loaded = $state(false);
	let trackedPoster: string | null | undefined;
	$effect(() => {
		const poster = item.poster;
		if (poster !== trackedPoster) {
			// A genuinely new URL : start over.
			trackedPoster = poster;
			broken = false;
		}
		// The library grid re-publishes fresh `item` objects on every sync tick, so
		// this effect re-runs constantly. When the `<img>` element is reused with an
		// unchanged `src`, the browser fires no new `load` event : trust the element
		// (`complete` + a real `naturalWidth`) instead of waiting on `onload`, or the
		// poster gets stuck behind its skeleton forever.
		loaded = Boolean(posterEl?.complete && posterEl.naturalWidth > 0);
	});

	const aspect = $derived(
		item.posterShape === "landscape"
			? "aspect-video"
			: item.posterShape === "square"
				? "aspect-square"
				: "aspect-2/3",
	);

	const rating = $derived(
		typeof item.imdbRating === "number"
			? item.imdbRating.toFixed(1)
			: item.imdbRating || null,
	);
	const contentType = $derived(item.type === "series" ? "series" : "movie");
	const inLibrary = $derived(
		sync.authoritative && sync.isInLibrary(contentType, item.id),
	);
	const watched = $derived(
		contentType === "movie" &&
			Boolean(
				titleProgressFor(sync.progress, "movie", item.id, undefined)[item.id]
					?.completed,
			),
	);

	// The link's visible content (poster, title, badges) is all decorative once
	// the link itself is labelled : fold the useful bits into one clean name.
	const linkLabel = $derived(
		[
			`${item.name} (${item.type})`,
			item.releaseInfo,
			rating ? m.media_poster_rated({ rating }) : null,
			watched ? m.media_poster_watched() : null,
			inLibrary ? m.media_poster_in_library() : null,
		]
			.filter(Boolean)
			.join(", "),
	);

	function toggleLibrary() {
		const removing = inLibrary;
		sync.toggleLibrary({
			contentId: item.id,
			contentType,
			remove: removing,
			name: item.name,
			poster: item.poster ?? null,
			releaseInfo: item.releaseInfo ?? null,
			imdbRating:
				typeof item.imdbRating === "number"
					? item.imdbRating
					: Number(item.imdbRating) || null,
		});
		toast.success(
			removing
				? m.library_removed_title({ title: item.name })
				: m.library_added_title({ title: item.name }),
		);
	}

	function toggleWatched() {
		if (watched) {
			sync.clearProgress({ contentId: item.id, season: null, episode: null });
			toast.success(m.media_marked_unwatched({ title: item.name }));
		} else {
			sync.markWatched({
				contentId: item.id,
				contentType: "movie",
				videoId: item.id,
				season: null,
				episode: null,
				durationMs: parseRuntimeMs(null),
			});
			toast.success(m.media_marked_watched({ title: item.name }));
		}
	}

	// A poster only has the catalog preview : no episode list : so marking a
	// whole series watched needs an on-demand meta fetch, unlike the movie
	// toggle above which needs nothing but the id.
	let markingAllWatched = $state(false);

	async function markAllWatched() {
		if (markingAllWatched) {
			return;
		}
		markingAllWatched = true;
		try {
			const result = await getMeta({ type: item.type, id: item.id }).catch(
				() => null,
			);
			const videos = result?.meta.videos ?? [];
			if (videos.length === 0) {
				toast.error(m.media_episodes_load_failed({ title: item.name }));
				return;
			}
			const durationMs = parseRuntimeMs(result?.meta.runtime ?? null);
			sync.markManyWatched(
				videos.map((video) => ({
					contentId: item.id,
					contentType: "series" as const,
					videoId: video.id,
					season: video.season ?? null,
					episode: video.episode ?? null,
					durationMs,
				})),
			);
			toast.success(m.media_marked_watched({ title: item.name }));
		} finally {
			markingAllWatched = false;
		}
	}
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="contents">
    <a
      href={resolve(`detail/${item.type}/${encodeURIComponent(item.id)}`)}
      aria-label={linkLabel}
      class={cn("group/poster flex flex-col gap-2.5", className)}
      data-sveltekit-preload-data={preload}
    >
      <div
        class={cn(
          "relative overflow-hidden rounded-xl bg-muted ring-1 ring-border transition-all dark:ring-white/10 duration-300 ease-out",
          "group-hover/poster:-translate-y-1 group-hover/poster:shadow-[0_24px_50px_-16px] group-hover/poster:shadow-black/70 group-hover/poster:ring-primary/60",
          aspect,
        )}
      >
        {#if item.poster && !broken}
          {@const responsive = posterSrcset(item.poster)}
          {#if !loaded}
            <div class="skeleton absolute inset-0"></div>
          {/if}
          <img
            bind:this={posterEl}
            src={item.poster}
            srcset={responsive?.srcset}
            sizes={responsive?.sizes}
            alt=""
            loading="lazy"
            decoding="async"
            onload={() => (loaded = true)}
            onerror={() => (broken = true)}
            class={cn(
              "size-full object-cover [transition:transform_200ms_ease-out,opacity_500ms_ease-out] group-hover/poster:scale-[1.06]",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        {:else}
          <div
            class="flex size-full flex-col items-center justify-center gap-2 bg-linear-to-br from-muted via-muted to-background p-3 text-center"
          >
            {#if item.type === "series"}
              <TvIcon class="size-7 text-muted-foreground/50" />
            {:else}
              <FilmIcon class="size-7 text-muted-foreground/50" />
            {/if}
            <span
              class="line-clamp-3 text-sm font-medium text-muted-foreground"
            >
              {item.name}
            </span>
          </div>
        {/if}

        <div
          class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100"
        ></div>

        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 group-hover/poster:opacity-100"
        >
          <span
            class="flex size-11 translate-y-1 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-transform duration-300 group-hover/poster:translate-y-0"
          >
            <PlayIcon class="size-5 translate-x-px fill-white" />
          </span>
        </div>

        {#if rating}
          <ImdbRating {rating} variant="badge" class="absolute top-2 left-2" />
        {/if}

        {#if watched || inLibrary}
          <div aria-hidden="true" class="absolute top-2 right-2 flex gap-1">
            {#if watched}
              <span
                title={m.media_watched()}
                class="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-1 ring-black/10"
              >
                <CheckIcon class="size-3" />
              </span>
            {/if}
            {#if inLibrary}
              <span
                title={m.media_in_library()}
                class="flex size-5 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-md"
              >
                <BookmarkIcon class="size-3 fill-current" />
              </span>
            {/if}
          </div>
        {/if}

        {#if progress != null && progress > 0}
          <div class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              class="h-full rounded-r-full bg-primary"
              style={`width: ${Math.min(100, Math.max(0, progress * 100))}%`}
            ></div>
          </div>
        {/if}
      </div>

      <div class="min-w-0">
        <p
          class="truncate text-sm font-medium text-foreground/90 transition-colors group-hover/poster:text-foreground"
        >
          {item.name}
        </p>
        {#if item.releaseInfo}
          <p class="truncate text-xs text-muted-foreground">
            {item.releaseInfo}
          </p>
        {/if}
      </div>
    </a>
  </ContextMenu.Trigger>

  <ContextMenu.Content class="w-52">
    <ContextMenu.Item onSelect={toggleLibrary}>
      {#if inLibrary}
        <BookmarkXIcon /> {m.library_remove()}
      {:else}
        <PlusIcon /> {m.library_add()}
      {/if}
    </ContextMenu.Item>
    {#if contentType === "movie"}
      <ContextMenu.Item onSelect={toggleWatched}>
        {#if watched}
          <EyeOffIcon /> {m.common_mark_unwatched()}
        {:else}
          <EyeIcon /> {m.common_mark_watched()}
        {/if}
      </ContextMenu.Item>
    {:else}
      <ContextMenu.Item disabled={markingAllWatched} onSelect={markAllWatched}>
        <EyeIcon /> {m.common_mark_all_watched()}
      </ContextMenu.Item>
    {/if}
    <ContextMenu.Separator />
    <ContextMenu.Item
      onSelect={() =>
        goto(resolve(`detail/${item.type}/${encodeURIComponent(item.id)}`))}
      ><InfoIcon />{m.media_view_details()}</ContextMenu.Item
    >
  </ContextMenu.Content>
</ContextMenu.Root>
