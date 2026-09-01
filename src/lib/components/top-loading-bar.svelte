<script lang="ts">
	import { cubicOut } from "svelte/easing";
	import { Tween } from "svelte/motion";
	import { fade } from "svelte/transition";
	import { reduced } from "#lib/motion.js";
	import { navigating } from "$app/state";

	let showLoadingBar = $state(false);

	const progress = new Tween(0, {
		duration: 400,
		easing: cubicOut,
	});

	async function handleNavigate() {
		if (navigating) {
			showLoadingBar = true;
			progress.target = 0;

			const updater = setInterval(() => {
				progress.target = progress.current + 0.05;
			}, 100);

			await navigating.complete;
			clearInterval(updater);

			progress.target = 1;
			setTimeout(() => {
				showLoadingBar = false;
				progress.target = 0;
			}, 500);
		}
	}

	$effect(() => {
		if (navigating.to) {
			void handleNavigate();
		}
	});
</script>

{#if showLoadingBar}
  <div
    class="fixed top-0 z-50 h-0.5 w-full bg-primary transition-all will-change-transform"
    transition:fade={reduced({ duration: 400 })}
  >
    <div
      class="bg-primary h-full"
      style="width: {progress.current * 100}%"
    ></div>
  </div>
{/if}
