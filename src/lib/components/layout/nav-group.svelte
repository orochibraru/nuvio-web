<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { Component } from "svelte";

	/** A row links somewhere (`href`) or runs an action (`onclick`). */
	export interface NavRow {
		label: string;
		description?: string;
		icon: Component;
		href?: string;
		onclick?: () => void;
	}

	let { title, rows }: { title?: string; rows: NavRow[] } = $props();
</script>

{#snippet content(row: NavRow)}
  <span
    class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
  >
    <row.icon class="size-5" />
  </span>
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="font-semibold">{row.label}</span>
    {#if row.description}
      <span class="truncate text-sm text-muted-foreground">{row.description}</span>
    {/if}
  </span>
  {#if row.href}
    <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" />
  {/if}
{/snippet}

<section class="flex flex-col gap-2">
  {#if title}
    <h2
      class="px-1 text-xs font-semibold tracking-[0.12em] text-accent-label uppercase"
    >
      {title}
    </h2>
  {/if}
  <ul class="glass divide-y divide-foreground/8 overflow-hidden rounded-3xl">
    {#each rows as row (row.href ?? row.label)}
      <li>
        {#if row.href}
          <a
            href={row.href}
            class="flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-foreground/5"
          >
            {@render content(row)}
          </a>
        {:else}
          <button
            type="button"
            onclick={row.onclick}
            class="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors active:bg-foreground/5"
          >
            {@render content(row)}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
</section>
