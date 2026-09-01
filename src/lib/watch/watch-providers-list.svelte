<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import type { WatchOffer, WatchProviders } from "./watch-providers.ts";

	let {
		providers,
		heading = "Available on",
		class: className = "",
	}: {
		providers: WatchProviders;
		heading?: string | null;
		class?: string;
	} = $props();

	const groups = $derived(
		(
			[
				["Stream", providers.stream],
				["Rent", providers.rent],
				["Buy", providers.buy],
			] as Array<[string, WatchOffer[]]>
		).filter(([, offers]) => offers.length > 0),
	);
</script>

{#if groups.length > 0}
	<div class={`flex flex-col gap-3 ${className}`}>
		{#if heading}
			<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{heading}
			</p>
		{/if}
		<div class="flex flex-col gap-3">
			{#each groups as [label, offers] (label)}
				<div class="grid grid-cols-[3rem_1fr] items-start gap-x-2 gap-y-2">
					<span class="pt-1 text-xs font-medium text-muted-foreground">
						{label}
					</span>
					<div class="flex flex-wrap items-center gap-2">
						{#each offers as offer (offer.provider)}
							<a
								href={offer.url}
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-1.5 rounded-full border border-border bg-card/60 py-1 pr-3 pl-1 text-xs font-medium transition hover:border-primary/40 hover:bg-card"
							>
								{#if offer.icon}
									<img
										src={offer.icon}
										alt=""
										loading="lazy"
										class="size-5 shrink-0 rounded-full object-cover"
									/>
								{:else}
									<span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
										<ExternalLinkIcon class="size-3 text-muted-foreground" />
									</span>
								{/if}
								{offer.provider}
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		{#if providers.justWatchUrl}
			<a
				href={providers.justWatchUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
			>
				More options on JustWatch
				<ExternalLinkIcon class="size-3" />
			</a>
		{/if}
	</div>
{/if}
