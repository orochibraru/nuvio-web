<script lang="ts">
  import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
  import XIcon from "@lucide/svelte/icons/x";
  import { NUVIO_WEBSITE_URL } from "#lib/nuvio/index.js";
  import { browser } from "$app/env";
  import { page } from "$app/state";

  const KEY = "nuvio:mobile-banner-dismissed";
  let dismissed = $state(true);

  // The player is a full-screen surface : a fixed bottom bar would land on the
  // transport controls.
  const onPlayer = $derived(page.url.pathname.includes("/player"));

  $effect(() => {
    if (!browser) {
      return;
    }
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {
      dismissed = false;
    }
  });

  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // storage unavailable : banner re-shows next load
    }
  }
</script>

{#if !dismissed && !onPlayer}
  <div
    class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 text-sm shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.4)] backdrop-blur md:hidden"
  >
    <SmartphoneIcon class="size-5 shrink-0 text-muted-foreground" />
    <p class="flex-1 text-muted-foreground">
      Nuvio web is built for the desktop. On a phone, the
      <a href={NUVIO_WEBSITE_URL} class="font-medium text-foreground underline">
        mobile app
      </a>
      works better.
    </p>
    <button
      type="button"
      aria-label="Dismiss"
      onclick={dismiss}
      class="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
    >
      <XIcon class="size-4" />
    </button>
  </div>
{/if}
