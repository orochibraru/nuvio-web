<script lang="ts">
	import AuroraBackground from "#lib/components/layout/aurora-background.svelte";
	import { m } from "#lib/i18n/index.js";
	import { forgetLocalData } from "#lib/sync/local-data.js";

	let { children } = $props();

	// Reaching any auth screen means there is no valid session (the load
	// redirects anyone who has one), so this is where every way of losing one
	// converges: sign-out, an expired refresh token, an eviction by the
	// instance lock. Clearing cookies leaves the IndexedDB mirror and the
	// unflushed write queue behind for whoever signs in next; this is what
	// takes them.
	$effect(() => {
		void forgetLocalData();
	});
</script>

<!--
	The auth screens sit outside the profile-gated app, so there's no stored theme
	to seed from : pin them to the dark palette + the default accent so the CTA
	and aurora carry the brand colour.
-->
<div
  class="dark relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background p-6 text-foreground"
  data-accent="blue"
>
  <AuroraBackground />
  <div
    class="pointer-events-none absolute inset-0"
    style="background: radial-gradient(38% 34% at 50% 50%, color-mix(in oklch, var(--background) 78%, transparent), transparent 72%)"
  ></div>

  <div class="relative flex w-full max-w-sm flex-col gap-6">
    <div class="flex flex-col items-center gap-2 text-center">
      <img src="/logo-text.webp" alt="Nuvio" width={132} class="drop-shadow" />
      <p class="text-sm text-muted-foreground">{m.auth_tagline()}</p>
    </div>
    {@render children()}
  </div>
</div>
