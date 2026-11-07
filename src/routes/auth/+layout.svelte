<script lang="ts">
	import AuroraBackground from "#lib/components/layout/aurora-background.svelte";
	import { m } from "#lib/i18n/index.js";
	import { forgetLocalData } from "#lib/sync/local-data.js";
	import PosterWall from "./poster-wall.svelte";

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
  class="dark relative grid min-h-svh w-full overflow-hidden bg-background text-foreground md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
  data-accent="blue"
  data-auth-screen
>
  <AuroraBackground class="opacity-60" />

  <section class="relative flex min-h-64 flex-col justify-end overflow-hidden p-6 md:min-h-svh md:p-12 lg:p-16">
    <PosterWall />
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-background/90 via-background/50 to-transparent"></div>
    <div class="relative flex flex-col gap-4">
      <img src="/logo-text.webp" alt="Nuvio" width={132} class="drop-shadow md:w-40" />
      <p class="text-3xl font-semibold tracking-tight text-balance md:text-5xl lg:text-6xl">
        {m.auth_tagline()}
      </p>
      <p class="text-sm text-foreground/70 md:text-base">{m.notice_unofficial()}</p>
    </div>
  </section>

  <main class="relative flex flex-col justify-center px-4 pb-10 sm:px-10 md:py-12 lg:px-16 xl:px-24">
    {@render children()}
  </main>
</div>
