<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import { m } from "#lib/i18n/index.js";
	import { sourcesPanel } from "#lib/watch/sources-panel.svelte.js";
	import StreamPanel from "#lib/watch/stream-panel.svelte";
	import { beforeNavigate } from "$app/navigation";

	let { children } = $props();

	// The shared source drawer for /detail and /player. Kept in module state (not
	// the URL) so opening it never pushes a history entry. `resolveStreams` is
	// client-cached by args, so reopening it on the player is instant.
	const target = $derived(sourcesPanel.target);

	// A phone gets it as a bottom sheet, like the library's filters. The sheet
	// stays mounted and keeps showing the last target while it slides away.
	const phone = new MediaQuery("max-width: 47.99rem");
	let sheetTarget = $state<{ type: string; videoId: string } | null>(null);
	$effect(() => {
		if (target) {
			sheetTarget = target;
		}
	});

	// Any navigation dismisses it : including the pick → /player jump. Closing on
	// `beforeNavigate` keeps it from flashing over the destination page.
	beforeNavigate(({ shallow }) => {
		if (shallow) {
			return;
		}

		return sourcesPanel.close();
	});
</script>

{@render children()}

{#if phone.current}
  <!-- Bound both ways: vaul closes from inside (a swipe, the overlay) without
       always reporting it through `onOpenChange`, which left the panel's
       target set, so the next "Select stream" changed nothing. -->
  <Drawer.Root
    bind:open={
      () => Boolean(target),
      (open) => {
        if (!open) {
          sourcesPanel.close();
        }
      }
    }
  >
    <Drawer.Content class="max-h-[90dvh]">
      <Drawer.Title class="sr-only">{m.common_sources()}</Drawer.Title>
      {#if sheetTarget}
        <StreamPanel
          type={sheetTarget.type}
          videoId={sheetTarget.videoId}
          onClose={() => sourcesPanel.close()}
          sheet
        />
      {/if}
    </Drawer.Content>
  </Drawer.Root>
{:else if target}
  {@const active = target}
  <StreamPanel
    type={active.type}
    videoId={active.videoId}
    onClose={() => sourcesPanel.close()}
  />
{/if}
