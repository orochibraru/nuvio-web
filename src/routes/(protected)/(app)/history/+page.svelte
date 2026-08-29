<script lang="ts">
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { deleteHistory } from "$lib/history/history.remote";

	let { data } = $props();

	let deleted = $state<string[]>([]);

	function dayLabel(ts: number): string {
		const date = new Date(ts);
		const now = new Date();
		const startOfToday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const dayMs = 86_400_000;
		if (ts >= startOfToday) {
			return "Today";
		}
		if (ts >= startOfToday - dayMs) {
			return "Yesterday";
		}
		if (ts >= startOfToday - 6 * dayMs) {
			return date.toLocaleDateString(undefined, { weekday: "long" });
		}
		return date.toLocaleDateString(undefined, {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	}

	const groups = $derived.by(() => {
		const visible = data.items.filter((item) => !deleted.includes(item.id));
		const map = new Map<string, typeof visible>();
		for (const item of visible) {
			const label = dayLabel(item.watchedAt);
			const bucket = map.get(label);
			if (bucket) {
				bucket.push(item);
			} else {
				map.set(label, [item]);
			}
		}
		return [...map.entries()];
	});

	function episodeTag(season: number | null, episode: number | null): string {
		if (season == null || episode == null) {
			return "";
		}
		return ` · S${season}E${episode}`;
	}

	async function remove(item: (typeof data.items)[number]) {
		deleted = [...deleted, item.id];
		try {
			await deleteHistory({
				content_id: item.contentId,
				season: item.season ?? undefined,
				episode: item.episode ?? undefined,
			});
		} catch {
			deleted = deleted.filter((id) => id !== item.id);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-semibold tracking-tight">Watch history</h1>

	{#if groups.length === 0}
		<div class="rounded-lg border border-border p-8 text-center">
			<p class="font-medium">Nothing watched yet</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Titles you finish show up here.
			</p>
		</div>
	{:else}
		{#each groups as [label, items] (label)}
			<section class="flex flex-col gap-2">
				<h2 class="text-sm font-medium text-muted-foreground">{label}</h2>
				<div class="flex flex-col divide-y divide-border rounded-lg border border-border">
					{#each items as item (item.id)}
						<div class="flex items-center gap-3 p-3">
							<div class="min-w-0 flex-1">
								<a
									href={`/detail/${item.type}/${encodeURIComponent(item.contentId)}`}
									class="truncate text-sm font-medium hover:underline"
								>
									{item.title}{episodeTag(item.season, item.episode)}
								</a>
								<p class="text-xs text-muted-foreground">
									{new Date(item.watchedAt).toLocaleTimeString(undefined, {
										hour: "numeric",
										minute: "2-digit",
									})}
								</p>
							</div>
							<button
								type="button"
								aria-label="Remove"
								onclick={() => remove(item)}
								class="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
							>
								<Trash2Icon class="size-4" />
							</button>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>
