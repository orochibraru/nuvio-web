<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

	let {
		ytId = null,
		title = "Trailer",
		onClose,
	}: {
		ytId?: string | null;
		title?: string;
		onClose: () => void;
	} = $props();

	const safeId = $derived(ytId && /^[\w-]{11}$/.test(ytId) ? ytId : null);

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if safeId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
	>
		<button
			type="button"
			aria-label="Close trailer"
			onclick={onClose}
			class="absolute inset-0"
		></button>
		<div class="relative aspect-video w-full max-w-4xl overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10">
			<iframe
				src={`https://www.youtube-nocookie.com/embed/${safeId}?autoplay=1&rel=0`}
				title={`${title} trailer`}
				allow="autoplay; encrypted-media; picture-in-picture"
				allowfullscreen
				class="size-full"
			></iframe>
		</div>
		<button
			type="button"
			aria-label="Close"
			onclick={onClose}
			class="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20"
		>
			<XIcon class="size-4" />
		</button>
	</div>
{/if}
