<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import HeartIcon from "@lucide/svelte/icons/heart";
	import { Button } from "$lib/components/ui/button/index.js";
	import type { SupporterMember } from "$lib/nuvio/index.js";
	import { NUVIO_WEBSITE_URL } from "$lib/nuvio/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { supporterWall } from "./support.remote";

	pageTitle.set("Supporters");

	let { data } = $props();

	let extraPages = $state<SupporterMember[][]>([]);
	let loading = $state(false);
	let manuallyExhausted = $state(false);

	const top = $derived(data.wall?.ok ? data.wall.top.members : []);
	const recent = $derived([
		...(data.wall?.ok ? data.wall.recent.members : []),
		...extraPages.flat(),
	]);
	const total = $derived(data.wall?.ok ? data.wall.recent.totalCount : 0);
	const exhausted = $derived(
		manuallyExhausted || !data.wall?.ok || recent.length >= total,
	);

	function levelLabel(level: string): string {
		if (level === "SUPPORTER_PLUS") {
			return "Supporter+";
		}
		if (level === "SUPPORTER") {
			return "Supporter";
		}
		return level.replace(/_/g, " ").toLowerCase();
	}

	function sinceLabel(iso: string | null): string | null {
		if (!iso) {
			return null;
		}
		return new Date(iso).toLocaleDateString(undefined, {
			month: "short",
			year: "numeric",
		});
	}

	async function loadMore() {
		if (loading || exhausted) {
			return;
		}
		loading = true;
		try {
			const next = await supporterWall(recent.length);
			if (next.ok && next.recent.members.length > 0) {
				extraPages = [...extraPages, next.recent.members];
			} else {
				manuallyExhausted = true;
			}
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-svh">
	<header class="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
		<a href="/" class="flex items-center gap-2 text-lg font-bold tracking-tight">
			<span
				class="flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground"
			>
				N
			</span>
			Nuvio
		</a>
		<a
			href={data.signedIn ? "/" : "/auth/sign-in"}
			class="text-sm font-medium text-muted-foreground transition hover:text-foreground"
		>
			{data.signedIn ? "Back to app" : "Sign in"}
		</a>
	</header>

	<main class="mx-auto max-w-5xl px-6 pt-10 pb-20">
		<div class="flex flex-col items-center gap-4 text-center">
			<span
				class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20"
			>
				<HeartIcon class="size-7 fill-current" />
			</span>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Supporters</h1>
			<p class="max-w-lg text-sm text-muted-foreground">
				Nuvio is kept running by the people who chip in. Thank you to everyone below.
			</p>
			<Button
				href={`${NUVIO_WEBSITE_URL}/support`}
				target="_blank"
				rel="noopener noreferrer"
				class="mt-1"
			>
				<HeartIcon data-icon="inline-start" class="fill-current" /> Become a supporter
				<ExternalLinkIcon data-icon="inline-end" />
			</Button>
		</div>

		{#if !data.wall?.ok}
			<p class="mt-16 text-center text-sm text-muted-foreground">
				The supporter wall is unavailable right now.
			</p>
		{:else}
			{#snippet memberCard(member: SupporterMember)}
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-4 text-center"
				>
					<img
						src={member.avatarUrl}
						alt=""
						loading="lazy"
						class="size-14 rounded-full object-cover ring-1 ring-white/10"
					/>
					<p class="w-full truncate text-sm font-semibold">{member.displayName}</p>
					<span
						class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
					>
						{levelLabel(member.membershipLevel)}
					</span>
					{#if sinceLabel(member.supporterSince)}
						<span class="text-xs text-muted-foreground">
							since {sinceLabel(member.supporterSince)}
						</span>
					{/if}
				</div>
			{/snippet}

			{#if top.length > 0}
				<section class="mt-14 flex flex-col gap-4">
					<h2 class="text-xl font-semibold tracking-tight">Top supporters</h2>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
						{#each top as member, i (`${member.displayName}-${member.supporterSince}-${i}`)}
							{@render memberCard(member)}
						{/each}
					</div>
				</section>
			{/if}

			{#if recent.length > 0}
				<section class="mt-14 flex flex-col gap-4">
					<h2 class="text-xl font-semibold tracking-tight">Recently joined</h2>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
						{#each recent as member, i (`${member.displayName}-${member.supporterSince}-${i}`)}
							{@render memberCard(member)}
						{/each}
					</div>
					{#if !exhausted}
						<div class="flex justify-center pt-2">
							<Button variant="outline" disabled={loading} onclick={loadMore}>
								{loading ? "Loading…" : "Show more"}
							</Button>
						</div>
					{/if}
				</section>
			{/if}
		{/if}
	</main>
</div>
