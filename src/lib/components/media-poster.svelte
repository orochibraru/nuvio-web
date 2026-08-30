<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import FilmIcon from "@lucide/svelte/icons/film";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import StarIcon from "@lucide/svelte/icons/star";
	import TvIcon from "@lucide/svelte/icons/tv";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";
	import type { MetaPreview } from "$lib/addons/index.js";
	import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";
	import { parseRuntimeMs } from "$lib/watch/runtime.js";

	let {
		item,
		progress,
		class: className,
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
	} = $props();

	let broken = $state(false);

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
			Boolean(sync.titleProgress(item.id)[item.id]?.completed),
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
				? `Removed ${item.name} from library`
				: `Added ${item.name} to library`,
		);
	}

	function toggleWatched() {
		if (watched) {
			sync.clearProgress({ contentId: item.id, season: null, episode: null });
			toast.success(`Marked ${item.name} unwatched`);
		} else {
			sync.markWatched({
				contentId: item.id,
				contentType: "movie",
				videoId: item.id,
				season: null,
				episode: null,
				durationMs: parseRuntimeMs(null),
			});
			toast.success(`Marked ${item.name} watched`);
		}
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="contents">
		<a
			href={`/detail/${item.type}/${encodeURIComponent(item.id)}`}
			class={cn("group/poster flex flex-col gap-2.5", className)}
			data-sveltekit-preload-data="hover"
		>
	<div
		class={cn(
			"relative overflow-hidden rounded-xl bg-muted ring-1 ring-white/5 transition-all duration-300 ease-out",
			"group-hover/poster:-translate-y-1 group-hover/poster:shadow-[0_24px_50px_-16px] group-hover/poster:shadow-black/70 group-hover/poster:ring-primary/60",
			aspect,
		)}
	>
		{#if item.poster && !broken}
			<img
				src={item.poster}
				alt={item.name}
				loading="lazy"
				onerror={() => (broken = true)}
				class="size-full object-cover transition-transform duration-500 ease-out group-hover/poster:scale-[1.06]"
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
				<span class="line-clamp-3 text-sm font-medium text-muted-foreground">
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
			<div
				title="IMDb rating"
				class="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-md"
			>
				<StarIcon class="size-3 fill-amber-400 text-amber-400" />
				{rating}
			</div>
		{/if}

		{#if watched || inLibrary}
			<div class="absolute top-2 right-2 flex gap-1">
				{#if watched}
					<span
						title="Watched"
						class="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-1 ring-black/10"
					>
						<CheckIcon class="size-3" />
					</span>
				{/if}
				{#if inLibrary}
					<span
						title="In your library"
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
			<p class="truncate text-xs text-muted-foreground">{item.releaseInfo}</p>
		{/if}
	</div>
		</a>
	</ContextMenu.Trigger>

	<ContextMenu.Content class="w-52">
		<ContextMenu.Item onSelect={toggleLibrary}>
			{#if inLibrary}
				<CheckIcon /> In library
			{:else}
				<PlusIcon /> Add to library
			{/if}
		</ContextMenu.Item>
		{#if contentType === "movie"}
			<ContextMenu.Item onSelect={toggleWatched}>
				{#if watched}
					<EyeOffIcon /> Mark as unwatched
				{:else}
					<EyeIcon /> Mark as watched
				{/if}
			</ContextMenu.Item>
		{/if}
		<ContextMenu.Separator />
		<ContextMenu.Item
			onSelect={() =>
				goto(`/detail/${item.type}/${encodeURIComponent(item.id)}`)}
		>
			<InfoIcon /> View details
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
