<script lang="ts">
	import ClapperboardIcon from "@lucide/svelte/icons/clapperboard";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import FilmIcon from "@lucide/svelte/icons/film";
	import TvIcon from "@lucide/svelte/icons/tv";
	import QueryError from "#lib/components/query-error.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import type { WatchStats } from "#lib/stats/stats-data.js";
	import { streamed } from "#lib/stream.svelte.js";
	import { invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";

	let { stats: streamedStats }: { stats: Promise<WatchStats | null> } =
		$props();

	// Resolved by the account load and streamed down : `null` once ready means
	// the pull failed, which the retry below covers.
	const statsStream = streamed(() => streamedStats, null as WatchStats | null);
	const stats = $derived(statsStream.current);
	const statsFailed = $derived(statsStream.ready && stats === null);
	const totalMinutes = $derived(
		(stats?.movieMinutes ?? 0) + (stats?.seriesMinutes ?? 0),
	);

	function humanDuration(minutes: number): string {
		if (minutes < 60) {
			return `${minutes} min`;
		}
		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			const rem = minutes % 60;
			return rem ? `${hours} h ${rem} min` : `${hours} h`;
		}
		const days = Math.floor(hours / 24);
		return `${days} d ${hours % 24} h`;
	}
</script>

<div class="flex flex-col gap-6">
  {#if statsFailed}
    <QueryError
      message="Couldn't load your stats."
      onRetry={() => invalidateAll()}
    />
  {:else if !stats}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {#each { length: 4 } as _card, index (index)}
        <div class="skeleton h-28 rounded-xl"></div>
      {/each}
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card.Root class="border border-foreground/10">
        <Card.Header class="pb-2">
          <Card.Description class="flex items-center gap-1.5">
            <ClockIcon class="size-3.5" /> Time watched
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-2xl font-bold tabular-nums">
            {humanDuration(totalMinutes)}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {humanDuration(stats.movieMinutes)} movies ·
            {humanDuration(stats.seriesMinutes)} shows
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root class="border border-foreground/10">
        <Card.Header class="pb-2">
          <Card.Description class="flex items-center gap-1.5">
            <FilmIcon class="size-3.5" /> Movies
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-2xl font-bold tabular-nums">{stats.movieCount}</p>
          <p class="mt-1 text-xs text-muted-foreground">finished</p>
        </Card.Content>
      </Card.Root>

      <Card.Root class="border border-foreground/10">
        <Card.Header class="pb-2">
          <Card.Description class="flex items-center gap-1.5">
            <TvIcon class="size-3.5" /> Shows
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-2xl font-bold tabular-nums">{stats.seriesCount}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {stats.episodeCount} episode{stats.episodeCount === 1 ? "" : "s"}
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root class="border border-foreground/10">
        <Card.Header class="pb-2">
          <Card.Description class="flex items-center gap-1.5">
            <ClapperboardIcon class="size-3.5" /> Prefers
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-2xl font-bold capitalize">
            {stats.preferredFormat === "series"
              ? "Shows"
              : stats.preferredFormat === "movie"
                ? "Movies"
                : "—"}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">by time watched</p>
        </Card.Content>
      </Card.Root>
    </div>

    {#if stats.topGenres.length > 0}
      <Card.Root class="border border-foreground/10">
        <Card.Header>
          <Card.Title>Top genres</Card.Title>
          <Card.Description
            >Across your recently watched titles.</Card.Description
          >
        </Card.Header>
        <Card.Content class="flex flex-wrap gap-2">
          {#each stats.topGenres as genre (genre.name)}
            <a
              href={resolve(`search?q=${encodeURIComponent(genre.name)}`)}
              class="rounded-full bg-foreground/5 px-3 py-1.5 text-sm text-foreground/90 transition hover:bg-foreground/10 hover:text-foreground"
            >
              {genre.name}
              <span class="text-muted-foreground">· {genre.count}</span>
            </a>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}
</div>
