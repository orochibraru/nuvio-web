<script lang="ts">
	import MediaRow from "$lib/components/media-row.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	let { data } = $props();
</script>

<div class="flex flex-col gap-8">
	<h1 class="text-2xl font-semibold tracking-tight">Welcome back, {data.profile.name}</h1>

	{#if data.library.length > 0}
		<MediaRow title="My library" items={data.library} href="/library" />
	{/if}

	{#if data.rows.length === 0}
		<div class="rounded-lg border border-border p-8 text-center">
			<p class="font-medium">Nothing to show yet</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Add a catalog addon and your home feed fills in.
			</p>
			<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
		</div>
	{:else}
		{#each data.rows as row (`${row.addonId}:${row.type}:${row.id}`)}
			<MediaRow
				title={row.title}
				items={row.metas}
				href={`/discover?c=${encodeURIComponent(`${row.addonId}|${row.type}|${row.id}`)}`}
			/>
		{/each}
	{/if}
</div>
