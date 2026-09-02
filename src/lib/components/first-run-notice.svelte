<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
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
      <Dialog.Title>Before you start</Dialog.Title>
      <Dialog.Description>How Nuvio Web works, in short.</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>
        Nuvio Web hosts no video, metadata or subtitles. Everything you browse
        and play comes from the third-party addons you choose to install.
      </p>
      <p>
        You are responsible for the addons you add and for having the right to
        access what they return. Add only addons you trust.
      </p>
      <p>
        This is an unofficial client and is not affiliated with or endorsed by
        Nuvio.
      </p>
    </div>

    <Dialog.Footer class="mt-4">
      <Button onclick={acknowledge}>I understand</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
