<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CheckIcon from "@lucide/svelte/icons/check";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { getMeta } from "$lib/addons/addons.remote";
	import MediaHero from "$lib/components/media-hero.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { libraryIds, toggleLibrary } from "$lib/library/library.remote";
	import { cn } from "$lib/utils.js";

	const type = $derived(page.params.type ?? "movie");
	const id = $derived(page.params.id ?? "");
	const contentType = $derived(type === "series" ? "series" : "movie");

	const metaQuery = $derived(getMeta({ type, id }));
	const libraryQuery = libraryIds();

	const meta = $derived(metaQuery.current?.meta);
	const inLibrary = $derived((libraryQuery.current ?? []).includes(id));
	const rating = $derived(
		typeof meta?.imdbRating === "number"
			? meta.imdbRating.toFixed(1)
			: meta?.imdbRating || null,
	);

	const seasons = $derived.by(() => {
		const set = new Set<number>();
		for (const video of meta?.videos ?? []) {
			if (video.season != null && video.season > 0) {
				set.add(video.season);
			}
		}
		return [...set].sort((a, b) => a - b);
	});

	let chosenSeason = $state<number | null>(null);
	const activeSeason = $derived(chosenSeason ?? seasons[0] ?? null);
	const episodes = $derived(
		(meta?.videos ?? [])
			.filter((video) => video.season === activeSeason)
			.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0)),
	);

	const firstEpisodeId = $derived(
		[...(meta?.videos ?? [])]
			.filter((video) => (video.season ?? 0) > 0)
			.sort(
				(a, b) =>
					(a.season ?? 0) - (b.season ?? 0) ||
					(a.episode ?? 0) - (b.episode ?? 0),
			)[0]?.id ?? null,
	);

	let toggling = $state(false);

	function watch(videoId: string) {
		goto(`/watch/${contentType}/${encodeURIComponent(videoId)}`);
	}

	async function toggle() {
		if (!meta) {
			return;
		}
		toggling = true;
		try {
			await toggleLibrary({
				content_id: id,
				content_type: contentType,
				remove: inLibrary,
				name: meta.name,
				poster: meta.poster,
				background: meta.background,
				description: meta.description,
				release_info: meta.releaseInfo,
				imdb_rating:
					typeof meta.imdbRating === "number"
						? meta.imdbRating
						: Number(meta.imdbRating) || undefined,
				genres: meta.genres,
			});
		} finally {
			toggling = false;
		}
	}
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => history.back()}
		class="absolute top-20 left-0 z-10 flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border backdrop-blur-md transition hover:bg-background/80"
	>
		<ArrowLeftIcon class="size-4" /> Back
	</button>

	{#if metaQuery.error}
		<div class="pt-28">
			<div class="mx-auto max-w-md rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-14 text-center">
				<p class="text-lg font-semibold tracking-tight">No metadata for this title</p>
				<p class="mt-1 text-sm text-muted-foreground">
					No installed addon provides <code>{type}</code> metadata for
					<code>{id}</code>.
				</p>
				<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
			</div>
		</div>
	{:else if !meta}
		<div class="mx-[calc(50%-50vw)] -mt-20 min-h-[70vh] px-6 pt-44">
			<div class="mx-auto flex max-w-(--breakpoint-2xl) items-end gap-8">
				<div class="skeleton hidden aspect-2/3 w-52 shrink-0 rounded-2xl lg:block"></div>
				<div class="flex w-full max-w-2xl flex-col gap-4">
					<div class="skeleton h-12 w-2/3 rounded-lg"></div>
					<div class="skeleton h-4 w-1/3 rounded"></div>
					<div class="skeleton h-20 w-full rounded-lg"></div>
					<div class="skeleton h-10 w-64 rounded-lg"></div>
				</div>
			</div>
		</div>
	{:else}
		<MediaHero
			title={meta.name}
			logo={meta.logo}
			background={meta.background}
			poster={meta.poster}
			showPoster
			description={meta.description}
			{rating}
			year={meta.releaseInfo}
			runtime={meta.runtime}
			genres={meta.genres ?? []}
		>
			{#snippet actions()}
				{#if contentType === "movie"}
					<Button size="lg" onclick={() => watch(id)}>
						<PlayIcon data-icon="inline-start" class="fill-current" /> Watch
					</Button>
				{:else if firstEpisodeId}
					<Button size="lg" onclick={() => watch(firstEpisodeId)}>
						<PlayIcon data-icon="inline-start" class="fill-current" /> Play S1E1
					</Button>
				{/if}
				<Button size="lg" variant="secondary" disabled={toggling} onclick={toggle}>
					{#if toggling}
						<Spinner data-icon="inline-start" />
					{:else if inLibrary}
						<CheckIcon data-icon="inline-start" />
					{:else}
						<PlusIcon data-icon="inline-start" />
					{/if}
					{inLibrary ? "In library" : "Add to library"}
				</Button>
			{/snippet}
		</MediaHero>

		<div class="flex flex-col gap-10 pt-2">
			{#if meta.director?.length || meta.cast?.length || meta.writer?.length}
				<div class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
					{#if meta.director?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Director</p>
							<p class="mt-1 text-foreground/90">{meta.director.join(", ")}</p>
						</div>
					{/if}
					{#if meta.writer?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Writer</p>
							<p class="mt-1 text-foreground/90">{meta.writer.slice(0, 3).join(", ")}</p>
						</div>
					{/if}
					{#if meta.cast?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cast</p>
							<p class="mt-1 text-foreground/90">{meta.cast.slice(0, 5).join(", ")}</p>
						</div>
					{/if}
				</div>
			{/if}

			{#if contentType === "series" && seasons.length > 0}
				<div class="flex flex-col gap-4">
					<div class="flex flex-wrap items-center gap-3">
						<h2 class="text-xl font-semibold tracking-tight">Episodes</h2>
						{#if seasons.length > 1}
							<div class="no-scrollbar flex gap-2 overflow-x-auto">
								{#each seasons as season (season)}
									<button
										type="button"
										onclick={() => (chosenSeason = season)}
										class={cn(
											"shrink-0 rounded-full px-3 py-1 text-sm font-medium transition",
											season === activeSeason
												? "bg-primary text-primary-foreground"
												: "bg-foreground/5 text-muted-foreground hover:text-foreground",
										)}
									>
										Season {season}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="flex flex-col gap-2">
						{#each episodes as episode (episode.id)}
							<button
								type="button"
								onclick={() => watch(episode.id)}
								class="group/ep flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 p-2.5 text-left transition-all hover:border-primary/40 hover:bg-card"
							>
								<span class="w-8 shrink-0 text-center text-lg font-semibold text-muted-foreground">
									{episode.episode}
								</span>
								<div class="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-muted">
									{#if episode.thumbnail}
										<img
											src={episode.thumbnail}
											alt=""
											loading="lazy"
											class="size-full object-cover transition-transform duration-500 group-hover/ep:scale-105"
										/>
									{/if}
									<span
										class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/ep:opacity-100"
									>
										<PlayIcon class="size-6 fill-white text-white" />
									</span>
								</div>
								<div class="min-w-0 flex-1 py-1">
									<p class="truncate text-sm font-semibold">{episode.title}</p>
									{#if episode.released}
										<p class="mt-0.5 text-xs text-muted-foreground">
											{new Date(episode.released).toLocaleDateString(undefined, {
												day: "numeric",
												month: "short",
												year: "numeric",
											})}
										</p>
									{/if}
									{#if episode.overview}
										<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{episode.overview}</p>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if contentType === "movie" && !meta.description}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<FilmIcon class="size-4" /> No synopsis available for this title.
				</div>
			{/if}
		</div>
	{/if}
</div>
