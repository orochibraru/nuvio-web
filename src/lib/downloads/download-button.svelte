<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import LoaderIcon from "@lucide/svelte/icons/loader-circle";
	import { toast } from "svelte-sonner";
	import { m } from "#lib/i18n/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { getSubtitles } from "#lib/watch/watch.remote.js";
	import { resolve } from "$app/paths";
	import { downloads } from "./manager.svelte.ts";
	import { chooseSubtitles } from "./subtitles.ts";

	/**
	 * Saves one source for offline viewing. Sits beside a row in the sources
	 * drawer; once the video has a download (one per video), it links to the
	 * Downloads page instead.
	 */
	let {
		context,
		url,
		label,
		addonName,
	}: {
		context: {
			metaType: "movie" | "series";
			contentId: string;
			videoId: string;
			season: number | null;
			episode: number | null;
			heading: string;
			subheading: string | null;
			poster: string | null;
			background: string | null;
		};
		url: string;
		label: string;
		addonName: string;
	} = $props();

	const existing = $derived(downloads.find(context.videoId));
	let busy = $state(false);

	async function start() {
		busy = true;
		try {
			const options = await getSubtitles({
				type: context.metaType,
				id: context.videoId,
			}).catch(() => []);
			await downloads.add({
				type: context.metaType,
				contentId: context.contentId,
				videoId: context.videoId,
				season: context.season,
				episode: context.episode,
				title: context.heading,
				subtitle: context.subheading,
				poster: context.poster,
				background: context.background,
				sourceUrl: url,
				sourceLabel: label,
				addonName,
				quality: theme.current.preferredQuality,
				subtitleSources: chooseSubtitles(
					options,
					theme.current.subtitleLanguage,
				).map(({ lang, sdh, url: subtitleUrl }) => ({
					lang,
					sdh,
					url: subtitleUrl,
				})),
			});
			toast.success(m.downloads_started(), {
				description: m.downloads_started_description(),
			});
		} finally {
			busy = false;
		}
	}

	const base =
		"flex w-10 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-foreground/10 hover:text-foreground";
</script>

{#if !downloads.supported || !downloads.ready}
  <!-- Nothing to offer before the list is known, or where OPFS is missing. -->
{:else if existing}
  <a
    href={resolve("downloads")}
    class={base}
    aria-label={existing.status === "done"
      ? m.downloads_open_done()
      : m.downloads_open_pending()}
    title={existing.status === "done"
      ? m.media_downloaded()
      : m.downloads_in_downloads()}
  >
    {#if existing.status === "done"}
      <CheckIcon class="size-4 text-primary" />
    {:else if existing.status === "downloading" || existing.status === "queued"}
      <LoaderIcon class="size-4 animate-spin motion-reduce:animate-none" />
    {:else}
      <DownloadIcon class="size-4" />
    {/if}
  </a>
{:else}
  <button
    type="button"
    class={base}
    disabled={busy}
    onclick={start}
    aria-label={m.downloads_download_label({ label })}
    title={m.downloads_download_offline()}
  >
    {#if busy}
      <LoaderIcon class="size-4 animate-spin motion-reduce:animate-none" />
    {:else}
      <DownloadIcon class="size-4" />
    {/if}
  </button>
{/if}
