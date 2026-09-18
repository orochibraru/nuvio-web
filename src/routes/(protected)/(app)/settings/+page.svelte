<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { toast } from "svelte-sonner";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import {
		SETTINGS_SECTIONS,
		settingsSectionFrom,
		settingsSectionQuery,
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

	pageTitle.set("Settings");

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
			toast.error("Couldn't save : reverted.");
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
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
  <div class="flex items-center gap-3">
    <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
    {#if saveState === "saving"}
      <span class="text-xs text-muted-foreground">Saving…</span>
    {:else if saveState === "saved"}
      <span class="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon class="size-3.5" /> Saved
      </span>
    {/if}
  </div>

  <!-- The header owns this navigation from `md` up, where it slides in over
       the main nav row. Below that the header hides its nav entirely, so the
       same links render here as a scrollable pill row. -->
  <nav
    aria-label="Settings sections"
    class="-mx-6 overflow-x-auto px-6 md:hidden scrollbar-none [&::-webkit-scrollbar]:hidden"
  >
    <div class="flex w-max gap-1 rounded-full border border-foreground/10 bg-card p-1">
      {#each SETTINGS_SECTIONS as entry (entry.value)}
        {@const active = section === entry.value}
        <a
          href={settingsRoot + settingsSectionQuery(entry.value)}
          aria-current={active ? "page" : undefined}
          class={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            active
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <entry.icon class="size-3.5" />
          {entry.label}
        </a>
      {/each}
    </div>
  </nav>

  <div class="min-w-0">
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
