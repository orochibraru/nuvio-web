<script lang="ts">
	import type { LucideIcon } from "@lucide/svelte";
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils.js";

	let {
		icon,
		title,
		description,
		actions,
		class: className,
	}: {
		icon?: LucideIcon;
		title: string;
		description?: string;
		actions?: Snippet;
		class?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<div
	class={cn(
		"flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-16 text-center",
		className,
	)}
>
	{#if Icon}
		<span
			class="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border"
		>
			<Icon class="size-7" />
		</span>
	{/if}
	<div class="flex flex-col gap-1.5">
		<p class="text-lg font-semibold tracking-tight">{title}</p>
		{#if description}
			<p class="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="mt-1 flex flex-wrap items-center justify-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
