<script lang="ts">
	import "./layout.css";
	import { ModeWatcher } from "mode-watcher";
	import { browser } from "$app/env";
	import { onNavigate } from "$app/navigation";
	import favicon from "$lib/assets/favicon.svg";
	import TopLoadingBar from "$lib/components/top-loading-bar.svelte";
	import { Toaster } from "$lib/components/ui/sonner/index.js";

	let { children } = $props();

	onNavigate((navigation) => {
		if (!browser) {
			return;
		}

		if (!document.startViewTransition) {
			return;
		}

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Nuvio</title>
</svelte:head>

<TopLoadingBar />
<ModeWatcher />
<Toaster />

{@render children()}
