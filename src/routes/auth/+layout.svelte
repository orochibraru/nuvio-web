<script lang="ts">
	let { children } = $props();
</script>

<div class="relative flex min-h-svh w-full items-center justify-center overflow-hidden p-6">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 hidden h-[55vh] dark:block"
		style="background: radial-gradient(55% 45% at 50% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)"
	></div>

	<div class="relative flex w-full max-w-sm flex-col gap-6">
		<div class="flex flex-col items-center gap-3 text-center">
			<span
				class="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm"
			>
				N
			</span>
			<span class="text-xl font-bold tracking-tight">Nuvio</span>
		</div>
		{@render children()}
	</div>
</div>
