<script lang="ts">
	import ScrollRail from "#lib/components/layout/scroll-rail.svelte";
	import { browserServices } from "#lib/services/browser.js";
	import { PEOPLE, type Person } from "#lib/services/index.js";
	import { browser } from "$app/env";
	import { resolve } from "$app/paths";

	let { names, class: className }: { names: string[]; class?: string } =
		$props();

	let people = $state<Record<string, Person>>({});
	$effect(() => {
		if (!browser) {
			return;
		}
		for (const name of names) {
			if (!(name in people)) {
				people[name] = { name, photo: null, bio: null, born: null };
				void browserServices
					.get(PEOPLE)
					.info(name)
					.then((info) => {
						people[name] = info;
					});
			}
		}
	});

	const currentYear = new Date().getFullYear();

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? "")
			.join("");
	}
</script>

<ScrollRail label="Cast" class={className} trackClass="gap-3 pb-2">
	{#each names as name (name)}
		{@const person = people[name]}
		<a
			href={resolve(`search?q=${encodeURIComponent(name)}`)}
			class="group/cast flex w-40 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5 content-auto transition-colors hover:border-primary/40 hover:bg-card"
		>
			<div class="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
				<span class="absolute inset-0 flex items-center justify-center bg-linear-to-br from-muted to-background text-lg font-semibold text-muted-foreground/50">
					{initials(name)}
				</span>
				{#if person?.photo}
					<img
						src={person.photo}
						alt={name}
						loading="lazy"
						decoding="async"
						class="relative size-full object-cover object-top transition-transform duration-200 group-hover/cast:scale-105"
					/>
				{/if}
			</div>
			<div class="min-w-0">
				<p class="truncate text-sm font-semibold">
					{name}
					{#if person?.born}
						<span class="font-normal text-muted-foreground">
							· {currentYear - person.born}
						</span>
					{/if}
				</p>
				{#if person?.bio}
					<p class="mt-0.5 line-clamp-3 text-xs leading-snug text-muted-foreground">
						{person.bio}
					</p>
				{/if}
			</div>
		</a>
	{/each}
</ScrollRail>
