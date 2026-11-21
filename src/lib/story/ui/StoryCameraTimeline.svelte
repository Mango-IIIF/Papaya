<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    ChevronLeft,
    ChevronRight,
    CirclePlay,
    Crosshair,
    Plus,
    Scan,
    SlidersHorizontal,
    Square,
    Trash2,
    Volume2,
    VolumeX,
  } from "@lucide/svelte";
  import { readable, type Readable } from "svelte/store";
  import type { ChapterCameraTrack, StoryState } from "../../core/types/story";
  import {
    animatableCameraDurationMs,
    balanceCameraTrackKeyframes,
  } from "../cameraTrack";
  import { loadAudioSlicePeaks } from "../audioWaveform";
  import ChapterMotionPanel from "./ChapterMotionPanel.svelte";
  import { t } from "../../core/i18n";

  /*
   * The bar under the image: everything that takes the current view, plus
   * synced audio-guide camera timing.
   *
   * When the active chapter carries a narration segment, its decoded audio
   * waveform renders behind the keyframe track, playback runs narration and
   * camera motion together, scrubbing previews interpolated camera positions,
   * dragging keyframe markers aligns shots to spoken cues, and capturing drops
   * new keyframes at the current playhead timestamp.
   */

  export let story: Readable<StoryState>;
  export let selectedChapterId: Readable<string | null>;
  export let selectedPointId: Readable<string | null> = readable(null);
  export let motionPreviewing: Readable<boolean> = readable(false);
  export let language = "en";
  /** Whether this chapter has a frame to set (not audio, video or 3D). */
  export let canSetFrame = true;
  export let onSetFrameFromView: () => void = () => {};
  export let onAddPoint: (atTimeMs?: number) => void;
  export let onDeletePoint: (keyframeId: string) => void = () => {};
  export let onGoToPoint: (keyframeId: string) => void;
  export let onSelectPoint: (keyframeId: string | null) => void = () => {};
  export let onUpdatePointFromView: (keyframeId: string) => void = () => {};
  export let onMovePointTime:
    | ((keyframeId: string, timeMs: number) => void)
    | undefined = undefined;
  export let onReorderPoint:
    | ((keyframeId: string, direction: -1 | 1) => void)
    | undefined = undefined;
  export let onEvenSpace: (() => void) | undefined = undefined;
  export let onScrubTo: ((timeMs: number) => void) | undefined = undefined;
  export let onPreviewMotion: (options?: {
    startMs?: number;
    withAudio?: boolean;
  }) => void = () => {};
  export let onStopMotionPreview: () => void = () => {};
  export let onUpdateDuration: (durationMs: number) => void = () => {};
  export let onUpdatePathType: (pathType: "linear" | "spline") => void = () => {};
  export let onUpdateDwell: (dwellMs: number) => void = () => {};
  export let onUpdateEasing: (
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out",
  ) => void = () => {};
  export let onApplyPreset: (
    preset: NonNullable<ChapterCameraTrack["preset"]>,
  ) => void = () => {};

  let optionsOpen = false;
  let audioMuted = false;
  let trackEl: HTMLDivElement | null = null;
  let waveformPeaks: number[] = [];
  let lastWaveformKey = "";
  let waveformRequest = 0;

  $: chapter =
    $story.chapters.find((entry) => entry.id === $selectedChapterId) ?? null;
  $: track = chapter?.cameraTrack;
  $: points = track ? balanceCameraTrackKeyframes(track) : [];
  $: hasMotion = points.length >= 2;
  $: durationMs = track && hasMotion ? Math.max(1, animatableCameraDurationMs(track)) : 0;
  $: selectedIndex = points.findIndex((point) => point.id === $selectedPointId);
  $: selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null;

  /* Narration for this chapter, so the waveform, length, and audio playback
     stay in step with camera keyframes. */
  $: narrationEntry = (() => {
    const map = chapter?.narrationSegment ?? {};
    const preferred = map[language];
    if (preferred && preferred.end > preferred.start) {
      return { lang: language, segment: preferred };
    }
    const fallback = Object.entries(map).find(([, seg]) => seg && seg.end > seg.start);
    return fallback ? { lang: fallback[0], segment: fallback[1] } : null;
  })();
  $: narrationSegment = narrationEntry?.segment ?? null;
  $: narrationSrc = narrationEntry
    ? ($story.narration?.tracks?.[narrationEntry.lang]?.src ?? "")
    : "";
  $: narrationMs =
    narrationSegment && narrationSegment.end > narrationSegment.start
      ? Math.round((narrationSegment.end - narrationSegment.start) * 1000)
      : 0;
  $: holdMs =
    track && hasMotion && track.timingMode !== "custom"
      ? Math.max(0, durationMs - track.durationMs)
      : 0;
  $: canMatchNarration =
    hasMotion &&
    narrationMs > holdMs &&
    Math.abs(narrationMs - durationMs) > 100;
  $: timelineSpanMs = durationMs || narrationMs || (track?.durationMs ?? 5000);

  /* A preset is shaped from the chapter frame alone, so the options open as
     soon as there is a frame; keyframes are not a precondition. */
  $: canOpenOptions = Boolean(chapter?.viewBox) || points.length > 0;
  $: if (!chapter || !canOpenOptions) optionsOpen = false;

  /* Decode the chapter's real narration waveform slice when audio is configured. */
  $: {
    const key =
      narrationSrc && narrationSegment
        ? `${narrationSrc}:${narrationSegment.start}:${narrationSegment.end}`
        : "";
    if (key !== lastWaveformKey) {
      lastWaveformKey = key;
      const req = ++waveformRequest;
      if (!key || !narrationSegment) {
        waveformPeaks = [];
      } else {
        void loadAudioSlicePeaks(
          narrationSrc,
          narrationSegment.start,
          narrationSegment.end,
          84,
        ).then((peaks) => {
          if (req === waveformRequest) waveformPeaks = peaks ?? [];
        });
      }
    }
  }

  const position = (timeMs: number): string =>
    timelineSpanMs > 0
      ? `${Math.max(0, Math.min(100, (timeMs / timelineSpanMs) * 100))}%`
      : "0%";

  const clock = (timeMs: number): string => {
    const total = Math.max(0, timeMs) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    const whole = Math.floor(seconds);
    const tenth = Math.floor((seconds - whole) * 10);
    return `${minutes}:${String(whole).padStart(2, "0")}${tenth ? `.${tenth}` : ""}`;
  };

  /*
   * Playhead state: drives both scrubbed preview and live playback.
   */
  let elapsedMs = 0;
  let scrubbed = false;
  let playheadFrame: number | null = null;
  let playheadStartedAt = 0;
  let playheadOriginMs = 0;
  let lastChapterId: string | null = null;

  $: if ($selectedChapterId !== lastChapterId) {
    lastChapterId = $selectedChapterId;
    elapsedMs = 0;
    scrubbed = false;
  }

  const stopPlayhead = (resetToZero = true) => {
    if (playheadFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(playheadFrame);
    }
    playheadFrame = null;
    if (resetToZero) {
      elapsedMs = 0;
      scrubbed = false;
    }
  };

  const tickPlayhead = (now: number) => {
    elapsedMs = Math.min(durationMs, playheadOriginMs + (now - playheadStartedAt));
    playheadFrame = requestAnimationFrame(tickPlayhead);
  };

  $: if ($motionPreviewing) {
    if (playheadFrame === null && typeof requestAnimationFrame === "function") {
      playheadStartedAt = performance.now();
      playheadOriginMs = elapsedMs >= durationMs ? 0 : elapsedMs;
      playheadFrame = requestAnimationFrame(tickPlayhead);
    }
  } else if (playheadFrame !== null) {
    stopPlayhead(elapsedMs >= durationMs);
  }

  onDestroy(() => stopPlayhead(true));

  const timeMsFromClientX = (clientX: number): number => {
    if (!trackEl || timelineSpanMs <= 0) return 0;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * timelineSpanMs);
  };

  /* Dragging a keyframe marker horizontally updates its timestamp directly. */
  let draggingMarkerId: string | null = null;
  let markerMoved = false;

  const startMarkerDrag = (event: PointerEvent, pointId: string) => {
    if (!onMovePointTime) return;
    event.stopPropagation();
    draggingMarkerId = pointId;
    markerMoved = false;
    onSelectPoint(pointId);
    const startX = event.clientX;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      if (draggingMarkerId !== pointId) return;
      if (Math.abs(moveEvent.clientX - startX) > 3) markerMoved = true;
      if (!markerMoved) return;
      const nextTime = timeMsFromClientX(moveEvent.clientX);
      elapsedMs = nextTime;
      scrubbed = true;
      onMovePointTime?.(pointId, nextTime);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      draggingMarkerId = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /* Clicking or dragging on the track scrubs the playhead and camera preview. */
  const handleTrackPointerDown = (event: PointerEvent) => {
    if (!timelineSpanMs) return;
    if ((event.target as HTMLElement)?.closest(".camera-timeline__marker")) return;
    const applyScrub = (clientX: number) => {
      const nextTime = timeMsFromClientX(clientX);
      elapsedMs = nextTime;
      scrubbed = true;
      if (hasMotion) onScrubTo?.(nextTime);
    };
    applyScrub(event.clientX);

    const onMove = (moveEvent: PointerEvent) => applyScrub(moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const handlePlayToggle = () => {
    if ($motionPreviewing) {
      onStopMotionPreview();
      return;
    }
    const startMs = elapsedMs >= durationMs ? 0 : elapsedMs;
    if (startMs === 0) elapsedMs = 0;
    onPreviewMotion({ startMs, withAudio: !audioMuted });
  };

  const handleCapture = () => {
    if (scrubbed || $motionPreviewing) {
      onAddPoint(elapsedMs);
    } else {
      onAddPoint();
    }
  };

  const choosePoint = (keyframeId: string) => {
    // A second click on the selected keyframe lets go of it, which hands the
    // handles on the image back to the chapter frame.
    if ($selectedPointId === keyframeId) {
      onSelectPoint(null);
    } else {
      const point = points.find((entry) => entry.id === keyframeId);
      if (point) {
        elapsedMs = point.timeMs;
        scrubbed = false;
      }
      onGoToPoint(keyframeId);
    }
  };

  const matchNarration = () => {
    if (canMatchNarration) onUpdateDuration(narrationMs - holdMs);
  };
</script>

<section
  class="camera-timeline"
  aria-label={$t("storyBuilder.cameraTimeline.title")}
  data-testid="camera-timeline"
>
  <div class="camera-timeline__transport">
    <button
      class="camera-timeline__play"
      type="button"
      data-testid="camera-timeline-play"
      disabled={!hasMotion}
      aria-label={$motionPreviewing
        ? $t("storyBuilder.motion.stopPreview")
        : $t("storyBuilder.motion.preview")}
      title={$motionPreviewing
        ? $t("storyBuilder.motion.stopPreview")
        : $t("storyBuilder.motion.preview")}
      on:click={handlePlayToggle}
    >
      {#if $motionPreviewing}<Square aria-hidden="true" />{:else}<CirclePlay
          aria-hidden="true"
        />{/if}
    </button>

    {#if hasMotion || scrubbed}
      <span class="camera-timeline__time" data-testid="camera-timeline-time"
        >{clock(elapsedMs)} / {clock(durationMs || timelineSpanMs)}</span
      >
    {/if}

    <div
      bind:this={trackEl}
      class="camera-timeline__track"
      class:camera-timeline__track--idle={!hasMotion && waveformPeaks.length === 0}
      role="slider"
      tabindex="0"
      aria-label={$t("storyBuilder.cameraTimeline.scrub")}
      aria-valuemin={0}
      aria-valuemax={timelineSpanMs}
      aria-valuenow={elapsedMs}
      data-testid="camera-timeline-track"
      on:pointerdown={handleTrackPointerDown}
    >
      {#if waveformPeaks.length > 0}
        <div
          class="camera-timeline__waveform"
          aria-hidden="true"
          data-testid="camera-timeline-waveform"
        >
          {#each waveformPeaks as peak}
            <span style={`height:${Math.round(peak * 100)}%`}></span>
          {/each}
        </div>
      {/if}
      <div class="camera-timeline__line" aria-hidden="true"></div>
      {#if $motionPreviewing || scrubbed}
        <div
          class="camera-timeline__playhead"
          aria-hidden="true"
          data-testid="camera-timeline-playhead"
          style={`--point-position:${position(elapsedMs)}`}
        ></div>
      {/if}
      {#if hasMotion}
        {#each points as point, index (point.id)}
          <button
            class="camera-timeline__marker"
            class:camera-timeline__marker--selected={$selectedPointId === point.id}
            class:camera-timeline__marker--dragging={draggingMarkerId === point.id}
            type="button"
            data-testid={`camera-timeline-marker-${index + 1}`}
            style={`--point-position:${position(point.timeMs)}`}
            aria-label={$t("storyBuilder.cameraTimeline.goTo", {
              number: index + 1,
              time: clock(point.timeMs),
            })}
            aria-pressed={$selectedPointId === point.id}
            on:pointerdown={(event) => startMarkerDrag(event, point.id)}
            on:click={() => {
              if (!markerMoved) onGoToPoint(point.id);
              markerMoved = false;
            }}
          >
            <span></span>
          </button>
        {/each}
      {/if}
    </div>

    {#if narrationMs > 0}
      {#if narrationSrc}
        <button
          class="camera-timeline__button camera-timeline__button--icon"
          type="button"
          data-testid="camera-timeline-audio-toggle"
          aria-pressed={audioMuted}
          aria-label={audioMuted
            ? $t("storyBuilder.cameraTimeline.unmuteAudio")
            : $t("storyBuilder.cameraTimeline.muteAudio")}
          title={audioMuted
            ? $t("storyBuilder.cameraTimeline.unmuteAudio")
            : $t("storyBuilder.cameraTimeline.muteAudio")}
          on:click={() => (audioMuted = !audioMuted)}
        >
          {#if audioMuted}<VolumeX aria-hidden="true" />{:else}<Volume2 aria-hidden="true" />{/if}
        </button>
      {/if}
      <span
        class="camera-timeline__narration"
        data-testid="camera-timeline-narration"
        title={$t("storyBuilder.cameraTimeline.narrationLength", {
          time: clock(narrationMs),
        })}
      >
        {$t("storyBuilder.cameraTimeline.narrationLength", {
          time: clock(narrationMs),
        })}
      </span>
      {#if canMatchNarration}
        <button
          class="camera-timeline__button"
          type="button"
          data-testid="camera-timeline-match-narration"
          on:click={matchNarration}
        >
          {$t("storyBuilder.cameraTimeline.matchNarration")}
        </button>
      {/if}
    {/if}

    <div class="camera-timeline__options-anchor">
      <button
        class="camera-timeline__button camera-timeline__button--icon"
        type="button"
        data-testid="camera-timeline-options"
        disabled={!canOpenOptions}
        aria-expanded={optionsOpen}
        aria-controls="camera-timeline-options"
        aria-label={$t("storyBuilder.cameraTimeline.options")}
        title={$t("storyBuilder.cameraTimeline.options")}
        on:click={() => (optionsOpen = !optionsOpen)}
      >
        <SlidersHorizontal aria-hidden="true" />
      </button>
      {#if optionsOpen}
        <div
          id="camera-timeline-options"
          class="camera-timeline__options"
          data-testid="camera-timeline-options-panel"
        >
          <ChapterMotionPanel
            {track}
            wide
            {onUpdateDuration}
            {onUpdatePathType}
            {onUpdateDwell}
            {onUpdateEasing}
            {onApplyPreset}
            {onEvenSpace}
          />
        </div>
      {/if}
    </div>

    {#if canSetFrame}
      <button
        type="button"
        class="camera-timeline__button camera-timeline__button--frame"
        data-testid="chapter-position-from-view"
        title={$t("storyBuilder.position.setFromViewHint")}
        on:click={onSetFrameFromView}
      >
        <Scan aria-hidden="true" />
        <span>{$t("storyBuilder.position.setFromView")}</span>
      </button>
    {/if}

    <button
      type="button"
      class="camera-timeline__button camera-timeline__button--primary"
      data-testid="camera-timeline-capture"
      title={$t("storyBuilder.cameraTimeline.captureHint")}
      on:click={handleCapture}
    >
      <Plus aria-hidden="true" />
      <span>{$t("storyBuilder.cameraTimeline.capture")}</span>
    </button>
  </div>

  <div class="camera-timeline__keyframes">
    {#if points.length === 0}
      <p class="camera-timeline__hint" data-testid="camera-timeline-empty">
        {canSetFrame && !chapter?.viewBox
          ? $t("storyBuilder.position.empty")
          : $t("storyBuilder.cameraTimeline.empty")}
      </p>
    {:else}
      <div
        class="camera-timeline__chips"
        role="group"
        aria-label={$t("storyBuilder.cameraTimeline.keyframes", {
          count: points.length,
        })}
      >
        {#each points as point, index (point.id)}
          <button
            type="button"
            class="camera-timeline__chip"
            class:camera-timeline__chip--selected={$selectedPointId === point.id}
            data-testid="camera-timeline-keyframe"
            aria-pressed={$selectedPointId === point.id}
            aria-label={$t("storyBuilder.cameraTimeline.select", {
              number: index + 1,
            })}
            on:click={() => choosePoint(point.id)}
          >
            <b>{index + 1}</b>
            <span>{clock(point.timeMs)}</span>
          </button>
        {/each}
      </div>
      {#if selectedPoint}
        <div class="camera-timeline__selected">
          {#if onReorderPoint && points.length >= 2}
            <button
              class="camera-timeline__button camera-timeline__button--icon"
              type="button"
              data-testid="camera-timeline-move-earlier"
              disabled={selectedIndex <= 0}
              aria-label={$t("storyBuilder.cameraTimeline.moveEarlier")}
              title={$t("storyBuilder.cameraTimeline.moveEarlier")}
              on:click={() => onReorderPoint?.(selectedPoint.id, -1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              class="camera-timeline__button camera-timeline__button--icon"
              type="button"
              data-testid="camera-timeline-move-later"
              disabled={selectedIndex >= points.length - 1}
              aria-label={$t("storyBuilder.cameraTimeline.moveLater")}
              title={$t("storyBuilder.cameraTimeline.moveLater")}
              on:click={() => onReorderPoint?.(selectedPoint.id, 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          {/if}
          <button
            class="camera-timeline__button"
            type="button"
            data-testid="camera-timeline-update"
            title={$t("storyBuilder.cameraTimeline.updateFromViewHint")}
            on:click={() => onUpdatePointFromView(selectedPoint.id)}
          >
            <Crosshair aria-hidden="true" />
            <span>{$t("storyBuilder.cameraTimeline.updateFromView")}</span>
          </button>
          <button
            class="camera-timeline__button camera-timeline__button--danger"
            type="button"
            data-testid="camera-timeline-delete"
            aria-label={$t("storyBuilder.cameraTimeline.deleteNumber", {
              number: selectedIndex + 1,
            })}
            title={$t("storyBuilder.cameraTimeline.deleteNumber", {
              number: selectedIndex + 1,
            })}
            on:click={() => onDeletePoint(selectedPoint.id)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      {:else if points.length === 1}
        <p class="camera-timeline__hint">
          {$t("storyBuilder.cameraTimeline.needSecond")}
        </p>
      {:else if track?.timingMode === "custom"}
        <p class="camera-timeline__hint">
          {$t("storyBuilder.cameraTimeline.customTimingHint")}
        </p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .camera-timeline {
    --timeline-accent: var(--story-builder-accent, #2ac7ff);
    container: camera-timeline / inline-size;
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    height: 100%;
    min-width: 0;
    padding: 9px 12px;
    box-sizing: border-box;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--viewer-chrome-radius, 0);
    background: var(--viewer-panel, #121922);
    color: var(--viewer-text, #e8edf4);
  }

  .camera-timeline__transport,
  .camera-timeline__keyframes,
  .camera-timeline__selected,
  .camera-timeline__chips {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .camera-timeline__transport {
    gap: 10px;
  }

  .camera-timeline__play,
  .camera-timeline__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    gap: 6px;
    min-height: 32px;
    padding: 5px 11px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.03));
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .camera-timeline__play,
  .camera-timeline__button--icon,
  .camera-timeline__button--danger {
    width: 32px;
    padding: 0;
  }
  .camera-timeline__play:hover:not(:disabled),
  .camera-timeline__button:hover:not(:disabled) {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .camera-timeline__play:disabled,
  .camera-timeline__button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
  .camera-timeline__play:focus-visible,
  .camera-timeline__button:focus-visible,
  .camera-timeline__chip:focus-visible,
  .camera-timeline__marker:focus-visible {
    outline: 2px solid var(--viewer-focus-ring, rgba(42, 199, 255, 0.7));
    outline-offset: 1px;
  }
  .camera-timeline__play :global(svg),
  .camera-timeline__button :global(svg) {
    width: 16px;
    height: 16px;
  }
  .camera-timeline__button[aria-expanded='true'] {
    border-color: var(--timeline-accent);
    background: color-mix(in srgb, var(--timeline-accent) 12%, transparent);
  }
  .camera-timeline__button--frame {
    border-color: var(--timeline-accent);
    background: transparent;
    color: var(--timeline-accent);
  }
  .camera-timeline__button--frame:hover:not(:disabled) {
    background: color-mix(in srgb, var(--timeline-accent) 12%, transparent);
  }
  .camera-timeline__button--primary {
    border-color: transparent;
    background: var(--timeline-accent);
    color: var(--story-builder-on-accent, #06141d);
  }
  .camera-timeline__button--primary:hover:not(:disabled) {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }
  .camera-timeline__button--danger {
    color: var(--viewer-danger, #ffb8b8);
  }

  .camera-timeline__time,
  .camera-timeline__narration {
    flex: 0 0 auto;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .camera-timeline__narration {
    color: var(--viewer-muted, #9aa6b2);
  }

  .camera-timeline__track {
    position: relative;
    flex: 1 1 auto;
    min-width: 60px;
    height: 28px;
    cursor: pointer;
    touch-action: none;
  }
  .camera-timeline__track--idle {
    opacity: 0.4;
  }
  .camera-timeline__waveform {
    position: absolute;
    inset: 2px 0;
    display: flex;
    align-items: center;
    gap: 1px;
    pointer-events: none;
  }
  .camera-timeline__waveform span {
    flex: 1 1 0;
    min-height: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--timeline-accent) 32%, transparent);
  }
  .camera-timeline__line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 28%, transparent);
  }
  .camera-timeline__playhead {
    position: absolute;
    left: var(--point-position);
    top: 2px;
    bottom: 2px;
    width: 2px;
    margin-left: -1px;
    background: var(--timeline-accent);
    pointer-events: none;
    z-index: 3;
  }
  .camera-timeline__marker {
    position: absolute;
    left: var(--point-position);
    top: 50%;
    z-index: 4;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translate(-50%, -50%);
    cursor: grab;
    touch-action: none;
  }
  .camera-timeline__marker--dragging {
    cursor: grabbing;
  }
  .camera-timeline__marker span {
    display: block;
    width: 10px;
    height: 10px;
    margin: 5px;
    box-sizing: border-box;
    border: 2px solid var(--viewer-text, #e8edf4);
    border-radius: 50%;
    background: var(--viewer-panel, #121922);
  }
  .camera-timeline__marker--selected span {
    border-color: var(--timeline-accent);
    background: var(--timeline-accent);
  }

  .camera-timeline__options-anchor {
    flex: 0 0 auto;
  }
  .camera-timeline__options {
    position: absolute;
    inset-inline: 0;
    bottom: calc(100% + 8px);
    z-index: 5;
    max-height: min(60vh, 420px);
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    background: var(--viewer-panel, #121922);
    box-shadow: var(--viewer-dock-button-shadow, 0 12px 24px rgba(0, 0, 0, 0.35));
  }

  .camera-timeline__keyframes {
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }
  .camera-timeline__hint {
    margin: 0;
    overflow: hidden;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
  }
  .camera-timeline__chips {
    flex: 1 1 auto;
    gap: 6px;
    overflow-x: auto;
    padding: 2px;
  }
  .camera-timeline__chip {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 8px;
    min-height: 32px;
    padding: 4px 10px 4px 5px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.03));
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .camera-timeline__chip:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .camera-timeline__chip b {
    display: grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 14%, transparent);
    font-size: 12px;
    font-weight: 600;
  }
  .camera-timeline__chip--selected {
    border-color: var(--timeline-accent);
    background: color-mix(in srgb, var(--timeline-accent) 12%, transparent);
  }
  .camera-timeline__chip--selected b {
    background: var(--timeline-accent);
    color: var(--story-builder-on-accent, #06141d);
  }
  .camera-timeline__selected {
    flex: 0 0 auto;
    gap: 6px;
  }

  @container camera-timeline (max-width: 640px) {
    .camera-timeline__narration,
    .camera-timeline__button--frame span,
    .camera-timeline__button--primary span,
    .camera-timeline__selected .camera-timeline__button span {
      display: none;
    }
    .camera-timeline__button--frame,
    .camera-timeline__button--primary,
    .camera-timeline__selected .camera-timeline__button {
      width: 32px;
      padding: 0;
    }
    .camera-timeline__transport {
      gap: 7px;
    }
  }
</style>
