<script lang="ts">
	let { children } = $props();
</script>

<div class="flex min-h-svh w-full items-center justify-center bg-muted/30 p-6">
	<div class="flex w-full max-w-sm flex-col gap-6">
		<div class="flex flex-col items-center gap-1 text-center">
			<span class="text-lg font-semibold tracking-tight">Nuvio</span>
		</div>
		{@render children()}
	</div>
</div>
