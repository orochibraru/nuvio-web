<script lang="ts">
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import CaptionsOffIcon from "@lucide/svelte/icons/captions-off";
	import CheckIcon from "@lucide/svelte/icons/check";
	import LoaderIcon from "@lucide/svelte/icons/loader-circle";
	import SearchIcon from "@lucide/svelte/icons/search";
	import { Command, Popover } from "bits-ui";
	import { Button } from "#lib/components/ui/button/index.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { groupSubtitles } from "#lib/player/subtitle-groups.js";
	import type {
		SubtitleAppearance,
		SubtitleOption,
	} from "#lib/player/types.js";
	import {
		SUBTITLE_COLORS,
		SUBTITLE_SIZES,
		type SubtitleSize,
	} from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";
	import Hint from "./hint.svelte";

	const sizeLabels: Record<SubtitleSize, () => string> = {
		small: m.subtitle_size_small,
		medium: m.subtitle_size_medium,
		large: m.subtitle_size_large,
	};
	const swatches = SUBTITLE_COLORS;
	const OFF = "off";

	let {
		open,
		options,
		activeCaption,
		pendingCaption,
		failed,
		preferredLanguage = "",
		subtitleSize,
		subtitleColor,
		subtitleBackground,
		subtitleOffset,
		onOpenChange,
		onSelect,
		onAppearance,
		onNudgeOffset,
	}: {
		open: boolean;
		options: SubtitleOption[];
		activeCaption: string | null;
		pendingCaption: string | null;
		failed: Record<string, true>;
		/** The viewer's subtitle language : its tracks are listed first. */
		preferredLanguage?: string;
		subtitleSize: SubtitleSize;
		subtitleColor: string;
		subtitleBackground: boolean;
		subtitleOffset: number;
		onOpenChange: (open: boolean) => void;
		onSelect: (key: string | null) => void;
		onAppearance: (patch: SubtitleAppearance) => void;
		onNudgeOffset: (delta: number) => void;
	} = $props();

	const groups = $derived(
		groupSubtitles(options, preferredLanguage, getLocale()),
	);
	let view = $state<"tracks" | "style">("tracks");
	let search = $state("");
	// The highlighted row : the active track when the panel opens.
	let highlighted = $state(OFF);

	$effect(() => {
		if (open) {
			view = "tracks";
			search = "";
			highlighted = activeCaption ?? OFF;
		}
	});

	// Focus the search box with a mouse or keyboard; on a touch screen that
	// would throw the keyboard up over the list before anyone asked to type.
	let searchInput = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (searchInput && window.matchMedia("(pointer: fine)").matches) {
			searchInput.focus();
		}
	});

	function choose(key: string | null) {
		onSelect(key);
		onOpenChange(false);
	}

	// Portalled to `<body>`, the menu would fall out of the top layer while the
	// player's own div is fullscreen and never paint : portal into whatever is
	// fullscreen instead (see `hint.svelte`).
	const target = $derived.by<HTMLElement | string>(() => {
		if (!open) {
			return "body";
		}
		const fullscreen = document.fullscreenElement;
		return fullscreen instanceof HTMLElement &&
			fullscreen !== document.documentElement
			? fullscreen
			: "body";
	});
</script>

<!-- The subtitles button and its menu : opens off the control bar like the
     audio / speed menus, in the same glass, with the track list and the
     appearance settings behind two tabs. -->
<Popover.Root {open} {onOpenChange}>
  <Hint
    label={activeCaption
      ? m.player_subtitles_on_hint({ caption: activeCaption })
      : m.player_subtitles_off_hint()}
  >
    {#snippet child({ props: hintProps })}
      <Popover.Trigger {...hintProps}>
        {#snippet child({ props })}
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.player_subtitles()}
            class={cn(
              "rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5",
              activeCaption && "text-primary",
            )}
            {...props}
          >
            {#if activeCaption}
              <CaptionsIcon />
            {:else}
              <CaptionsOffIcon />
            {/if}
          </Button>
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Hint>
  <Popover.Portal to={target}>
    <Popover.Content
      align="end"
      side="top"
      sideOffset={52}
      collisionPadding={12}
      class="dark z-50 flex max-h-[min(32rem,var(--bits-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-3 rounded-2xl bg-transparent bg-linear-to-b from-white/12 to-black/55 p-2.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
    >
        <div class="flex shrink-0 items-center gap-2">
          <span
            class="flex flex-1 items-center gap-1.5 pl-1 text-xs font-semibold tracking-[0.2em] text-white/60 uppercase"
          >
            <CaptionsIcon class="size-3.5" />
            <span class="max-sm:sr-only">{m.player_subtitles()}</span>
          </span>
          <div
            role="group"
            aria-label={m.player_subtitles()}
            class="flex rounded-full bg-white/10 p-0.5 text-xs font-medium"
          >
            {#each [{ value: "tracks", label: m.player_subtitle_tracks() }, { value: "style", label: m.player_appearance() }] as const as tab (tab.value)}
              <button
                type="button"
                aria-pressed={view === tab.value}
                onclick={() => (view = tab.value)}
                class={cn(
                  "rounded-full px-3 py-1.5 transition",
                  view === tab.value
                    ? "bg-white text-black"
                    : "text-white/70 hover:text-white",
                )}
              >
                {tab.label}
              </button>
            {/each}
          </div>
        </div>

        {#if view === "tracks"}
          <Command.Root
            label={m.player_subtitles()}
            bind:value={highlighted}
            loop
            class="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div
              class="flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 focus-within:ring-2 focus-within:ring-white/40"
            >
              <SearchIcon class="size-4 shrink-0 text-white/50" />
              <Command.Input
                bind:value={search}
                placeholder={m.player_subtitles_search()}
                bind:ref={searchInput}
                class="h-11 w-full min-w-0 border-0 bg-transparent p-0 text-sm text-white shadow-none outline-none placeholder:text-white/40 focus:ring-0"
              />
            </div>

            {#if activeCaption}
              <div
                class="flex shrink-0 items-center justify-between gap-2 rounded-2xl bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60"
              >
                <span>{m.player_timing()}</span>
                <div class="flex items-center gap-2">
                  <Hint label={m.player_subtitles_earlier()}>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="secondary"
                        size="icon-sm"
                        aria-label={m.player_subtitles_earlier()}
                        onclick={() => onNudgeOffset(-0.5)}
                      >
                        −
                      </Button>
                    {/snippet}
                  </Hint>
                  <span class="w-12 text-center tabular-nums text-white">
                    {subtitleOffset > 0 ? "+" : ""}{subtitleOffset.toFixed(1)}s
                  </span>
                  <Hint label={m.player_subtitles_later()}>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="secondary"
                        size="icon-sm"
                        aria-label={m.player_subtitles_later()}
                        onclick={() => onNudgeOffset(0.5)}
                      >
                        +
                      </Button>
                    {/snippet}
                  </Hint>
                </div>
              </div>
            {/if}

            <Command.List
              class="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
            >
              <Command.Viewport>
                <Command.Empty class="px-3 py-8 text-center text-sm text-white/50">
                  {m.player_subtitles_empty()}
                </Command.Empty>

                <Command.Item
                  value={OFF}
                  keywords={[m.player_off()]}
                  onSelect={() => choose(null)}
                  class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm data-selected:bg-white/10"
                >
                  <span class="flex-1">{m.player_off()}</span>
                  {#if !activeCaption}
                    <CheckIcon class="size-4 shrink-0 text-primary" />
                    <span class="sr-only">{m.player_subtitle_current()}</span>
                  {/if}
                </Command.Item>

                {#each groups as group (group.name)}
                  <Command.Group value={group.name} class="mt-2">
                    <Command.GroupHeading
                      class="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-black/50 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white/50 uppercase backdrop-blur"
                    >
                      {group.name}
                      <span class="tabular-nums">{group.options.length}</span>
                    </Command.GroupHeading>
                    <Command.GroupItems>
                      {#each group.options as option, index (option.key)}
                        {@const active = activeCaption === option.key}
                        <Command.Item
                          value={option.key}
                          keywords={[
                            group.name,
                            option.lang,
                            option.addonName ?? "",
                            option.sdh ? "SDH" : "",
                          ]}
                          onSelect={() => choose(option.key)}
                          class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 text-sm data-selected:bg-white/10"
                        >
                          <span class="flex min-w-0 flex-1 flex-col">
                            <span class="flex items-center gap-1.5">
                              <span class="truncate">
                                {option.addonName ??
                                  m.player_subtitle_track({ number: index + 1 })}
                              </span>
                              {#if option.sdh}
                                <span
                                  class="rounded bg-white/10 px-1 text-[10px] font-medium tracking-wide"
                                  >SDH</span
                                >
                              {/if}
                              {#if failed[option.key]}
                                <span
                                  class="rounded bg-destructive/20 px-1 text-[10px] font-medium tracking-wide text-destructive"
                                >
                                  {m.player_subtitle_unavailable()}
                                </span>
                              {/if}
                              {#if pendingCaption === option.key}
                                <LoaderIcon
                                  class="size-3 animate-spin text-white/60"
                                />
                              {/if}
                            </span>
                            {#if option.addonName && group.options.length > 1}
                              <span class="text-xs text-white/40">
                                {m.player_subtitle_track({ number: index + 1 })}
                              </span>
                            {/if}
                          </span>
                          {#if active}
                            <CheckIcon class="size-4 shrink-0 text-primary" />
                            <span class="sr-only">{m.player_subtitle_current()}</span>
                          {/if}
                        </Command.Item>
                      {/each}
                    </Command.GroupItems>
                  </Command.Group>
                {/each}
              </Command.Viewport>
            </Command.List>
          </Command.Root>
        {:else}
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-1">
            <div class="flex gap-1.5">
              {#each SUBTITLE_SIZES as size (size)}
                <Button
                  variant={subtitleSize === size ? "default" : "secondary"}
                  size="sm"
                  aria-pressed={subtitleSize === size}
                  onclick={() => onAppearance({ subtitleSize: size })}
                  class="h-10 flex-1 rounded-full"
                >
                  {sizeLabels[size]()}
                </Button>
              {/each}
            </div>
            <div class="flex flex-wrap items-center gap-3">
              {#each swatches as swatch (swatch)}
                <Hint label={m.subtitle_colour({ color: swatch })}>
                  {#snippet child({ props })}
                    <button
                      {...props}
                      type="button"
                      aria-label={m.subtitle_colour({ color: swatch })}
                      aria-pressed={subtitleColor === swatch}
                      onclick={() => onAppearance({ subtitleColor: swatch })}
                      class={cn(
                        "size-9 rounded-full ring-2 ring-offset-2 ring-offset-black transition",
                        subtitleColor === swatch
                          ? "ring-white"
                          : "ring-transparent",
                      )}
                      style={`background-color: ${swatch}`}
                    ></button>
                  {/snippet}
                </Hint>
              {/each}
            </div>
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={subtitleBackground}
              onclick={() =>
                onAppearance({ subtitleBackground: !subtitleBackground })}
              class="h-11 w-full justify-between rounded-2xl"
            >
              {m.player_background_plate()}
              <span
                class={cn(
                  "rounded-full px-2 py-0.5 text-[10px]",
                  subtitleBackground
                    ? "bg-primary/20 text-primary"
                    : "bg-white/10 text-white/60",
                )}
              >
                {subtitleBackground ? m.player_on() : m.player_off()}
              </span>
            </Button>
          </div>
        {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
