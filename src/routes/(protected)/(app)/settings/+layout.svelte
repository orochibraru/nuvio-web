<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { toast } from "svelte-sonner";
	import { m } from "#lib/i18n/index.js";
	import { setSettingsUpdate } from "#lib/settings/save-context.js";
	import { SETTINGS_SECTIONS } from "#lib/settings/sections.js";
	import { saveUiSettings } from "#lib/settings/settings.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import { refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	let { children } = $props();

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

	setSettingsUpdate(update);

	// Each section is its own page; bare `/settings` is the list of them. From
	// `md` up the header's section row switches sections, so the way back to
	// the list is a phone thing.
	const current = $derived(
		SETTINGS_SECTIONS.find((entry) =>
			page.url.pathname.endsWith(`/settings/${entry.value}`),
		),
	);
	const intro: Record<string, () => string> = {
		appearance: m.settings_appearance_description,
		home: m.settings_home_description,
		playback: m.settings_playback_description,
		sync: m.settings_sync_description,
		addons: m.settings_addons_description,
		integrations: m.settings_integrations_description,
	};
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
  {#if current}
    <a
      href={resolve("settings")}
      class="-ml-2 flex w-fit items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-primary transition active:scale-95 md:hidden"
    >
      <ChevronLeftIcon class="size-5" />
      {m.nav_settings()}
    </a>

    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-bold tracking-tight">{current.label}</h1>
        {#if saveState === "saving"}
          <span class="text-xs text-muted-foreground">{m.settings_saving()}</span>
        {:else if saveState === "saved"}
          <span class="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckIcon class="size-3.5" /> {m.settings_saved()}
          </span>
        {/if}
      </div>
      <p class="text-sm text-muted-foreground">{intro[current.value]?.()}</p>
    </div>
  {/if}

  <div class="min-w-0">
    {@render children()}
  </div>
</div>
