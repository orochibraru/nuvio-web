<script lang="ts">
	let {
		backdrop = null,
		logo = null,
		title,
		label = null,
	}: {
		backdrop?: string | null;
		logo?: string | null;
		title: string;
		label?: string | null;
	} = $props();

	let logoBroken = $state(false);
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
</div>
