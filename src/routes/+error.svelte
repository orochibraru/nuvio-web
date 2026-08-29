<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import { page } from "$app/state";

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? "Something went wrong.");
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
	<p class="text-6xl font-semibold tracking-tight text-muted-foreground">{status}</p>
	<h1 class="text-xl font-medium">{message}</h1>
	<div class="flex gap-2">
		<Button variant="outline" onclick={() => history.back()}>Go back</Button>
		<Button href="/">Home</Button>
	</div>
</div>
