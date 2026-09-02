<script lang="ts">
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import WifiOffIcon from "@lucide/svelte/icons/wifi-off";
	import XIcon from "@lucide/svelte/icons/x";
	import { sync } from "#lib/sync/store.svelte.js";
	import { apiHealth } from "#lib/system/health.remote.js";
	import { browser } from "$app/env";

	const healthQuery = apiHealth();
	const report = $derived(healthQuery.current);

	// "slow" is transient and usually self-corrects; only flag a sustained
	// problem. `down` can also just mean the probe endpoint is unreachable.
	const degraded = $derived(
		report?.status === "degraded" || report?.status === "down",
	);

	let offline = $state(false);
	let dismissed = $state(false);
	let retrying = $state(false);

	// Priority: offline → your writes aren't landing → API degraded.
	const mode = $derived(
		offline
			? "offline"
			: sync.stalled
				? "stalled"
				: degraded
					? "degraded"
					: null,
	);

	const copy = $derived(
		mode === "offline"
			? "You're offline. Browsing shows the last synced data; changes are queued and sync when you reconnect."
			: mode === "stalled"
				? "Some of your changes haven't synced. They're saved locally and will retry : check your connection or sign in again."
				: report?.status === "down"
					? "Can't reach the Nuvio API. Your library and history may be out of date; changes are queued and will sync when it's back."
					: "The Nuvio API is degraded. Syncing library, progress and history may be slow or delayed.",
	);

	async function retry() {
		retrying = true;
		try {
			await Promise.all([healthQuery.refresh(), sync.flushNow()]);
			dismissed = false;
		} finally {
			retrying = false;
		}
	}

	$effect(() => {
		if (!browser) {
			return;
		}
		offline = !navigator.onLine;
		const onOnline = () => {
			offline = false;
			dismissed = false;
			void healthQuery.refresh();
		};
		const onOffline = () => {
			offline = true;
		};
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);
		// Re-probe every 60s so the banner clears itself once the API recovers.
		const timer = setInterval(() => {
			void healthQuery.refresh();
		}, 60_000);
		return () => {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
			clearInterval(timer);
		};
	});
</script>

{#if mode && !dismissed}
  <div
    role="status"
    class="-mx-6 flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-6 py-2 text-sm text-warning-foreground"
  >
    {#if mode === "offline"}
      <WifiOffIcon class="size-4 shrink-0" />
    {:else}
      <TriangleAlertIcon class="size-4 shrink-0" />
    {/if}
    <p class="flex-1">{copy}</p>
    {#if mode === "degraded" || mode === "stalled"}
      <button
        type="button"
        onclick={retry}
        disabled={retrying}
        class="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium transition hover:bg-warning/15 disabled:opacity-50"
      >
        <RefreshCwIcon class="size-3.5 {retrying ? 'animate-spin' : ''}" />
        Retry
      </button>
    {/if}
    <button
      type="button"
      aria-label="Dismiss"
      onclick={() => (dismissed = true)}
      class="flex size-9 shrink-0 items-center justify-center rounded-md transition hover:bg-warning/15"
    >
      <XIcon class="size-4" />
    </button>
  </div>
{/if}
