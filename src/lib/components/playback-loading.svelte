<script lang="ts">
	import LoadingMark from "#lib/components/loading-mark.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { cn } from "#lib/utils.js";

	let {
		backdrop = null,
		logo = null,
		title,
		label = null,
		certification = null,
		genres = [],
	}: {
		backdrop?: string | null;
		logo?: string | null;
		title: string;
		label?: string | null;
		certification?: string | null;
		genres?: string[];
	} = $props();

	let logoBroken = $state(false);

	// Content-advisory card fades out a few seconds into the load.
	const hasAdvisory = $derived(certification !== null || genres.length > 0);
	let advisoryExpired = $state(false);
	$effect(() => {
		const timer = setTimeout(() => (advisoryExpired = true), 3200);
		return () => clearTimeout(timer);
	});
	const showAdvisory = $derived(hasAdvisory && !advisoryExpired);
</script>

<div class="absolute inset-0 overflow-hidden bg-black">
	{#if backdrop}
		<img
			src={backdrop}
			alt=""
			class="size-full scale-105 object-cover opacity-40 blur-[2px]"
		/>
	{/if}
	<div class="absolute inset-0 bg-linear-to-t from-black via-black/40 to-black/60"></div>

	<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
		{#if logo && !logoBroken}
			<img
				src={logo}
				alt={title}
				onerror={() => (logoBroken = true)}
				class="animate-soft-pulse max-h-24 max-w-xs object-contain drop-shadow-lg lg:max-h-28"
			/>
		{/if}
		<!-- Its own animation, not tied to whatever title/logo art did or didn't
		     load — sits under the logo when there is one, or carries the loading
		     screen on its own when there isn't. -->
		<LoadingMark />
		{#if label}
			<p class="flex items-center gap-1.5 text-xs text-white/50">
				<Spinner class="size-3" />
				{label}
			</p>
		{/if}
	</div>

	{#if certification || genres.length > 0}
		<div
			class={cn(
				"absolute inset-x-0 bottom-10 flex flex-col items-center gap-2 transition-opacity duration-700",
				showAdvisory ? "opacity-100" : "opacity-0",
			)}
		>
			{#if certification}
				<div class="rounded-md border-2 border-white/70 px-3 py-1 text-lg font-bold tracking-wider text-white">
					{certification}
				</div>
			{/if}
			{#if genres.length > 0}
				<p class="text-xs tracking-wide text-white/60 uppercase">
					{genres.slice(0, 4).join("  ·  ")}
				</p>
			{/if}
		</div>
	{/if}
</div>
