<script lang="ts">
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import XIcon from "@lucide/svelte/icons/x";
	import { browser } from "$app/env";
	import { apiHealth } from "$lib/system/health.remote";

	const healthQuery = apiHealth();
	const report = $derived(healthQuery.current);

	// "slow" is transient and usually self-corrects; only flag a sustained
	// problem. `down` can also just mean the probe endpoint is unreachable.
	const degraded = $derived(
		report?.status === "degraded" || report?.status === "down",
	);

	let dismissed = $state(false);
	let retrying = $state(false);

	const copy = $derived(
		report?.status === "down"
			? "Can't reach the Nuvio API. Your library and history may be out of date; changes are queued and will sync when it's back."
			: "The Nuvio API is degraded. Syncing library, progress and history may be slow or delayed.",
	);

	async function retry() {
		retrying = true;
		try {
			await healthQuery.refresh();
			dismissed = false;
		} finally {
			retrying = false;
		}
	}

	// Re-probe every 60s so the banner clears itself once the API recovers.
	$effect(() => {
		if (!browser) {
			return;
		}
		const timer = setInterval(() => {
			void healthQuery.refresh();
		}, 60_000);
		return () => clearInterval(timer);
	});
</script>

{#if degraded && !dismissed}
	<div
		role="status"
		class="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm text-amber-900 dark:text-amber-200"
	>
		<TriangleAlertIcon class="size-4 shrink-0" />
		<p class="flex-1">{copy}</p>
		<button
			type="button"
			onclick={retry}
			disabled={retrying}
			class="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium transition hover:bg-amber-500/15 disabled:opacity-50"
		>
			<RefreshCwIcon class="size-3.5 {retrying ? 'animate-spin' : ''}" />
			Retry
		</button>
		<button
			type="button"
			aria-label="Dismiss"
			onclick={() => (dismissed = true)}
			class="flex size-6 shrink-0 items-center justify-center rounded-md transition hover:bg-amber-500/15"
		>
			<XIcon class="size-3.5" />
		</button>
	</div>
{/if}
