<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import PlayIcon from "@lucide/svelte/icons/play";
	import StarIcon from "@lucide/svelte/icons/star";
	import type { MetaVideo } from "$lib/addons/index.js";
	import { cn } from "$lib/utils.js";

	let {
		videos,
		seriesRuntime = null,
		progress = {},
		initialSeason = null,
		onPlay,
		onToggleWatched,
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

	let open = $state(new Set<number>());
	$effect(() => {
		// Open the season with the resume episode (or the first) once, on load.
		if (open.size > 0 || grouped.length === 0) {
			return;
		}
		open = new Set([initialSeason ?? grouped[0].season]);
	});

	function toggle(season: number) {
		const next = new Set(open);
		if (next.has(season)) {
			next.delete(season);
		} else {
			next.add(season);
		}
		open = next;
	}

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

<div class="flex flex-col gap-3">
	{#each grouped as group (group.season)}
		{@const isOpen = open.has(group.season)}
		<section class="overflow-hidden rounded-xl border border-border/60 bg-card/30">
			<button
				type="button"
				onclick={() => toggle(group.season)}
				class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-card"
			>
				<span class="flex items-baseline gap-2">
					<span class="text-sm font-semibold">Season {group.season}</span>
					<span class="text-xs text-muted-foreground">
						{group.episodes.length} episode{group.episodes.length === 1 ? "" : "s"}
					</span>
				</span>
				<ChevronDownIcon
					class={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</button>

			{#if isOpen}
				<div class="grid gap-3 border-t border-border/60 p-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each group.episodes as episode (episode.id)}
						{@const ep = progress[episode.id]}
						{@const date = airDate(episode.released)}
						<div class="group/ep relative flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card/50">
							<button
								type="button"
								onclick={() => onPlay(episode.id)}
								class="flex flex-col text-left"
							>
								<div class="relative aspect-video w-full overflow-hidden bg-muted">
									{#if episode.thumbnail}
										<img
											src={episode.thumbnail}
											alt=""
											loading="lazy"
											class="size-full object-cover transition-transform duration-500 group-hover/ep:scale-105"
										/>
									{/if}
									<div class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent"></div>
									<span
										class="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-md"
									>
										E{episode.episode}
									</span>
									<span
										class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/ep:opacity-100"
									>
										<span class="flex size-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md">
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
										{episode.title}
									</p>
									<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
										{#if episode.rating}
											<span
												class="flex items-center gap-0.5 text-foreground/80"
												title="IMDb rating"
											>
												<StarIcon class="size-3 fill-amber-400 text-amber-400" />
												{episode.rating}
												<span class="ml-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
													IMDb
												</span>
											</span>
										{/if}
										{#if date}<span>{date}</span>{/if}
										{#if seriesRuntime}<span>{seriesRuntime}</span>{/if}
									</div>
									{#if episode.overview}
										<p class="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
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
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
