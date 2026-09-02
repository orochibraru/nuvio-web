<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
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
			toast.error("Couldn't save — reverted.");
		}
	}

	// Which section is showing lives in the URL so it survives back/forward
	// and is shareable/deep-linkable.
	const tabs = [
		{ value: "appearance", label: "Appearance" },
		{ value: "playback", label: "Playback" },
		{ value: "sync", label: "Sync" },
		{ value: "addons", label: "Addons" },
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

<div class="mx-auto flex max-w-3xl flex-col gap-6">
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

	<Tabs.Root value={tab} onValueChange={setTab}>
		<Tabs.List class="w-full sm:w-fit">
			{#each tabs as t (t.value)}
				<Tabs.Trigger value={t.value}>{t.label}</Tabs.Trigger>
			{/each}
		</Tabs.List>

		<Tabs.Content value="appearance">
			<SettingsAppearance {update} />
		</Tabs.Content>
		<Tabs.Content value="playback">
			<SettingsPlayback {update} />
		</Tabs.Content>
		<Tabs.Content value="sync">
			<SettingsSync {update} />
		</Tabs.Content>
		<Tabs.Content value="addons">
			<SettingsAddons />
		</Tabs.Content>
	</Tabs.Root>
</div>
