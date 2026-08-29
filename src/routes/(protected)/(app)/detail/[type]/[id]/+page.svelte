<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import StarIcon from "@lucide/svelte/icons/star";
	import { page } from "$app/state";
	import { getMeta } from "$lib/addons/addons.remote";
	import StreamList from "$lib/components/stream-list.svelte";
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
			if (video.season != null && video.season > 0) set.add(video.season);
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

	let openStreamId = $state<string | null>(null);
	let toggling = $state(false);

	async function toggle() {
		if (!meta) return;
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

<Button variant="ghost" size="sm" onclick={() => history.back()} class="mb-4 -ml-2">
	<ArrowLeftIcon data-icon="inline-start" /> Back
</Button>

{#if metaQuery.error}
	<div class="py-16 text-center">
		<p class="font-medium">No metadata for this title</p>
		<p class="mt-1 text-sm text-muted-foreground">
			No installed addon provides <code>{type}</code> metadata for <code>{id}</code>.
		</p>
	</div>
{:else if !meta}
	<div class="flex gap-6">
		<div class="aspect-2/3 w-48 shrink-0 animate-pulse rounded-lg bg-muted"></div>
		<div class="flex-1 space-y-3">
			<div class="h-8 w-1/2 animate-pulse rounded bg-muted"></div>
			<div class="h-4 w-1/3 animate-pulse rounded bg-muted"></div>
			<div class="h-24 animate-pulse rounded bg-muted"></div>
		</div>
	</div>
{:else}
	<div class="relative">
		{#if meta.background}
			<div class="absolute inset-x-0 -top-8 -z-10 h-72 overflow-hidden">
				<img src={meta.background} alt="" class="size-full object-cover opacity-25 blur-sm" />
				<div class="absolute inset-0 bg-gradient-to-b from-transparent to-background"></div>
			</div>
		{/if}

		<div class="flex flex-col gap-6 pt-8 sm:flex-row">
			<div class="w-44 shrink-0">
				<div class="aspect-2/3 overflow-hidden rounded-lg bg-muted shadow-lg">
					{#if meta.poster}
						<img src={meta.poster} alt={meta.name} class="size-full object-cover" />
					{/if}
				</div>
			</div>

			<div class="flex flex-1 flex-col gap-3">
				<h1 class="text-3xl font-bold tracking-tight">{meta.name}</h1>

				<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
					{#if meta.releaseInfo}<span>{meta.releaseInfo}</span>{/if}
					{#if meta.runtime}<span>{meta.runtime}</span>{/if}
					{#if rating}
						<span class="flex items-center gap-1">
							<StarIcon class="size-3.5 fill-yellow-400 text-yellow-400" />
							{rating}
						</span>
					{/if}
					{#if meta.genres?.length}<span>{meta.genres.slice(0, 3).join(", ")}</span>{/if}
				</div>

				{#if meta.description}
					<p class="max-w-2xl text-sm leading-relaxed text-foreground/90">{meta.description}</p>
				{/if}

				<div class="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
					{#if meta.director?.length}<span>Director: {meta.director.join(", ")}</span>{/if}
					{#if meta.cast?.length}<span>Cast: {meta.cast.slice(0, 4).join(", ")}</span>{/if}
				</div>

				<div class="mt-2 flex gap-2">
					{#if contentType === "movie"}
						<Button onclick={() => (openStreamId = openStreamId === id ? null : id)}>
							<PlayIcon data-icon="inline-start" /> Streams
						</Button>
					{/if}
					<Button variant="outline" disabled={toggling} onclick={toggle}>
						{#if toggling}
							<Spinner data-icon="inline-start" />
						{:else if inLibrary}
							<CheckIcon data-icon="inline-start" />
						{:else}
							<PlusIcon data-icon="inline-start" />
						{/if}
						{inLibrary ? "In library" : "Add to library"}
					</Button>
				</div>
			</div>
		</div>

		{#if contentType === "movie" && openStreamId === id}
			<div class="mt-8">
				<h2 class="mb-3 text-lg font-semibold">Streams</h2>
				<StreamList type="movie" {id} />
			</div>
		{/if}

		{#if contentType === "series" && seasons.length > 0}
			<div class="mt-8 flex flex-col gap-4">
				<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
					{#each seasons as season (season)}
						<button
							type="button"
							onclick={() => {
								chosenSeason = season;
								openStreamId = null;
							}}
							class={cn(
								"shrink-0 rounded-full border px-3 py-1 text-sm transition",
								season === activeSeason
									? "border-foreground bg-foreground text-background"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
						>
							Season {season}
						</button>
					{/each}
				</div>

				<div class="flex flex-col divide-y divide-border rounded-lg border border-border">
					{#each episodes as episode (episode.id)}
						<div class="flex flex-col">
							<button
								type="button"
								onclick={() => (openStreamId = openStreamId === episode.id ? null : episode.id)}
								class="flex items-center gap-3 p-3 text-left transition hover:bg-muted/50"
							>
								<span class="w-8 shrink-0 text-center text-sm text-muted-foreground">
									{episode.episode}
								</span>
								{#if episode.thumbnail}
									<img
										src={episode.thumbnail}
										alt=""
										class="hidden aspect-video h-12 shrink-0 rounded object-cover sm:block"
									/>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{episode.title}</p>
									{#if episode.released}
										<p class="text-xs text-muted-foreground">
											{new Date(episode.released).toLocaleDateString()}
										</p>
									{/if}
								</div>
								<PlayIcon class="size-4 shrink-0 text-muted-foreground" />
							</button>
							{#if openStreamId === episode.id}
								<div class="p-3 pt-0">
									<StreamList type="series" id={episode.id} />
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
