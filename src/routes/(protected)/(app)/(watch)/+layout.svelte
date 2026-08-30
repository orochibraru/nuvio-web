<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { sourcesPanel } from "$lib/watch/sources-panel.svelte.js";
	import StreamPanel from "$lib/watch/stream-panel.svelte";

	let { children } = $props();

	// The shared source drawer for /detail and /player. Kept in module state (not
	// the URL) so opening it never pushes a history entry. `resolveStreams` is
	// client-cached by args, so reopening it on the player is instant.
	const target = $derived(sourcesPanel.target);

	// Any navigation dismisses it — including the pick → /player jump. Closing on
	// `beforeNavigate` keeps it from flashing over the destination page.
	beforeNavigate(() => sourcesPanel.close());
</script>

{@render children()}

{#if target}
	{@const active = target}
	<StreamPanel
		type={active.type}
		videoId={active.videoId}
		onClose={() => sourcesPanel.close()}
	/>
{/if}
