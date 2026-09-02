<script lang="ts">
  import { theme } from "#lib/settings/theme.svelte.js";
  import { subtitleFontSize } from "#lib/settings/ui-settings.js";
  import { cn } from "#lib/utils.js";
  import { handlePlayerKey } from "#lib/watch/player-keymap.js";
  import { createRemotePlayback } from "#lib/watch/remote-playback.svelte.js";
  import { createInfoOverlayController } from "./info-overlay-controller.svelte.js";
  import { createPanelToggles } from "./panel-toggles.svelte.js";
  import { createPlaybackDiagnostics } from "./playback-diagnostics.svelte.js";
  import { createPlaybackMilestones } from "./playback-milestones.svelte.js";
  import { createPlayerBroadcastSync } from "./player-broadcast.svelte.js";
  import { createPlayerController } from "./player-controller.svelte.js";
  import PlayerOverlays from "./player-overlays.svelte";
  import { createSubtitleController } from "./subtitle-controller.svelte.js";
  import SubtitlePanel from "./subtitle-panel.svelte";
  import TransportControls from "./transport-controls.svelte";
  import type { VideoPlayerProps } from "./types.js";

  let {
    src,
    poster = null,
    posterImage = null,
    logo = null,
    title,
    subheading = null,
    startTime = 0,
    subtitles = [],
    fill = false,
    certification = null,
    genres = [],
    info = null,
    detailHref = "",
    subtitleSize = "medium",
    subtitleColor = "#ffffff",
    subtitleBackground = true,
    preferredLanguage = "",
    audioRisky = false,
    videoRisky = false,
    externalUrl = null,
    introStart = null,
    introEnd = null,
    outroStart = null,
    minimized = false,
    onProgress,
    onEnded,
    onOutro,
    onBack,
    onSources,
    onSubtitleAppearance,
    onEpisodes,
    onNext,
  }: VideoPlayerProps = $props();

  let container = $state<HTMLDivElement | null>(null);
  let video = $state<HTMLVideoElement | null>(null);

  let fatalError = $state<string | null>(null);

  const player = createPlayerController({
    container: () => container,
    video: () => video,
    src: () => src,
    startTime: () => startTime,
    panelOpen: () => panels.panelOpen,
    onFatal: (message) => {
      fatalError = message;
    },
    onEnded: () => onEnded?.(),
  });
  // `player.state` is the shared reactive transport object : read/write it
  // directly (it's what `<video bind:paused>` etc. below are bound to).
  const transport = player.state;

  // Multi-tab coherence: starting playback here pauses this video in every
  // other open tab.
  createPlayerBroadcastSync({
    video: () => video,
    paused: () => transport.paused,
  });

  const infoOverlay = createInfoOverlayController({
    hasInfo: () => Boolean(info),
    minimized: () => minimized,
    fatalError: () => Boolean(fatalError),
    ended: () => transport.ended,
    loading: () => transport.loading,
    paused: () => transport.paused,
    currentTime: () => transport.currentTime,
    onOpen: () => {
      transport.controlsVisible = true;
    },
  });

  // The info / subtitles / settings side panels : mutually exclusive, and any
  // one open keeps the transport controls (and the Back button) up.
  const panels = createPanelToggles({ infoOverlay });

  const milestones = createPlaybackMilestones({
    transport,
    video: () => video,
    minimized: () => minimized,
    fatalError: () => Boolean(fatalError),
    introStart: () => introStart,
    introEnd: () => introEnd,
    outroStart: () => outroStart,
    onOutro: () => onOutro?.(),
  });

  // New source: clear everything scoped to the previous stream.
  function resetForNewSource() {
    fatalError = null;
    milestones.reset();
    infoOverlay.reset();
    player.reset();
    captions.reset();
    progress.reset();
  }

  const { media, progress, silentAudio, videoDecode } =
    createPlaybackDiagnostics({
      src: () => src,
      video: () => video,
      transport,
      audioRisky: () => audioRisky,
      videoRisky: () => videoRisky,
      fatalError: () => fatalError,
      onLoad: resetForNewSource,
      onFatal: (message) => {
        fatalError = message;
      },
      onProgress: (position, total) => onProgress?.(position, total),
    });

  // Subtitle files are fetched + converted to WebVTT in the browser, on
  // demand : never proxied through the server.
  const captions = createSubtitleController({
    tracks: () => subtitles,
    video: () => video,
    preferredLanguage: () => preferredLanguage,
  });

  // Cast to a TV via whichever API the browser has (Remote Playback /
  // AirPlay). The button hides itself when there's no device to cast to.
  const remotePlayback = createRemotePlayback({ video: () => video });

  const bufferedEnd = $derived(transport.buffered.at(-1)?.end ?? 0);
  const progressRatio = $derived(
    transport.duration ? transport.currentTime / transport.duration : 0,
  );
  const bufferedRatio = $derived(
    transport.duration ? bufferedEnd / transport.duration : 0,
  );

  const cueFontSize = $derived(subtitleFontSize(subtitleSize));
  const cueBackground = $derived(
    subtitleBackground ? "rgba(0,0,0,0.75)" : "transparent",
  );

  function onReady() {
    transport.loading = false;
    transport.ended = false;
    captions.trySelectPreferred();
  }

  function onKeydown(event: KeyboardEvent) {
    const handled = handlePlayerKey(event, {
      togglePlay: player.togglePlay,
      seek: player.seek,
      adjustVolume: player.adjustVolume,
      toggleFullscreen: () => void player.toggleFullscreen(),
      toggleMute: () => (transport.muted = !transport.muted),
      cycleCaption: captions.cycleCaption,
      toggleInfo: () => {
        if (info) {
          panels.toggleInfo();
        }
      },
      next: () => onNext?.(),
      episodes: () => onEpisodes?.(),
      closeMenus: panels.closeMenus,
    });
    if (handled) {
      player.nudgeControls();
    }
  }
</script>

<svelte:document
  onfullscreenchange={() =>
    (transport.fullscreen = Boolean(document.fullscreenElement))}
/>
<svelte:window onkeydown={onKeydown} />

<div
  bind:this={container}
  role="region"
  aria-label="Video player"
  data-accent={theme.current.accent}
  data-amoled={theme.current.darkStyle === "amoled"}
  class={cn(
    "nuvio-player dark group/player overflow-hidden bg-black text-foreground select-none transition-all duration-500 ease-out",
    minimized
      ? "fixed top-4 left-4 z-50 aspect-video w-52 rounded-xl shadow-2xl ring-1 ring-white/15 sm:w-64"
      : fill
        ? "relative h-full w-full"
        : "relative aspect-video w-full rounded-lg",
  )}
  class:cursor-none={!transport.controlsVisible && !minimized}
  style:--cue-size={cueFontSize}
  style:--cue-color={subtitleColor}
  style:--cue-bg={cueBackground}
  onmousemove={player.nudgeControls}
  onmouseleave={() =>
    !transport.paused &&
    !panels.panelOpen &&
    (transport.controlsVisible = false)}
>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={video}
    bind:paused={transport.paused}
    bind:currentTime={transport.currentTime}
    bind:duration={transport.duration}
    bind:volume={transport.volume}
    bind:muted={transport.muted}
    bind:buffered={transport.buffered}
    autoplay
    class="size-full object-contain"
    playsinline
    onloadedmetadata={player.onLoadedMetadata}
    onloadeddata={onReady}
    oncanplay={onReady}
    onplaying={onReady}
    onwaiting={player.onWaiting}
    onerror={player.onMediaError}
    onpause={progress.flush}
    onclick={player.togglePlay}
    onended={player.onEndedInternal}
  >
    {#each captions.options as track (track.key)}
      {#if captions.ready[track.key]}
        <track
          kind="subtitles"
          srclang={track.lang}
          label={track.key}
          src={captions.ready[track.key]}
        />
      {/if}
    {/each}
  </video>

  <PlayerOverlays
    {poster}
    {posterImage}
    {logo}
    {title}
    {subheading}
    {certification}
    {genres}
    {info}
    {detailHref}
    {minimized}
    loading={transport.loading}
    {fatalError}
    silentAudioIssue={silentAudio.issue}
    videoDecodeIssue={videoDecode.issue}
    {externalUrl}
    {onSources}
    {onBack}
    onDismissSilentAudio={() => silentAudio.dismiss()}
    onDismissVideoDecode={() => videoDecode.dismiss()}
    showSkipIntro={milestones.showSkipIntro}
    onSkipIntro={milestones.skipIntro}
    infoOpen={infoOverlay.open}
    infoAutoOpened={infoOverlay.autoOpened}
    onResumeInfo={() => {
      infoOverlay.close();
      void video?.play();
    }}
    onCloseInfo={infoOverlay.close}
  />

  <TransportControls
    {transport}
    {player}
    {media}
    {minimized}
    fatalError={Boolean(fatalError)}
    infoOpen={infoOverlay.open}
    subtitlesOpen={panels.subtitlesOpen}
    settingsOpen={panels.settingsOpen}
    {title}
    {subheading}
    hasInfo={Boolean(info)}
    onToggleInfo={panels.toggleInfo}
    {onBack}
    {onSources}
    {bufferedRatio}
    {progressRatio}
    {onNext}
    {onEpisodes}
    hasSubtitles={captions.options.length > 0}
    activeCaption={captions.activeCaption}
    castAvailable={remotePlayback.available}
    casting={remotePlayback.connected}
    onCast={remotePlayback.prompt}
    onToggleSubtitles={panels.toggleSubtitles}
    onSettingsOpenChange={panels.setSettingsOpen}
  />

  <SubtitlePanel
    open={panels.subtitlesOpen}
    options={captions.options}
    activeCaption={captions.activeCaption}
    pendingCaption={captions.pendingCaption}
    failed={captions.failed}
    {subtitleSize}
    {subtitleColor}
    {subtitleBackground}
    subtitleOffset={captions.subtitleOffset}
    onClose={() => (panels.subtitlesOpen = false)}
    onSelect={captions.setCaption}
    onAppearance={(patch) => onSubtitleAppearance?.(patch)}
    onNudgeOffset={captions.nudgeSubtitleOffset}
  />
</div>

<style>
  /* `::cue` only honours a small set of properties; size / colour / plate are it. */
  :global(.nuvio-player video::cue) {
    font-size: var(--cue-size);
    color: var(--cue-color);
    background-color: var(--cue-bg);
    line-height: 1.3;
  }
</style>
