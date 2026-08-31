<script lang="ts">
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { formatRemaining } from "$lib/watch/runtime.js";

	let {
		item,
		onClear,
	}: {
		item: {
			id: string;
			type: string;
			name: string;
			background: string | null;
			videoId: string;
			season: number | null;
			episode: number | null;
			progress: number;
			remainingMs: number;
		};
		onClear?: (id: string) => void;
	} = $props();

	const detailHref = $derived(
		resolve(`/detail/${item.type}/${encodeURIComponent(item.id)}`),
	);
	const playHref = $derived(
		resolve(`/player/${item.type}/${encodeURIComponent(item.videoId)}`),
	);
	const started = $derived(item.progress >= 0.01);

	let bgLoaded = $state(false);
	$effect(() => {
		void item.background;
		bgLoaded = false;
	});

	function clearProgress() {
		sync.clearProgress({
			contentId: item.id,
			season: item.season,
			episode: item.episode,
		});
		onClear?.(item.id);
		toast.success(`Removed ${item.name} from Continue watching`);
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="contents">
		<div
			class="group/cw relative aspect-video w-72 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-16px] hover:shadow-black/70 hover:ring-primary/60"
		>
			<div class="absolute inset-0 bg-linear-to-br from-muted via-muted to-background"></div>
			{#if item.background && !bgLoaded}
				<div class="skeleton absolute inset-0"></div>
			{/if}
			{#if item.background}
				<img
					src={item.background}
					alt=""
					loading="lazy"
					decoding="async"
					onload={() => (bgLoaded = true)}
					class={`relative size-full object-cover transition-[transform,opacity] duration-500 group-hover/cw:scale-105 ${bgLoaded ? "opacity-100" : "opacity-0"}`}
				/>
			{/if}
			<div class="absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent"></div>

			<!-- Whole card opens details; the play button (a sibling, higher layer)
			     goes straight to the player. -->
			<a
				href={detailHref}
				aria-label={item.name}
				data-sveltekit-preload-data="hover"
				class="absolute inset-0"
			></a>

			<a
				href={playHref}
				aria-label={`${started ? "Resume" : "Play"} ${item.name}`}
				class="pointer-events-none absolute top-1/2 left-1/2 z-10 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 ring-1 ring-white/25 backdrop-blur-md transition hover:scale-105 hover:bg-white/25 group-hover/cw:pointer-events-auto group-hover/cw:opacity-100"
			>
				<PlayIcon class="size-5 translate-x-px fill-white" />
			</a>

			<div class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold text-white">{item.name}</p>
					<p class="text-xs text-white/70">
						{#if item.season != null && item.episode != null}
							S{item.season} · E{item.episode} ·
						{/if}
						{started ? formatRemaining(item.remainingMs) : "Not started"}
					</p>
				</div>
				<div class="h-1 overflow-hidden rounded-full bg-white/25">
					<div
						class="h-full rounded-full bg-primary"
						style={`width: ${item.progress * 100}%`}
					></div>
				</div>
			</div>
		</div>
	</ContextMenu.Trigger>

	<ContextMenu.Content class="w-52">
		<ContextMenu.Item onSelect={() => goto(playHref)}>
			<PlayIcon />
			{started ? "Resume" : "Play"}
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => goto(detailHref)}>
			<InfoIcon /> View details
		</ContextMenu.Item>
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={clearProgress}>
			<Trash2Icon /> Remove from row
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
