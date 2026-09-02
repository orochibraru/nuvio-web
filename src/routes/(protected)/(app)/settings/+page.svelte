<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { toast } from "svelte-sonner";
	import * as Tabs from "#lib/components/ui/tabs/index.js";
	import { saveUiSettings } from "#lib/settings/settings.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { goto, refreshAll } from "$app/navigation";
	import { page } from "$app/state";
	import SettingsAddons from "./settings-addons.svelte";
	import SettingsAppearance from "./settings-appearance.svelte";
	import SettingsIntegrations from "./settings-integrations.svelte";
	import SettingsPlayback from "./settings-playback.svelte";
	import SettingsSync from "./settings-sync.svelte";

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

	// Which section is showing lives in the URL so it survives back/forward
	// and is shareable/deep-linkable.
	const tabs = [
		{ value: "appearance", label: "Appearance", icon: PaletteIcon },
		{ value: "playback", label: "Playback", icon: PlayIcon },
		{ value: "sync", label: "Sync", icon: RefreshCwIcon },
		{ value: "addons", label: "Addons", icon: PuzzleIcon },
		{ value: "integrations", label: "Integrations", icon: PlugIcon },
	] as const;
	type Tab = (typeof tabs)[number]["value"];
	const tab = $derived<Tab>(
		(tabs.find((t) => t.value === page.url.searchParams.get("tab"))?.value ??
			"appearance") as Tab,
	);

	function setTab(value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value === "appearance") {
			params.delete("tab");
		} else {
			params.set("tab", value);
		}
		const query = params.toString();
		void goto(query ? `?${query}` : "?", { reset: false });
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-8">
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

  <!-- `Tabs.Root` renders as `display:contents` : the actual row/column layout
	     is owned by this wrapper (stacked on narrow screens, sidebar from lg up)
	     so it never fights bits-ui's own orientation-driven flex classes. -->
  <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
    <Tabs.Root
      value={tab}
      onValueChange={setTab}
      orientation="vertical"
      class="contents"
    >
      <Tabs.List
        class="h-fit w-full shrink-0 gap-1 rounded-xl border border-foreground/10 bg-card p-2 lg:w-56"
      >
        {#each tabs as t (t.value)}
          <Tabs.Trigger
            value={t.value}
            class="gap-2.5 rounded-lg px-3 py-2.5 text-[0.9rem] font-medium data-[state=active]:bg-foreground/10 data-[state=active]:shadow-none"
          >
            <t.icon class="size-4" />
            {t.label}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>

      <Tabs.Content value="appearance" class="min-w-0">
        <SettingsAppearance {update} />
      </Tabs.Content>
      <Tabs.Content value="playback" class="min-w-0">
        <SettingsPlayback {update} />
      </Tabs.Content>
      <Tabs.Content value="sync" class="min-w-0">
        <SettingsSync {update} />
      </Tabs.Content>
      <Tabs.Content value="addons" class="min-w-0">
        <SettingsAddons />
      </Tabs.Content>
      <Tabs.Content value="integrations" class="min-w-0">
        <SettingsIntegrations {update} />
      </Tabs.Content>
    </Tabs.Root>
  </div>
</div>
