<script lang="ts">
  import CaptionsIcon from "@lucide/svelte/icons/captions";
  import CheckIcon from "@lucide/svelte/icons/check";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import XIcon from "@lucide/svelte/icons/x";
  import { fade, fly } from "svelte/transition";
  import { Button } from "#lib/components/ui/button/index.js";
  import { reduced } from "#lib/motion.js";
  import {
    SUBTITLE_COLORS,
    SUBTITLE_SIZES,
    type SubtitleSize,
  } from "#lib/settings/ui-settings.js";
  import { cn } from "#lib/utils.js";
  import type { SubtitleAppearance, SubtitleOption } from "./types.js";

  const sizeLabels: Record<SubtitleSize, string> = {
    small: "Small",
    medium: "Medium",
    large: "Large",
  };
  const swatches = SUBTITLE_COLORS;

  let {
    open,
    options,
    activeCaption,
    pendingCaption,
    failed,
    subtitleSize,
    subtitleColor,
    subtitleBackground,
    subtitleOffset,
    onClose,
    onSelect,
    onAppearance,
    onNudgeOffset,
  }: {
    open: boolean;
    options: SubtitleOption[];
    activeCaption: string | null;
    pendingCaption: string | null;
    failed: Record<string, true>;
    subtitleSize: SubtitleSize;
    subtitleColor: string;
    subtitleBackground: boolean;
    subtitleOffset: number;
    onClose: () => void;
    onSelect: (key: string | null) => void;
    onAppearance: (patch: SubtitleAppearance) => void;
    onNudgeOffset: (delta: number) => void;
  } = $props();
</script>

<!-- Dims the whole player and lays the picker over it on the left, mirroring
     the info overlay's own treatment. Sits above the transport controls
     (z-30) : it used to sit below them at z-20, which let the always-mounted
     transport bar's pointer-events-auto strips swallow clicks meant for the
     picker's own buttons wherever the two visually overlapped. -->
{#if open}
  <div
    class="absolute inset-0 z-50 overflow-hidden"
    transition:fade={reduced({ duration: 150 })}
  >
    <div class="absolute inset-0 bg-black/85"></div>
    <div
      class="absolute inset-x-0 top-16 z-50 bottom-20 flex items-center justify-start px-6 pb-6 sm:top-20 sm:bottom-24 sm:px-12"
      transition:fly={reduced({ y: 16, duration: 220 })}
    >
      <div class="flex max-h-full w-full max-w-sm flex-col gap-4 text-white">
        <div class="flex shrink-0 items-center gap-3">
          <span
            class="flex flex-1 items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase"
          >
            <CaptionsIcon class="size-3.5" />
            Subtitles
          </span>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Close subtitles"
            onclick={onClose}
            class="shrink-0 rounded-full"
          >
            <XIcon class="size-5" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <Button
            variant="ghost"
            size="sm"
            onclick={() => onSelect(null)}
            class={cn(
              "h-auto w-full justify-start gap-2 py-2 text-white hover:bg-white/10 hover:text-white",
              !activeCaption && "text-primary",
            )}
          >
            <CheckIcon
              class={cn("size-4 shrink-0", activeCaption && "invisible")}
            />
            Off
          </Button>
          {#each options as option (option.key)}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => onSelect(option.key)}
              class={cn(
                "h-auto w-full items-start justify-start gap-2 py-2 text-white hover:bg-white/10 hover:text-white",
                activeCaption === option.key && "text-primary",
              )}
            >
              <CheckIcon
                class={cn(
                  "mt-0.5 size-4 shrink-0",
                  activeCaption !== option.key && "invisible",
                )}
              />
              <span class="flex min-w-0 flex-1 flex-col items-start">
                <span class="flex items-center gap-1.5">
                  {option.name}
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
                      unavailable
                    </span>
                  {/if}
                  {#if pendingCaption === option.key}
                    <LoaderIcon class="size-3 animate-spin text-white/60" />
                  {/if}
                </span>
                {#if option.addonName}
                  <span class="block max-w-full truncate text-xs text-white/50"
                    >{option.addonName}</span
                  >
                {/if}
              </span>
            </Button>
          {/each}
        </div>

        <div class="shrink-0 space-y-3 border-t border-white/10 pt-4">
          <p
            class="text-xs font-semibold tracking-wide text-white/50 uppercase"
          >
            Appearance
          </p>
          <div class="flex gap-1.5">
            {#each SUBTITLE_SIZES as size (size)}
              <Button
                variant={subtitleSize === size ? "default" : "secondary"}
                size="sm"
                onclick={() => onAppearance({ subtitleSize: size })}
                class="flex-1"
              >
                {sizeLabels[size]}
              </Button>
            {/each}
          </div>
          <div class="flex items-center gap-2">
            {#each swatches as swatch (swatch)}
              <button
                type="button"
                aria-label={`Subtitle colour ${swatch}`}
                aria-pressed={subtitleColor === swatch}
                onclick={() => onAppearance({ subtitleColor: swatch })}
                class={cn(
                  "size-8 rounded-full ring-2 ring-offset-2 ring-offset-black transition",
                  subtitleColor === swatch ? "ring-white" : "ring-transparent",
                )}
                style={`background-color: ${swatch}`}
              ></button>
            {/each}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onclick={() =>
              onAppearance({ subtitleBackground: !subtitleBackground })}
            class="w-full justify-between"
          >
            Background plate
            <span
              class={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                subtitleBackground
                  ? "bg-primary/20 text-primary"
                  : "bg-white/10 text-white/60",
              )}
            >
              {subtitleBackground ? "On" : "Off"}
            </span>
          </Button>

          {#if activeCaption}
            <div
              class="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/60"
            >
              <span>Timing</span>
              <div class="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon-xs"
                  aria-label="Subtitles earlier"
                  onclick={() => onNudgeOffset(-0.5)}
                >
                  −
                </Button>
                <span class="w-12 text-center tabular-nums text-white">
                  {subtitleOffset > 0 ? "+" : ""}{subtitleOffset.toFixed(1)}s
                </span>
                <Button
                  variant="secondary"
                  size="icon-xs"
                  aria-label="Subtitles later"
                  onclick={() => onNudgeOffset(0.5)}
                >
                  +
                </Button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
