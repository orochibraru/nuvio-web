<script lang="ts">
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import StarIcon from "@lucide/svelte/icons/star";
	import XIcon from "@lucide/svelte/icons/x";
	import { fade, fly } from "svelte/transition";
	import type { PlayerInfo } from "./player-info.ts";

	let {
		title,
		subheading = null,
		logo = null,
		background = null,
		poster = null,
		certification = null,
		genres = [],
		info,
		detailHref,
		autoOpened = false,
		onResume,
		onClose,
	}: {
		title: string;
		subheading?: string | null;
		logo?: string | null;
		background?: string | null;
		poster?: string | null;
		certification?: string | null;
		genres?: string[];
		info: PlayerInfo;
		detailHref: string;
		/** Surfaced by a pause rather than the Info button — offer a Resume CTA. */
		autoOpened?: boolean;
		onResume?: () => void;
		onClose: () => void;
	} = $props();

	let logoBroken = $state(false);

	const headline = $derived(info.episodeTitle ?? title);
	const synopsis = $derived(
		info.episodeOverview ?? info.description ?? "No synopsis available.",
	);
	const metaBits = $derived(
		[info.releaseInfo, info.runtime, certification, info.status].filter(
			(bit): bit is string => Boolean(bit),
		),
	);
	const facts = $derived(
		[
			["Cast", info.cast.join(", ")],
			["Director", info.director.join(", ")],
			["Writer", info.writer.join(", ")],
			["Country", info.country ?? ""],
			["Awards", info.awards ?? ""],
		].filter(([, value]) => value.length > 0) as Array<[string, string]>,
	);

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.stopPropagation();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="absolute inset-0 z-30 overflow-hidden"
	transition:fade={{ duration: 150 }}
>
	<!-- Colour bed: the backdrop, blown up and blurred behind the frosted layer. -->
	{#if background || poster}
		<img
			src={background ?? poster}
			alt=""
			class="absolute inset-0 size-full scale-110 object-cover object-center opacity-40 blur-2xl saturate-150"
		/>
	{/if}
	<div class="absolute inset-0 bg-black/70 backdrop-blur-2xl"></div>
	<div
		class="pointer-events-none absolute -top-1/3 left-1/2 size-160 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
		style="background: radial-gradient(closest-side, oklch(0.55 0.24 275 / 0.5), transparent)"
	></div>

	<button
		type="button"
		aria-label="Close"
		onclick={onClose}
		class="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/20"
	>
		<XIcon class="size-5" />
	</button>

	<div
		class="relative flex h-full items-center justify-center overflow-y-auto p-6 sm:p-10"
		transition:fly={{ y: 16, duration: 220 }}
	>
		<div class="flex w-full max-w-4xl flex-col gap-7 md:flex-row md:items-start md:gap-10">
			{#if poster}
				<img
					src={poster}
					alt={title}
					class="hidden w-48 shrink-0 rounded-2xl object-cover shadow-[0_40px_80px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 md:block lg:w-56"
				/>
			{/if}

			<div class="flex min-w-0 flex-1 flex-col gap-4 text-white">
				<div class="flex flex-col gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
						<InfoIcon class="size-3.5" />
						{info.episodeTitle ? subheading || "Episode" : "About"}
					</span>
					{#if logo && !logoBroken}
						<img
							src={logo}
							alt={title}
							onerror={() => (logoBroken = true)}
							class="max-h-20 max-w-64 self-start object-contain object-left drop-shadow-lg"
						/>
						{#if info.episodeTitle}
							<h2 class="text-xl font-semibold">{info.episodeTitle}</h2>
						{/if}
					{:else}
						<h2 class="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
							{headline}
						</h2>
					{/if}
				</div>

				{#if info.imdbRating || metaBits.length > 0 || genres.length > 0}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-medium text-white/70">
						{#if info.imdbRating}
							<span class="flex items-center gap-1 text-white">
								<StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
								{info.imdbRating}
								<span class="text-[10px] font-semibold tracking-wide text-white/45">
									IMDb
								</span>
							</span>
						{/if}
						{#each metaBits as bit (bit)}
							<span>{bit}</span>
						{/each}
						{#if genres.length > 0}
							<span class="flex flex-wrap gap-1.5">
								{#each genres.slice(0, 4) as genre (genre)}
									<span class="rounded-full bg-white/10 px-2 py-0.5 text-xs">
										{genre}
									</span>
								{/each}
							</span>
						{/if}
					</div>
				{/if}

				<p class="max-w-2xl text-sm leading-relaxed text-white/85">
					{synopsis}
				</p>

				{#if info.episodeOverview && info.description}
					<p class="line-clamp-3 max-w-2xl text-xs leading-relaxed text-white/55">
						{info.description}
					</p>
				{/if}

				{#if facts.length > 0}
					<dl class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
						{#each facts as [label, value] (label)}
							<div class="flex flex-col">
								<dt class="text-xs font-semibold tracking-wide text-white/40 uppercase">
									{label}
								</dt>
								<dd class="text-white/80">{value}</dd>
							</div>
						{/each}
					</dl>
				{/if}

				<div class="mt-2 flex flex-wrap items-center gap-3">
					{#if autoOpened && onResume}
						<button
							type="button"
							onclick={onResume}
							class="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
						>
							<PlayIcon class="size-4 fill-current" /> Resume
						</button>
					{:else}
						<button
							type="button"
							onclick={onClose}
							class="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
						>
							<PlayIcon class="size-4 fill-current" /> Keep watching
						</button>
					{/if}
					<a
						href={detailHref}
						class="rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/20"
					>
						Full details page
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
