<script lang="ts">
	import ClapperboardIcon from "@lucide/svelte/icons/clapperboard";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import FilmIcon from "@lucide/svelte/icons/film";
	import TvIcon from "@lucide/svelte/icons/tv";
	import { resolve } from "$app/paths";
	import * as Card from "$lib/components/ui/card/index.js";
	import { watchStats } from "$lib/stats/stats.remote";
	import { pageTitle } from "$lib/stores/title.svelte.js";

	pageTitle.set("Stats");

	const statsQuery = watchStats();
	const stats = $derived(statsQuery.current);
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

<div class="flex max-w-4xl flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Your stats</h1>
		<p class="text-sm text-muted-foreground">
			Everything you've watched on this Nuvio account, this profile.
		</p>
	</div>

	{#if statsQuery.error}
		<p class="py-16 text-center text-sm text-destructive">
			Couldn't load your stats. Reload to try again.
		</p>
	{:else if !stats}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each { length: 4 } as _card, index (index)}
				<div class="skeleton h-28 rounded-xl"></div>
			{/each}
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Card.Root>
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

			<Card.Root>
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

			<Card.Root>
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

			<Card.Root>
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
			<Card.Root>
				<Card.Header>
					<Card.Title>Top genres</Card.Title>
					<Card.Description>Across your recently watched titles.</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-wrap gap-2">
					{#each stats.topGenres as genre (genre.name)}
						<a
							href={resolve(`/search?q=${encodeURIComponent(genre.name)}`)}
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
