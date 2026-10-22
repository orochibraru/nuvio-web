<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import SearchIcon from "@lucide/svelte/icons/search";
	import type { Component } from "svelte";
	import { slide } from "svelte/transition";
	import { reduced } from "#lib/core/motion.js";
	import { m } from "#lib/i18n/index.js";
	import { cn } from "#lib/utils.js";

	interface Option {
		value: string;
		label: string;
		icon?: Component;
	}

	let {
		title,
		options,
		value,
		onSelect,
	}: {
		title: string;
		options: ReadonlyArray<Option>;
		value: string;
		onSelect: (value: string) => void;
	} = $props();

	// A combobox inside the sheet: one row with the current choice, opening in
	// place (no popup: a portal outside the drawer fights its focus trap), with
	// a search box once the list is long.
	let open = $state(false);
	let query = $state("");
	const id = $props.id();

	const current = $derived(
		options.find((option) => option.value === value) ?? options[0],
	);
	const searchable = $derived(options.length > 8);
	const shown = $derived(
		query.trim()
			? options.filter((option) =>
					option.label.toLowerCase().includes(query.trim().toLowerCase()),
				)
			: options,
	);

	function choose(option: Option) {
		onSelect(option.value);
		open = false;
		query = "";
	}
</script>

{#snippet chip(icon: Component | undefined, selected: boolean)}
  {#if icon}
    {@const Icon = icon}
    <span
      class={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
        selected ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
      )}
    >
      <Icon class="size-4" />
    </span>
  {/if}
{/snippet}

<div class="glass overflow-hidden rounded-3xl">
  <button
    type="button"
    aria-expanded={open}
    aria-controls={`${id}-list`}
    onclick={() => (open = !open)}
    class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-foreground/5"
  >
    {@render chip(current?.icon, false)}
    <span class="flex min-w-0 flex-1 flex-col">
      <span
        class="text-[11px] font-semibold tracking-[0.12em] text-accent-label uppercase"
      >
        {title}
      </span>
      <span class="truncate text-sm font-medium">{current?.label}</span>
    </span>
    <ChevronDownIcon
      class={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
        open && "rotate-180",
      )}
    />
  </button>

  {#if open}
    <div
      id={`${id}-list`}
      transition:slide={reduced({ duration: 180 })}
      class="border-t border-foreground/8"
    >
      {#if searchable}
        <label class="flex items-center gap-2 border-b border-foreground/8 px-4 py-2.5">
          <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
          <input
            bind:value={query}
            type="search"
            placeholder={m.filter_search_placeholder({ title })}
            class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
          />
        </label>
      {/if}
      <div role="listbox" aria-label={title} class="flex max-h-72 flex-col overflow-y-auto">
        {#each shown as option (option.value)}
          {@const selected = value === option.value}
          <button
            type="button"
            role="option"
            aria-selected={selected}
            onclick={() => choose(option)}
            class={cn(
              "flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
              selected
                ? "bg-primary/12 font-semibold text-accent-label"
                : "font-medium active:bg-foreground/5",
            )}
          >
            {@render chip(option.icon, selected)}
            <span class="min-w-0 flex-1 truncate">{option.label}</span>
            {#if selected}
              <CheckIcon class="size-4 shrink-0 text-primary" />
            {/if}
          </button>
        {:else}
          <p class="px-4 py-3 text-sm text-muted-foreground">
            {m.filter_no_match()}
          </p>
        {/each}
      </div>
    </div>
  {/if}
</div>
