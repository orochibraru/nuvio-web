<script lang="ts">
	import type { Component } from "svelte";
	import { cn } from "#lib/utils.js";

	let {
		icon: Icon,
		class: className = "",
	}: { icon: Component; class?: string } = $props();
</script>

<span
	aria-hidden="true"
	class={cn(
		"flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary",
		className,
	)}
>
	<Icon class="size-4" />
</span>
