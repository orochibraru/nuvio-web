<script lang="ts">
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import { httpUrlOrNull } from "#lib/core/url.js";
	import { cn } from "#lib/utils.js";

	let {
		src,
		class: className,
	}: { src: string | null | undefined; class?: string } = $props();

	const safeSrc = $derived(httpUrlOrNull(src));
	let failedSrc = $state<string | null>(null);
</script>

<span
	class={cn(
		"relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted",
		className,
	)}
>
	<PuzzleIcon class="size-1/2 text-muted-foreground" />
	{#if safeSrc && failedSrc !== safeSrc}
		<img
			src={safeSrc}
			alt=""
			loading="lazy"
			class="absolute inset-0 size-full bg-muted object-cover"
			onerror={() => (failedSrc = safeSrc)}
		/>
	{/if}
</span>
