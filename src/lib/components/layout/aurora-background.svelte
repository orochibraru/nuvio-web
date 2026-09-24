<script lang="ts">
	// Ambient colour wash : slowly drifting, heavily blurred blobs in the brand
	// gradient (indigo → violet → cyan). Purely decorative. Sits above the
	// parent's background paint but below `relative` content, so no z-index games.
	// A film grain on top dithers the banding low-alpha radial gradients get in
	// 8-bit colour.
	let {
		fixed = false,
		class: className = "",
	}: { fixed?: boolean; class?: string } = $props();
</script>

<div
  aria-hidden="true"
  class={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-0 overflow-hidden ${className}`}
>
  <div
    class="aurora-a absolute -top-1/3 -left-1/4 size-200 rounded-full opacity-70 blur-3xl will-change-transform"
    style="background: radial-gradient(circle, color-mix(in oklch, var(--primary) 85%, transparent), transparent 66%)"
  ></div>
  <div
    class="aurora-b absolute -right-1/4 -bottom-1/3 size-192 rounded-full opacity-60 blur-3xl will-change-transform"
    style="background: radial-gradient(circle, color-mix(in oklch, var(--primary) 70%, oklch(0.6 0.26 330 / 0.9)), transparent 68%)"
  ></div>
  <div
    class="aurora-c absolute top-1/4 right-1/5 size-140 rounded-full opacity-50 blur-3xl will-change-transform"
    style="background: radial-gradient(circle, oklch(0.72 0.16 205 / 0.85), transparent 70%)"
  ></div>
  <div
    class="pointer-events-none absolute inset-0 opacity-15 mix-blend-overlay"
    style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E&quot;)"
  ></div>
</div>
