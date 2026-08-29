<script lang="ts">
	let { data } = $props();
</script>

<div class="flex flex-col gap-2">
	<h1 class="text-2xl font-semibold tracking-tight">Welcome back, {data.profile.name}</h1>
	<p class="text-muted-foreground">
		The home feed (continue watching, catalog rows, library) arrives in Phase 4.
	</p>
</div>
