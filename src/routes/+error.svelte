<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button/index.js";

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? "Something went wrong.");
</script>

<div class="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden p-6 text-center">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 hidden h-[50vh] dark:block"
		style="background: radial-gradient(50% 45% at 50% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)"
	></div>
	<p class="relative text-7xl font-bold tracking-tight text-foreground/15">{status}</p>
	<h1 class="relative text-xl font-semibold tracking-tight">{message}</h1>
	<div class="relative mt-2 flex gap-2">
		<Button variant="outline" onclick={() => history.back()}>Go back</Button>
		<Button href={resolve("/")}>Home</Button>
	</div>
</div>
