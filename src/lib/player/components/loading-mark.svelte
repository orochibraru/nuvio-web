<script lang="ts">
	// The player's own loading motif : the brand mark itself, breathing gently
	// : independent of whatever title/logo art did or didn't load. A previous
	// version hand-drew a flat play-triangle-in-a-circle with rings that faded
	// to fully invisible mid-cycle: at a glance it read as a plain, static,
	// slightly-broken button rather than "loading". Using the real gradient
	// mark with an animation that never dips to invisible fixes both.
	const alt = ""; // decorative : aria-hidden below
</script>

<img
  src="/logo.png"
  {alt}
  aria-hidden="true"
  width="488"
  height="536"
  class="animate-loading-mark size-14 shrink-0 object-contain lg:size-18"
/>
