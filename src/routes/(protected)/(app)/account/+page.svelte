<script lang="ts">
	import * as Tabs from "#lib/components/ui/tabs/index.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import AccountHistory from "./account-history.svelte";
	import AccountOverview from "./account-overview.svelte";
	import AccountStats from "./account-stats.svelte";
	import AccountStorage from "./account-storage.svelte";

	pageTitle.set("Account");

	let { data } = $props();

	// Which section is showing lives in the URL so it survives back/forward
	// and is shareable/deep-linkable (e.g. from the command palette).
	const tabs = [
		{ value: "overview", label: "Overview" },
		{ value: "history", label: "Watch history" },
		{ value: "stats", label: "Stats" },
		{ value: "storage", label: "Storage & sync" },
	] as const;
	type Tab = (typeof tabs)[number]["value"];
	const tab = $derived<Tab>(
		(tabs.find((t) => t.value === page.url.searchParams.get("tab"))?.value ??
			"overview") as Tab,
	);

	function setTab(value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value === "overview") {
			params.delete("tab");
		} else {
			params.set("tab", value);
		}
		const query = params.toString();
		void goto(query ? `?${query}` : "?", { reset: false });
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6">
	<h1 class="text-3xl font-bold tracking-tight">Account</h1>

	<Tabs.Root value={tab} onValueChange={setTab}>
		<Tabs.List class="w-full sm:w-fit">
			{#each tabs as t (t.value)}
				<Tabs.Trigger value={t.value}>{t.label}</Tabs.Trigger>
			{/each}
		</Tabs.List>

		<Tabs.Content value="overview">
			<AccountOverview {data} />
		</Tabs.Content>
		<Tabs.Content value="history">
			<AccountHistory items={data.historyItems} />
		</Tabs.Content>
		<Tabs.Content value="stats">
			<AccountStats />
		</Tabs.Content>
		<Tabs.Content value="storage">
			<AccountStorage {data} />
		</Tabs.Content>
	</Tabs.Root>
</div>
