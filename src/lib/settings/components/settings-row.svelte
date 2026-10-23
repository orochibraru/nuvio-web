<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		label,
		labelId,
		hint,
		inline = false,
		children,
	}: {
		label?: string | Snippet;
		/** For a control named by `aria-labelledby`. */
		labelId?: string;
		hint?: string;
		/** Control beside the text (a switch), not under it. */
		inline?: boolean;
		children: Snippet;
	} = $props();
</script>

{#snippet text()}
  <span class="flex min-w-0 flex-col gap-0.5">
    {#if typeof label === "string"}
      <span id={labelId} class="text-sm font-medium">{label}</span>
    {:else if label}
      <span id={labelId} class="text-sm font-medium">{@render label()}</span>
    {/if}
    {#if hint}
      <span class="text-xs text-muted-foreground">{hint}</span>
    {/if}
  </span>
{/snippet}

{#if inline}
  <label class="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
    {@render text()}
    {@render children()}
  </label>
{:else}
  <div class="flex flex-col gap-3 px-4 py-4 sm:px-5">
    {#if label || hint}
      {@render text()}
    {/if}
    {@render children()}
  </div>
{/if}
