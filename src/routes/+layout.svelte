<script lang="ts">
	import "./layout.css";
	import { ModeWatcher } from "mode-watcher";
	import favicon from "#lib/assets/favicon.svg";
	import { Toaster } from "#lib/components/ui/sonner/index.js";

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster />

{@render children()}
