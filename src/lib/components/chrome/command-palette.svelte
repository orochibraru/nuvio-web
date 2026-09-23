<script lang="ts">
	import BlocksIcon from "@lucide/svelte/icons/blocks";
	import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
	import CircleUserIcon from "@lucide/svelte/icons/circle-user";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import CompassIcon from "@lucide/svelte/icons/compass";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LibraryBigIcon from "@lucide/svelte/icons/library-big";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SunMoonIcon from "@lucide/svelte/icons/sun-moon";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { Command, Dialog } from "bits-ui";
	import { toggleMode } from "mode-watcher";
	import type { Component } from "svelte";
	import { m } from "#lib/i18n/index.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { commandPalette } from "./command-palette.svelte.ts";

	interface Destination {
		label: string;
		href: string;
		icon: Component;
		keywords?: string[];
	}

	const destinations: Destination[] = [
		{
			label: m.nav_home(),
			href: resolve("/(protected)/(app)"),
			icon: HouseIcon,
			keywords: ["dashboard", "start"],
		},
		{
			label: m.nav_discover(),
			href: resolve("discover"),
			icon: CompassIcon,
			keywords: ["browse", "catalog"],
		},
		{
			label: m.nav_library(),
			href: resolve("library"),
			icon: LibraryBigIcon,
			keywords: ["saved", "my list"],
		},
		{
			label: m.nav_collections(),
			href: resolve("collections"),
			icon: FolderIcon,
			keywords: ["folders"],
		},
		{
			label: m.nav_watch_history(),
			href: resolve("account?tab=history"),
			icon: ClockIcon,
			keywords: ["recent", "watched"],
		},
		{
			label: m.palette_your_stats(),
			href: resolve("account?tab=stats"),
			icon: ChartColumnIcon,
			keywords: ["minutes", "insights"],
		},
		{
			label: m.nav_settings(),
			href: resolve("settings"),
			icon: SettingsIcon,
			keywords: ["appearance", "theme", "playback"],
		},
		{
			label: m.settings_section_addons(),
			href: `${resolve("settings")}?tab=addons`,
			icon: BlocksIcon,
			keywords: ["sources", "providers"],
		},
		{
			label: m.nav_account(),
			href: resolve("account"),
			icon: CircleUserIcon,
			keywords: ["profile", "password"],
		},
		{
			label: m.shell_switch_profile(),
			href: resolve("profiles"),
			icon: UsersIcon,
			keywords: ["accounts"],
		},
	];

	let query = $state("");

	const trimmed = $derived(query.trim());

	function onWindowKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			commandPalette.toggle();
		}
	}

	function go(href: string) {
		commandPalette.open = false;
		void goto(href);
	}

	function runSearch() {
		if (!trimmed) {
			go(resolve("search"));
			return;
		}
		commandPalette.open = false;
		void goto(resolve(`search?q=${encodeURIComponent(trimmed)}`));
	}

	function runAction(fn: () => void) {
		commandPalette.open = false;
		fn();
	}

	$effect(() => {
		if (!commandPalette.open) {
			query = "";
		}
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open={commandPalette.open}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
    />
    <Dialog.Content
      class="fixed top-[10%] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
    >
      <Dialog.Title class="sr-only">{m.palette_title()}</Dialog.Title>
      <Dialog.Description class="sr-only">
        {m.palette_description()}
      </Dialog.Description>

      <Command.Root class="flex flex-col" loop>
        <div class="flex items-center gap-2.5 border-b border-border px-4">
          <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
          <Command.Input
            bind:value={query}
            placeholder={m.palette_placeholder()}
            aria-controls="command-palette-results"
            class="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <Command.List
          id="command-palette-results"
          tabindex={0}
          class="max-h-80 overflow-y-auto p-2 outline-none"
        >
          <Command.Group>
            <Command.GroupHeading
              class="px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {m.palette_go_to()}
            </Command.GroupHeading>
            <Command.GroupItems>
              {#each destinations as dest (dest.href)}
                <Command.Item
                  value={dest.label}
                  keywords={dest.keywords}
                  onSelect={() => go(dest.href)}
                  class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-primary/20 data-selected:text-foreground"
                >
                  <dest.icon class="size-4 text-muted-foreground" />
                  {dest.label}
                </Command.Item>
              {/each}
            </Command.GroupItems>
          </Command.Group>

          <Command.Group>
            <Command.GroupHeading
              class="px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {m.palette_actions()}
            </Command.GroupHeading>
            <Command.GroupItems>
              <Command.Item
                value={m.palette_search_all()}
                keywords={["find", "query"]}
                onSelect={() => go(resolve("search"))}
                class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-primary/20 data-selected:text-foreground"
              >
                <SearchIcon class="size-4 text-muted-foreground" />
                {m.palette_search_all()}
              </Command.Item>
              <Command.Item
                value={m.palette_toggle_theme()}
                keywords={["theme", "appearance", "mode"]}
                onSelect={() => runAction(toggleMode)}
                class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-primary/20 data-selected:text-foreground"
              >
                <SunMoonIcon class="size-4 text-muted-foreground" />
                {m.palette_toggle_theme()}
              </Command.Item>
            </Command.GroupItems>
          </Command.Group>

          {#if trimmed}
            <Command.Group forceMount>
              <Command.GroupItems>
                <Command.Item
                  value={`search ${trimmed}`}
                  forceMount
                  onSelect={runSearch}
                  class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-primary/20 data-selected:text-foreground"
                >
                  <SearchIcon class="size-4 text-muted-foreground" />
                  {m.palette_search_for({ query: trimmed })}
                </Command.Item>
              </Command.GroupItems>
            </Command.Group>
          {/if}
        </Command.List>
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
