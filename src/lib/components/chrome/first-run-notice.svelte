<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { m } from "#lib/i18n/index.js";
	import { browser } from "$app/env";

	const KEY = "nuvio:disclaimer-ack:v1";

	let open = $state(false);

	$effect(() => {
		if (!browser) {
			return;
		}
		try {
			open = localStorage.getItem(KEY) !== "1";
		} catch {
			open = false;
		}
	});

	function acknowledge() {
		try {
			localStorage.setItem(KEY, "1");
		} catch {
			// storage unavailable : the notice just shows again next load
		}
		open = false;
	}
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="sm:max-w-lg"
    showCloseButton={false}
    onEscapeKeydown={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
  >
    <Dialog.Header>
      <Dialog.Title>{m.notice_title()}</Dialog.Title>
      <Dialog.Description>{m.notice_description()}</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>{m.notice_hosts_nothing()}</p>
      <p>{m.notice_responsibility()}</p>
      <p>{m.notice_unofficial()}</p>
    </div>

    <Dialog.Footer class="mt-4">
      <Button onclick={acknowledge}>{m.notice_understand()}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
