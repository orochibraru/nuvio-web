<script lang="ts">
	// A brand-coloured play mark with rings pulsing outward from it — the
	// player's own loading animation, independent of whatever title/logo art
	// did or didn't load for this title.
	const uid = $props.id();
	const gradientId = `loading-mark-${uid}`;
</script>

<svg viewBox="0 0 120 120" class="size-16 shrink-0 lg:size-20" aria-hidden="true">
	<defs>
		<radialGradient id={gradientId} cx="35%" cy="35%" r="75%">
			<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.95" />
			<stop offset="100%" stop-color="var(--primary)" stop-opacity="0.55" />
		</radialGradient>
	</defs>
	<circle
		class="animate-loading-ring"
		cx="60"
		cy="60"
		r="36"
		fill="none"
		stroke="var(--primary)"
		stroke-width="2"
	/>
	<circle
		class="animate-loading-ring"
		style="animation-delay: 0.9s"
		cx="60"
		cy="60"
		r="36"
		fill="none"
		stroke="var(--primary)"
		stroke-width="2"
	/>
	<g class="animate-loading-core">
		<circle cx="60" cy="60" r="34" fill={`url(#${gradientId})`} />
		<path d="M51 42 L86 60 L51 78 Z" fill="var(--primary-foreground)" />
	</g>
</svg>
