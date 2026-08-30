<script lang="ts">
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import MediaHero from "$lib/components/media-hero.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	let { data } = $props();

	const spotlight = $derived(data.spotlight);
	const spotlightHref = $derived(
		spotlight
			? `/detail/${spotlight.type}/${encodeURIComponent(spotlight.id)}`
			: "",
	);
	const spotlightRating = $derived(
		spotlight
			? typeof spotlight.imdbRating === "number"
				? spotlight.imdbRating.toFixed(1)
				: spotlight.imdbRating || null
			: null,
	);

	// Cinemeta exposes the same catalog id ("top" → "Popular") for both movie and
	// series, so titles collide. Suffix the repeats with their type.
	const rowTitles = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const row of data.rows) {
			counts.set(row.title, (counts.get(row.title) ?? 0) + 1);
		}
		return data.rows.map((row) => {
			if ((counts.get(row.title) ?? 0) > 1) {
				const noun = row.type === "series" ? "series" : "movies";
				return `${row.title} ${noun}`;
			}
			return row.title;
		});
	});
</script>

<div class="flex flex-col gap-12">
	{#if spotlight}
		<MediaHero
			title={spotlight.name}
			logo={spotlight.logo}
			background={spotlight.background}
			poster={spotlight.poster}
			eyebrow="Featured"
			description={spotlight.description}
			rating={spotlightRating}
			year={spotlight.releaseInfo}
			genres={spotlight.genres ?? []}
		>
			{#snippet actions()}
				<Button size="lg" href={spotlightHref}>
					<PlayIcon data-icon="inline-start" class="fill-current" /> Watch now
				</Button>
				<Button size="lg" variant="secondary" href={spotlightHref}>
					<InfoIcon data-icon="inline-start" /> More info
				</Button>
			{/snippet}
		</MediaHero>
	{:else}
		<h1 class="text-3xl font-bold tracking-tight">Welcome back, {data.profile.name}</h1>
	{/if}

	{#if data.resume.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold tracking-tight">Continue watching</h2>
			<div class="no-scrollbar -mx-2 flex gap-4 overflow-x-auto scroll-smooth px-2 pt-1 pb-2">
				{#each data.resume as item (`${item.type}:${item.videoId}`)}
					<a
						href={`/watch/${item.type}/${encodeURIComponent(item.videoId)}`}
						class="group/cw relative aspect-video w-72 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-16px] hover:shadow-black/70 hover:ring-primary/60"
					>
						{#if item.background}
							<img
								src={item.background}
								alt={item.name}
								loading="lazy"
								class="size-full object-cover transition-transform duration-500 group-hover/cw:scale-105"
							/>
						{/if}
						<div class="absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent"></div>
						<span
							class="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 ring-1 ring-white/25 backdrop-blur-md transition-opacity duration-300 group-hover/cw:opacity-100"
						>
							<PlayIcon class="size-5 translate-x-px fill-white" />
						</span>
						<div class="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-white">{item.name}</p>
								{#if item.season != null && item.episode != null}
									<p class="text-xs text-white/70">S{item.season} · E{item.episode}</p>
								{/if}
							</div>
							<div class="h-1 overflow-hidden rounded-full bg-white/25">
								<div class="h-full rounded-full bg-primary" style={`width: ${item.progress * 100}%`}></div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.library.length > 0}
		<MediaRow title="My library" items={data.library} href="/library" />
	{/if}

	{#if data.rows.length === 0}
		<div class="py-6">
			<div class="mx-auto max-w-md rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-14 text-center">
				<span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
					<SparklesIcon class="size-7" />
				</span>
				<p class="mt-4 text-lg font-semibold tracking-tight">Your home feed is empty</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Add a catalog addon and rows of movies and series fill in here.
				</p>
				<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
			</div>
		</div>
	{:else}
		{#each data.rows as row, index (`${row.addonId}:${row.type}:${row.id}`)}
			<MediaRow
				title={rowTitles[index]}
				items={row.metas}
				href={`/discover?c=${encodeURIComponent(`${row.addonId}|${row.type}|${row.id}`)}`}
			/>
		{/each}
	{/if}
</div>
