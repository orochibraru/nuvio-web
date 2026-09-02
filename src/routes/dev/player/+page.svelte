<script lang="ts">
  import { onMount } from "svelte";
  import VideoPlayer from "#lib/components/video-player/video-player.svelte";
  import PlayerEndPanel from "#lib/watch/player-end-panel.svelte";
  import { page } from "$app/state";

  const src = $derived(page.url.searchParams.get("src") ?? "/e2e/sample.webm");

  // `?endofshow=1` renders the end-of-show takeover panel over a minimized
  // player, with canned suggestions.
  const endOfShow = $derived(Boolean(page.url.searchParams.get("endofshow")));
  const fakeSuggestions = Array.from({ length: 8 }, (_, i) => ({
    id: `tt${i}`,
    type: "movie",
    name: `Suggested Title ${i + 1}`,
    poster: null,
  }));

  // `?breakvideo=1` freezes the decoded-frame counter so the video-decode
  // watchdog trips even though the sample clip actually plays fine : the only
  // way to exercise the "audio plays, picture doesn't" path in a test.
  onMount(() => {
    if (!page.url.searchParams.get("breakvideo")) {
      return;
    }
    const video = document.querySelector("video");
    if (video) {
      video.getVideoPlaybackQuality = () =>
        ({
          totalVideoFrames: 0,
          droppedVideoFrames: 0,
        }) as VideoPlaybackQuality;
      Object.defineProperty(video, "videoWidth", { get: () => 0 });
    }
  });
  const start = $derived(Number(page.url.searchParams.get("start") ?? "0"));
  // `?external=<url>` surfaces the fatal screen's external-player handoff.
  const externalUrl = $derived(page.url.searchParams.get("external"));
  // `breakvideo` also flags the codec as risky so the watchdog's short fuse
  // fires within the sample clip's runtime.
  const videoRisky = $derived(Boolean(page.url.searchParams.get("breakvideo")));
  // `?subs=<url>` adds one subtitle track (fetched + converted client-side).
  const subtitles = $derived(
    page.url.searchParams.get("subs")
      ? [
          {
            id: "harness",
            lang: "en",
            url: page.url.searchParams.get("subs") as string,
            addonName: "Harness",
            sdh: false,
          },
        ]
      : [],
  );
  const numParam = (name: string) => {
    const raw = page.url.searchParams.get(name);
    return raw === null ? null : Number(raw);
  };
  const introStart = $derived(numParam("introStart"));
  const introEnd = $derived(numParam("introEnd"));
  const outroStart = $derived(numParam("outroStart"));

  // `?info=1` mounts the in-player info overlay with canned meta.
  const info = $derived(
    page.url.searchParams.get("info")
      ? {
          description:
            "A dev-harness synopsis: enough words to fill a couple of lines so the overlay layout can be eyeballed without a real addon.",
          imdbRating: "8.4",
          releaseInfo: "2021",
          runtime: "2h 15min",
          status: null,
          country: "United States",
          awards: "3 wins",
          cast: ["Ada Lovelace", "Alan Turing", "Grace Hopper"],
          director: ["Dev Harness"],
          writer: ["Dev Harness"],
          episodeTitle: null,
          episodeOverview: null,
        }
      : null,
  );

  let lastProgress = $state<{ position: number; duration: number } | null>(
    null,
  );
  let ended = $state(false);
  let outro = $state(false);
  let minimized = $state(false);
</script>

<div
  class={endOfShow
    ? "fixed inset-0 bg-black text-white"
    : "mx-auto max-w-4xl p-6"}
>
  {#if endOfShow}
    <PlayerEndPanel
      heading="The Dev Harness Movie"
      detailHref="/detail/movie/tt0111161"
      suggestions={fakeSuggestions}
      onBack={() => history.back()}
      onWatchAgain={() => (minimized = false)}
    />
  {/if}
  <VideoPlayer
    {src}
    title="Player harness"
    subheading="dev only"
    startTime={start}
    {externalUrl}
    {videoRisky}
    {subtitles}
    {introStart}
    {introEnd}
    {outroStart}
    minimized={minimized || endOfShow}
    {info}
    detailHref="/detail/movie/tt0111161"
    onProgress={(position, duration) => (lastProgress = { position, duration })}
    onEnded={() => (ended = true)}
    onOutro={() => {
      outro = true;
      minimized = true;
    }}
  />
  <p data-testid="last-progress">
    {lastProgress ? `${lastProgress.position}/${lastProgress.duration}` : ""}
  </p>
  <p data-testid="ended">{ended ? "ended" : ""}</p>
  <p data-testid="outro">{outro ? "outro" : ""}</p>
</div>
