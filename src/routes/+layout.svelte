<script lang="ts">
	import "./layout.css";
	import { ModeWatcher } from "mode-watcher";
	import { browser } from "$app/env";
	import { beforeNavigate, onNavigate } from "$app/navigation";
	import favicon from "$lib/assets/logo.png";
	import SmallScreenNotice from "$lib/components/small-screen-notice.svelte";
	import TopLoadingBar from "$lib/components/top-loading-bar.svelte";
	import { Toaster } from "$lib/components/ui/sonner/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";

	let { children } = $props();

	// Each page owns its title segment; clear it between pages so one that sets
	// nothing shows plain "Nuvio" rather than the previous page's title.
	beforeNavigate(() => pageTitle.set(null));

	// `<svelte:head>` updates don't always flush through a view transition, so
	// drive the tab title from an effect too.
	$effect(() => {
		document.title = pageTitle.full;
	});

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
  <title>{pageTitle.full}</title>
</svelte:head>

<TopLoadingBar />
<ModeWatcher />
<Toaster richColors closeButton />
<SmallScreenNotice />

{@render children()}
