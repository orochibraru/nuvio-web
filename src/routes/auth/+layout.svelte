<script lang="ts">
	import AuroraBackground from "#lib/components/aurora-background.svelte";

	let { children } = $props();
</script>

<!--
	The auth screens sit outside the profile-gated app, so there's no stored theme
	to seed from — pin them to the dark palette (scoped `.dark`, no global toggle).
-->
<div
	class="dark relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background p-6 text-foreground"
>
	<AuroraBackground />
	<div
		class="pointer-events-none absolute inset-0 opacity-15 mix-blend-overlay"
		style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E&quot;)"
	></div>
	<div
		class="pointer-events-none absolute inset-0"
		style="background: radial-gradient(38% 34% at 50% 50%, color-mix(in oklch, var(--background) 78%, transparent), transparent 72%)"
	></div>

	<div class="relative flex w-full max-w-sm flex-col gap-6">
		<div class="flex flex-col items-center gap-2 text-center">
			<img src="/logo-text.webp" alt="Nuvio" width={132} class="drop-shadow" />
			<p class="text-sm text-muted-foreground">Your library, everywhere.</p>
		</div>
		{@render children()}
	</div>
</div>
