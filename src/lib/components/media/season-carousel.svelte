<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import ListChecksIcon from "@lucide/svelte/icons/list-checks";
	import PlayIcon from "@lucide/svelte/icons/play";
	import TvIcon from "@lucide/svelte/icons/tv";
	import type { MetaVideo } from "#lib/addons/index.js";
	import ScrollRail from "#lib/components/layout/scroll-rail.svelte";
	import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
	import { cn } from "#lib/utils.js";
	import ImdbRating from "./imdb-rating.svelte";

	let {
		videos,
		seriesRuntime = null,
		progress = {},
		initialSeason = null,
		onPlay,
		onToggleWatched,
		onPrefetch,
		onMarkUpTo,
		onMarkSeason,
	}: {
		videos: MetaVideo[];
		seriesRuntime?: string | null;
		progress?: Record<string, { fraction: number; completed: boolean }>;
		initialSeason?: number | null;
		onPlay: (videoId: string) => void;
		onToggleWatched: (
			videoId: string,
			season: number | null,
			episode: number | null,
			watched: boolean,
		) => void;
		/** Hover/focus intent on an episode : warm its streams in the background. */
		onPrefetch?: (videoId: string) => void;
		/** Mark every episode up to and including this one as watched. */
		onMarkUpTo?: (videoId: string) => void;
		/** Mark a whole season (optionally plus every earlier season) watched. */
		onMarkSeason?: (season: number, includeEarlier: boolean) => void;
	} = $props();

	const grouped = $derived.by(() => {
		const bySeason = new Map<number, MetaVideo[]>();
		for (const video of videos) {
			if (video.season == null || video.season < 1) {
				continue;
			}
			const bucket = bySeason.get(video.season);
			if (bucket) {
				bucket.push(video);
			} else {
				bySeason.set(video.season, [video]);
			}
		}
		return [...bySeason.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([season, list]) => ({
				season,
				episodes: [...list].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0)),
			}));
	});

	let brokenThumbs = $state<Record<string, boolean>>({});
	let activeSeason = $state<number | null>(null);
	$effect(() => {
		if (grouped.length === 0) {
			return;
		}
		if (
			activeSeason === null ||
			!grouped.some((g) => g.season === activeSeason)
		) {
			activeSeason = initialSeason ?? grouped[0].season;
		}
	});

	const current = $derived(
		grouped.find((g) => g.season === activeSeason) ?? grouped[0],
	);
	const watchedCount = $derived(
		current
			? current.episodes.filter((ep) => progress[ep.id]?.completed).length
			: 0,
	);
	const totalEpisodes = $derived(
		grouped.reduce((sum, group) => sum + group.episodes.length, 0),
	);

	function airDate(value: string | undefined): string | null {
		if (!value) {
			return null;
		}
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? null
			: date.toLocaleDateString(undefined, {
					day: "numeric",
					month: "short",
					year: "numeric",
				});
	}
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-baseline gap-2">
      <h2 class="text-xl font-semibold tracking-tight">Episodes</h2>
      {#if current}
        <span class="text-sm text-muted-foreground">
          {#if grouped.length > 1}
            {grouped.length} seasons · {totalEpisodes} episodes
          {:else}
            {current.episodes.length} episode{current.episodes.length === 1
              ? ""
              : "s"}
          {/if}{watchedCount > 0 ? ` · ${watchedCount} watched` : ""}
        </span>
      {/if}
    </div>

    {#if grouped.length > 1}
      <ScrollRail
        label="Seasons"
        class="-mx-1 max-w-full"
        trackClass="gap-1.5 px-1"
        arrows={false}
      >
        {#each grouped as group (group.season)}
          <ContextMenu.Root>
            <ContextMenu.Trigger class="contents">
              <button
                type="button"
                onclick={() => (activeSeason = group.season)}
                class={cn(
                  "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition",
                  activeSeason === group.season
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground/5 text-muted-foreground hover:text-foreground",
                )}
              >
                Season {group.season}
              </button>
            </ContextMenu.Trigger>
            {#if onMarkSeason}
              <ContextMenu.Content class="w-60">
                <ContextMenu.Item
                  onSelect={() => onMarkSeason(group.season, false)}
                >
                  <CheckIcon /> Mark season {group.season} watched
                </ContextMenu.Item>
                {#if group.season > grouped[0].season}
                  <ContextMenu.Item
                    onSelect={() => onMarkSeason(group.season, true)}
                  >
                    <ListChecksIcon /> Mark through season {group.season}
                  </ContextMenu.Item>
                {/if}
              </ContextMenu.Content>
            {/if}
          </ContextMenu.Root>
        {/each}
      </ScrollRail>
    {/if}
  </div>

  {#if current}
    <ScrollRail
      label="Episodes"
      resetKey={activeSeason}
      arrowTop="top-1/3"
      trackClass="snap-x scroll-px-2 gap-4 pt-1 pb-2"
    >
      {#each current.episodes as episode (episode.id)}
        {@const ep = progress[episode.id]}
        {@const date = airDate(episode.released)}
        <ContextMenu.Root>
          <ContextMenu.Trigger class="contents">
            <div
              class="group/ep relative flex w-72 shrink-0 snap-start content-auto flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 sm:w-80"
              onmouseenter={() => onPrefetch?.(episode.id)}
              onfocusin={() => onPrefetch?.(episode.id)}
              role="presentation"
            >
              <button
                type="button"
                onclick={() => onPlay(episode.id)}
                class="flex flex-col text-left"
              >
                <div
                  class="relative aspect-video w-full overflow-hidden bg-muted"
                >
                  <span
                    class="absolute inset-0 flex items-center justify-center"
                  >
                    <TvIcon class="size-8 text-muted-foreground/30" />
                  </span>
                  {#if episode.thumbnail && !brokenThumbs[episode.id]}
                    <img
                      src={episode.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onerror={() =>
                        (brokenThumbs = {
                          ...brokenThumbs,
                          [episode.id]: true,
                        })}
                      class="relative size-full object-cover transition-transform duration-200 group-hover/ep:scale-105"
                    />
                  {/if}
                  <div
                    class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent"
                  ></div>
                  <span
                    class="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-md"
                  >
                    E{episode.episode}
                  </span>
                  <span
                    class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/ep:opacity-100"
                  >
                    <span
                      class="flex size-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md"
                    >
                      <PlayIcon class="size-5 translate-x-px fill-white" />
                    </span>
                  </span>
                  {#if ep && !ep.completed && ep.fraction > 0.02}
                    <div class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                      <div
                        class="h-full rounded-r-full bg-primary"
                        style={`width: ${ep.fraction * 100}%`}
                      ></div>
                    </div>
                  {/if}
                </div>
                <div class="flex flex-col gap-1.5 p-3">
                  <p
                    class={cn(
                      "line-clamp-1 text-sm font-semibold",
                      ep?.completed && "text-muted-foreground",
                    )}
                  >
                    <span class="text-muted-foreground">{episode.episode}.</span
                    >
                    {episode.title}
                  </p>
                  <div
                    class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
                  >
                    {#if episode.rating}
                      <ImdbRating
                        rating={episode.rating}
                        label
                        class="text-foreground/80"
                      />
                    {/if}
                    {#if date}<span>{date}</span>{/if}
                    {#if seriesRuntime}<span>{seriesRuntime}</span>{/if}
                  </div>
                  {#if episode.overview}
                    <p
                      class="line-clamp-3 text-xs leading-relaxed text-muted-foreground"
                    >
                      {episode.overview}
                    </p>
                  {/if}
                </div>
              </button>
              <button
                type="button"
                aria-label={ep?.completed
                  ? "Mark as unwatched"
                  : "Mark as watched"}
                title={ep?.completed ? "Mark as unwatched" : "Mark as watched"}
                onclick={() =>
                  onToggleWatched(
                    episode.id,
                    episode.season ?? null,
                    episode.episode ?? null,
                    Boolean(ep?.completed),
                  )}
                class={cn(
                  "absolute top-2 right-2 flex size-7 items-center justify-center rounded-full transition",
                  ep?.completed
                    ? "bg-primary text-primary-foreground"
                    : "bg-black/50 text-white opacity-0 backdrop-blur-md group-hover/ep:opacity-100 hover:bg-black/70",
                )}
              >
                <CheckIcon class="size-3.5" />
              </button>
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Content class="w-56">
            <ContextMenu.Item
              onSelect={() =>
                onToggleWatched(
                  episode.id,
                  episode.season ?? null,
                  episode.episode ?? null,
                  Boolean(ep?.completed),
                )}
            >
              {#if ep?.completed}
                <EyeOffIcon /> Mark as unwatched
              {:else}
                <EyeIcon /> Mark as watched
              {/if}
            </ContextMenu.Item>
            {#if onMarkUpTo}
              <ContextMenu.Item onSelect={() => onMarkUpTo(episode.id)}>
                <ListChecksIcon /> Mark up to here watched
              </ContextMenu.Item>
            {/if}
          </ContextMenu.Content>
        </ContextMenu.Root>
      {/each}
    </ScrollRail>
  {/if}
</div>
