<script lang="ts">
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { m } from "#lib/i18n/index.js";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const shortcuts = $derived([
		{
			keys: [m.player_shortcut_key_space(), "K"],
			label: m.player_shortcut_play(),
		},
		{ keys: ["←", "J", "→", "L"], label: m.player_shortcut_seek() },
		{ keys: ["0-9"], label: m.player_shortcut_jump() },
		{ keys: ["↑", "↓"], label: m.player_shortcut_volume() },
		{ keys: ["M"], label: m.player_mute() },
		{ keys: ["<", ">"], label: m.player_shortcut_speed() },
		{ keys: ["F"], label: m.player_fullscreen() },
		{ keys: ["P"], label: m.player_pip() },
		{ keys: ["C"], label: m.player_shortcut_subtitles() },
		{ keys: ["G", "H"], label: m.player_shortcut_subtitle_delay() },
		{ keys: ["I"], label: m.player_shortcut_info() },
		{ keys: ["N"], label: m.player_next_episode() },
		{ keys: ["E"], label: m.player_shortcut_episodes() },
		{ keys: ["?"], label: m.player_shortcut_help() },
		{ keys: ["Esc"], label: m.player_shortcut_close() },
	]);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="dark sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{m.player_shortcuts_title()}</Dialog.Title>
    </Dialog.Header>
    <dl class="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5">
      {#each shortcuts as shortcut (shortcut.label)}
        <dt class="flex flex-wrap gap-1">
          {#each shortcut.keys as key (key)}
            <kbd
              class="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-foreground ring-1 ring-foreground/10"
              >{key}</kbd
            >
          {/each}
        </dt>
        <dd class="text-muted-foreground">{shortcut.label}</dd>
      {/each}
    </dl>
  </Dialog.Content>
</Dialog.Root>
