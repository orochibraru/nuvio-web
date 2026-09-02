<script lang="ts">
	import * as Card from "#lib/components/ui/card/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";

	let { update }: { update: (patch: Partial<UiSettings>) => Promise<void> } =
		$props();

	const syncSources: Array<{
		value: UiSettings["librarySource"];
		label: string;
		ready: boolean;
	}> = [
		{ value: "nuvio", label: "Nuvio Sync", ready: true },
		{ value: "trakt", label: "Trakt", ready: false },
		{ value: "simkl", label: "SIMKL", ready: false },
	];

	function setSyncSource(
		key: "librarySource" | "progressSource",
		value: UiSettings["librarySource"],
	) {
		void update(
			key === "librarySource"
				? { librarySource: value }
				: { progressSource: value },
		);
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Sync</Card.Title>
		<Card.Description>
			Choose where your library and watch progress live. Trakt and SIMKL need
			to be connected first.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-7">
		{#each [{ key: "librarySource", label: "Library from" }, { key: "progressSource", label: "Watch progress from" }] as const as row (row.key)}
			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">{row.label}</span>
				<div
					class="flex w-fit flex-wrap gap-1 rounded-full bg-foreground/5 p-1"
				>
					{#each syncSources as option (option.value)}
						<button
							type="button"
							disabled={!option.ready}
							title={option.ready
								? undefined
								: `Connect ${option.label} in the Nuvio app first`}
							onclick={() => setSyncSource(row.key, option.value)}
							class={cn(
								"rounded-full px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
								theme.current[
									row.key as "librarySource" | "progressSource"
								] === option.value
									? "bg-primary text-primary-foreground shadow-sm"
									: "text-muted-foreground enabled:hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		{/each}
		<p class="text-xs text-muted-foreground">
			Nuvio Sync is always the cross-device mirror. Trakt / SIMKL integration
			is coming.
		</p>
	</Card.Content>
</Card.Root>
