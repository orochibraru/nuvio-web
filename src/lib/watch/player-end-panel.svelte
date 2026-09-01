<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import { Button } from "#lib/components/ui/button/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { resolve } from "$app/paths";

	interface Suggestion {
		id: string;
		type: string;
		name: string;
		poster?: string | null;
	}

	let {
		heading,
		detailHref,
		suggestions = [],
		onBack,
		onWatchAgain,
		onResume,
	}: {
		heading: string;
		detailHref: string;
		suggestions?: Suggestion[];
		onBack: () => void;
		onWatchAgain: () => void;
		/** Present while the video is still running (outro handoff) — keep watching. */
		onResume?: () => void;
	} = $props();
</script>

<!-- Takes over the frame once a movie / final episode ends; the player shrinks
     to the top-left corner (`minimized` in video-player.svelte). Only the header
     + buttons clear it — the poster grid runs the full width.
     `data-accent` mirrors the chosen accent onto this forced-`.dark` scope —
     `.dark` re-declares `--primary` too, which otherwise shadows the accent
     colour and leaves the CTAs a neutral grey/white instead. -->
<div
	class="dark absolute inset-0 z-20 flex flex-col gap-6 overflow-y-auto bg-linear-to-b from-black via-black/95 to-black p-6 pt-40 text-white sm:p-10 sm:pt-10"
	data-accent={theme.current.accent}
>
	<div class="flex flex-col gap-1 sm:pl-72">
		<p class="text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
			You finished
		</p>
		<h2 class="text-2xl font-bold sm:text-3xl">{heading}</h2>
		<p class="mt-1 text-sm text-white/70">
			It's over — but these titles could interest you.
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-2 sm:pl-72">
		{#if onResume}
			<Button size="lg" onclick={onResume}>
				<PlayIcon data-icon="inline-start" class="fill-current" /> Back to video
			</Button>
		{/if}
		<Button size="lg" variant={onResume ? "secondary" : "default"} onclick={onWatchAgain}>
			<RotateCcwIcon data-icon="inline-start" /> Watch again
		</Button>
		<Button size="lg" variant="secondary" onclick={onBack}>
			<ArrowLeftIcon data-icon="inline-start" /> Go back
		</Button>
		<Button size="lg" variant="ghost" href={detailHref}>
			<InfoIcon data-icon="inline-start" /> Details
		</Button>
	</div>

	{#if suggestions.length > 0}
		<div class="flex flex-col gap-3">
			<p class="text-sm font-semibold text-white/70">More like this</p>
			<div
				class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
			>
				{#each suggestions as meta (meta.id)}
					<a
						href={resolve(`detail/${meta.type}/${encodeURIComponent(meta.id)}`)}
						class="group/sug"
					>
						<div
							class="aspect-2/3 overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10 transition group-hover/sug:ring-primary/60"
						>
							{#if meta.poster}
								<img
									src={meta.poster}
									alt={meta.name}
									loading="lazy"
									class="size-full object-cover"
								/>
							{/if}
						</div>
						<p class="mt-1.5 line-clamp-2 text-xs text-white/80">{meta.name}</p>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>
