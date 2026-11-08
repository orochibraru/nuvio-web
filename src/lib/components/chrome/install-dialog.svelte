<script lang="ts">
	import AppWindowIcon from "@lucide/svelte/icons/app-window";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import MonitorDownIcon from "@lucide/svelte/icons/monitor-down";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { m } from "#lib/i18n/index.js";
	import {
		INSTALLERS,
		type Installer,
		installerUrl,
		matchInstaller,
	} from "./desktop-installers.ts";
	import { installPrompt } from "./install-prompt.svelte.ts";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	interface UserAgentData {
		platform: string;
		getHighEntropyValues: (
			hints: string[],
		) => Promise<{ architecture?: string }>;
	}

	let chosen = $state<"choose" | "desktop">("choose");
	// Already running as the installed web app: only the desktop app is left.
	let standalone = $state(false);
	// No offer to make (Safari, Firefox, or Chromium holding it back): say how.
	let webHelp = $state<string | null>(null);
	let match = $state<Installer | null>(null);
	const others = $derived(
		INSTALLERS.filter((installer) => installer.file !== match?.file),
	);

	async function detect() {
		const agent = (navigator as Navigator & { userAgentData?: UserAgentData })
			.userAgentData;
		const architecture = await agent
			?.getHighEntropyValues(["architecture"])
			.then((values) => values.architecture)
			.catch(() => undefined);
		match = matchInstaller({
			platform: agent?.platform ?? navigator.platform,
			userAgent: navigator.userAgent,
			architecture,
			touchPoints: navigator.maxTouchPoints,
		});
	}

	$effect(() => {
		if (open) {
			standalone = matchMedia("(display-mode: standalone)").matches;
			chosen = standalone ? "desktop" : "choose";
			webHelp = null;
			void detect();
		}
	});

	function installWebApp() {
		if (installPrompt.available) {
			installPrompt.show();
			open = false;
			return;
		}
		const safari = /^((?!chrome|chromium|edg|firefox).)*safari/i.test(
			navigator.userAgent,
		);
		webHelp = safari
			? m.shell_install_web_safari()
			: m.shell_install_web_manual();
	}
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    {#if chosen === "choose"}
      <Dialog.Header>
        <Dialog.Title>{m.shell_install_title()}</Dialog.Title>
        <Dialog.Description>{m.shell_install_description()}</Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onclick={installWebApp}
          class="flex flex-col items-start gap-2 rounded-lg p-4 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AppWindowIcon class="size-5 text-primary" />
          <span class="font-medium">{m.shell_install_web_title()}</span>
          <span class="text-muted-foreground" aria-live="polite"
            >{webHelp ?? m.shell_install_web_description()}</span
          >
        </button>
        <button
          type="button"
          onclick={() => (chosen = "desktop")}
          class="flex flex-col items-start gap-2 rounded-lg p-4 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MonitorDownIcon class="size-5 text-primary" />
          <span class="font-medium">{m.shell_install_desktop_title()}</span>
          <span class="text-muted-foreground"
            >{m.shell_install_desktop_description()}</span
          >
        </button>
      </div>
    {:else}
      <Dialog.Header>
        <Dialog.Title>{m.shell_install_desktop_title()}</Dialog.Title>
        <Dialog.Description>{m.shell_install_desktop_description()}</Dialog.Description>
      </Dialog.Header>
      {#if match}
        <Button href={installerUrl(match)} size="lg" class="w-full">
          <DownloadIcon />{m.shell_install_download_for({ platform: match.label })}
        </Button>
      {/if}
      <div class="flex flex-col gap-1">
        <p class="text-xs font-medium text-muted-foreground">
          {match ? m.shell_install_other_platforms() : m.shell_install_pick_platform()}
        </p>
        <ul class="flex flex-col">
          {#each others as installer (installer.file)}
            <li>
              <a
                href={installerUrl(installer)}
                class="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{installer.label}</span>
                <span class="truncate font-mono text-xs text-muted-foreground"
                  >{installer.file}</span
                >
              </a>
            </li>
          {/each}
        </ul>
      </div>
      {#if !standalone}
        <Dialog.Footer>
          <Button variant="ghost" onclick={() => (chosen = "choose")}>
            <ChevronLeftIcon />{m.common_back()}
          </Button>
        </Dialog.Footer>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
