<script lang="ts">
	import MediaRow from "$lib/components/media-row.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	let { data } = $props();
</script>

<div class="flex flex-col gap-8">
	<h1 class="text-2xl font-semibold tracking-tight">Welcome back, {data.profile.name}</h1>

	{#if data.resume.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-semibold tracking-tight">Continue watching</h2>
			<div class="-mx-2 flex gap-4 overflow-x-auto px-2 pb-2 scrollbar-thin">
				{#each data.resume as item (`${item.type}:${item.videoId}`)}
					<a
						href={`/watch/${item.type}/${encodeURIComponent(item.videoId)}`}
						class="group flex w-40 shrink-0 flex-col gap-2"
					>
						<div class="relative aspect-video overflow-hidden rounded-lg bg-muted">
							{#if item.poster}
								<img
									src={item.poster}
									alt={item.name}
									loading="lazy"
									class="size-full object-cover transition group-hover:scale-105"
								/>
							{/if}
							<div class="absolute inset-x-0 bottom-0 h-1 bg-white/25">
								<div class="h-full bg-primary" style={`width: ${item.progress * 100}%`}></div>
							</div>
						</div>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{item.name}</p>
							{#if item.season != null && item.episode != null}
								<p class="text-xs text-muted-foreground">S{item.season}E{item.episode}</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

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
