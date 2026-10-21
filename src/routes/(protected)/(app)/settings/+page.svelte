<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import CircleUserIcon from "@lucide/svelte/icons/circle-user";
	import type { Component } from "svelte";
	import { toast } from "svelte-sonner";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import {
		SETTINGS_SECTIONS,
		settingsSectionFrom,
	} from "#lib/settings/sections.js";
	import { saveUiSettings } from "#lib/settings/settings.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";
	import { refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import SettingsAddons from "./settings-addons.svelte";
	import SettingsAppearance from "./settings-appearance.svelte";
	import SettingsHome from "./settings-home.svelte";
	import SettingsIntegrations from "./settings-integrations.svelte";
	import SettingsPlayback from "./settings-playback.svelte";
	import SettingsSync from "./settings-sync.svelte";

	let { data } = $props();

	pageTitle.set(m.nav_settings());

	// "idle" → "saving" → "saved" (auto-clears); "error" reverts the preview.
	let saveState = $state<"idle" | "saving" | "saved" | "error">("idle");
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	async function update(patch: Partial<UiSettings>) {
		const previous = { ...theme.current };
		const next = { ...previous, ...patch };
		theme.preview(next);
		saveState = "saving";
		clearTimeout(savedTimer);
		try {
			await saveUiSettings(next);
			saveState = "saved";
			await refreshAll();
			savedTimer = setTimeout(() => {
				if (saveState === "saved") {
					saveState = "idle";
				}
			}, 2000);
		} catch {
			theme.preview(previous); // roll the optimistic change back
			saveState = "error";
			toast.error(m.settings_save_failed());
		}
	}

	// Which section is showing lives in the URL so it survives back/forward and
	// is shareable. The section pills live in the app header (see the app
	// layout); from `md` up they are the header's nav row, and the row below is
	// the same navigation for the widths where the header hides its nav.
	const settingsRoot = resolve("settings");
	const section = $derived(
		settingsSectionFrom(page.url.searchParams.get("tab")),
	);
	const current = $derived(
		SETTINGS_SECTIONS.find((entry) => entry.value === section) ??
			SETTINGS_SECTIONS[0],
	);
	// A phone shows the section list until one is picked; the desktop treats a
	// bare URL as the default section, as before.
	const picked = $derived(page.url.searchParams.has("tab"));
</script>

{#snippet group(
  title: string,
  rows: Array<{
    href: string;
    label: string;
    description: string;
    icon: Component;
  }>,
)}
  <section class="flex flex-col gap-2">
    <h2
      class="px-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
    >
      {title}
    </h2>
    <ul class="glass divide-y divide-foreground/8 overflow-hidden rounded-3xl">
      {#each rows as row (row.href)}
        <li>
          <a
            href={row.href}
            class="flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-foreground/5"
          >
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
            >
              <row.icon class="size-5" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{row.label}</span>
              <span class="truncate text-sm text-muted-foreground"
                >{row.description}</span
              >
            </span>
            <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
  <!-- Phones get an app's settings : bare `/settings` is a grouped list of
       sections, and a section opens on its own with a way back. From `md` up
       the header's section row does that job and a bare URL is Appearance. -->
  {#if !picked}
    <div class="flex flex-col gap-6 md:hidden">
      <h1 class="text-4xl font-bold tracking-tight">{m.nav_settings()}</h1>
      {@render group(m.settings_group_account(), [
        {
          href: resolve("account"),
          label: m.nav_account(),
          description: m.settings_account_description(),
          icon: CircleUserIcon,
        },
      ])}
      {@render group(
        m.settings_group_general(),
        SETTINGS_SECTIONS.map((entry) => ({
          href: `${settingsRoot}?tab=${entry.value}`,
          label: entry.label,
          description: entry.description,
          icon: entry.icon,
        })),
      )}
    </div>
  {:else}
    <a
      href={settingsRoot}
      class="-ml-2 flex w-fit items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-primary transition active:scale-95 md:hidden"
    >
      <ChevronLeftIcon class="size-5" />
      {m.nav_settings()}
    </a>
  {/if}

  <div class={cn("flex items-center gap-3", !picked && "hidden md:flex")}>
    <h1 class="text-3xl font-bold tracking-tight">
      <span class="md:hidden">{current.label}</span>
      <span class="hidden md:inline">{m.nav_settings()}</span>
    </h1>
    {#if saveState === "saving"}
      <span class="text-xs text-muted-foreground">{m.settings_saving()}</span>
    {:else if saveState === "saved"}
      <span class="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon class="size-3.5" /> {m.settings_saved()}
      </span>
    {/if}
  </div>

  <div class={cn("min-w-0", !picked && "hidden md:block")}>
    {#if section === "appearance"}
      <SettingsAppearance {update} />
    {:else if section === "home" && data.home}
      <SettingsHome layout={data.home.layout} catalogs={data.home.catalogs} />
    {:else if section === "playback"}
      <SettingsPlayback {update} />
    {:else if section === "sync"}
      <SettingsSync {update} />
    {:else if section === "addons"}
      <SettingsAddons />
    {:else if section === "integrations"}
      <SettingsIntegrations {update} />
    {/if}
  </div>
</div>
