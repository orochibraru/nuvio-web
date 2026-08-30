<script lang="ts">
	let { children } = $props();
</script>

<!--
	The auth screens sit outside the profile-gated app, so there's no stored theme
	to seed from — pin them to the dark palette (scoped `.dark`, no global toggle).
-->
<div
	class="dark relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background p-6 text-foreground"
>
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
		style="background: radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 20%, transparent), transparent 72%)"
	></div>
	<div
		class="pointer-events-none absolute -bottom-40 left-1/2 size-144 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
		style="background: radial-gradient(circle, color-mix(in oklch, var(--primary) 35%, transparent), transparent 70%)"
	></div>

	<div class="relative flex w-full max-w-sm flex-col gap-6">
		<div class="flex flex-col items-center gap-2 text-center">
			<img src="/logo-text.webp" alt="Nuvio" width={132} class="drop-shadow" />
			<p class="text-sm text-muted-foreground">Your library, everywhere.</p>
		</div>
		{@render children()}
	</div>
</div>
