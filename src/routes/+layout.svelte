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

	// Guards a race that leaves the browser painting a stale page: if a second
	// navigation starts while a view transition is still running, Chromium can
	// keep the previous transition's `::view-transition-old` snapshot on top of
	// the (already updated) DOM — the URL changes but the old page stays visible.
	let activeTransition: { skipTransition: () => void } | null = null;

	onNavigate((navigation) => {
		if (!browser || typeof document.startViewTransition !== "function") {
			return;
		}

		// Drop any in-flight transition before starting the next one.
		activeTransition?.skipTransition();

		return new Promise((resolve) => {
			// Never let the transition machinery stall a navigation: if the update
			// callback hasn't run within a couple of frames, resolve anyway and
			// skip the animation. `onNavigate` blocks the nav until this settles.
			let settled = false;
			const done = () => {
				if (!settled) {
					settled = true;
					resolve();
				}
			};
			const failsafe = setTimeout(() => {
				done();
				activeTransition?.skipTransition();
			}, 250);

			const transition = document.startViewTransition(async () => {
				clearTimeout(failsafe);
				done();
				// `navigation.complete` rejects when the navigation is superseded or
				// aborted — swallow it so the update callback still settles and the
				// transition pseudo-elements are torn down cleanly.
				await navigation.complete.catch(() => {});
			});
			activeTransition = transition;
			void transition.finished.finally(() => {
				if (activeTransition === transition) {
					activeTransition = null;
				}
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
