<script lang="ts">
	import { cn } from "$lib/utils.js";

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

	<div class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
		{#if logo && !logoBroken}
			<img
				src={logo}
				alt={title}
				onerror={() => (logoBroken = true)}
				class="animate-soft-pulse max-h-24 max-w-xs object-contain drop-shadow-lg lg:max-h-28"
			/>
		{:else}
			<p class="animate-soft-pulse text-2xl font-bold tracking-tight text-white lg:text-3xl">
				{title}
			</p>
		{/if}
		{#if label}
			<p class="text-sm text-white/60">{label}</p>
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
