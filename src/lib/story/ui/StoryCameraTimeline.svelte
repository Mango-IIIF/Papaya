<script lang="ts">
  import { Camera, CirclePlay, Info, Plus, Square } from "@lucide/svelte";
  import { readable, type Readable } from "svelte/store";
  import type { StoryState } from "../../core/types/story";
  import {
    animatableCameraDurationMs,
    balanceCameraTrackKeyframes,
  } from "../cameraTrack";
  import {
    manifestsStore,
    resolveCanvasThumbnail,
  } from "@mango-iiif/iiif-viewer/core";
  import { t } from "../../core/i18n";

  export let story: Readable<StoryState>;
  export let selectedChapterId: Readable<string | null>;
  export let selectedPointId: Readable<string | null> = readable(null);
  export let motionPreviewing: Readable<boolean> = readable(false);
  export let onAddPoint: () => void;
  export let onGoToPoint: (keyframeId: string) => void;
  export let onPreviewMotion: () => void = () => {};
  export let onStopMotionPreview: () => void = () => {};

  let showNarration = true;

  $: chapter =
    $story.chapters.find((entry) => entry.id === $selectedChapterId) ?? null;
  $: track = chapter?.cameraTrack;
  $: points = track ? balanceCameraTrackKeyframes(track) : [];
  $: thumbnail = chapter
    ? resolveCanvasThumbnail(
        $manifestsStore[chapter.manifest]?.manifesto,
        chapter.canvasId,
        chapter.canvasIndex,
      )
    : null;
  $: durationMs = track
    ? Math.max(1, animatableCameraDurationMs(track))
    : Math.max(1, chapter?.presentationDurationMs ?? 5000);

  const position = (timeMs: number): string =>
    `${Math.max(0, Math.min(100, (timeMs / durationMs) * 100))}%`;

  const time = (timeMs: number): string => {
    const seconds = Math.max(0, timeMs) / 1000;
    return `0:${seconds.toFixed(seconds % 1 === 0 ? 0 : 1).padStart(2, "0")}`;
  };
</script>

<section
  class="camera-timeline"
  aria-label={$t("storyBuilder.cameraTimeline.title")}
  data-testid="camera-timeline"
>
  <header class="camera-timeline__header">
    <div class="camera-timeline__title">
      <Camera aria-hidden="true" />
      <strong>{$t("storyBuilder.cameraTimeline.title")}</strong>
      <Info aria-label={$t("storyBuilder.cameraTimeline.info")} />
    </div>
    <div class="camera-timeline__actions">
      <label class="camera-timeline__narration">
        <input type="checkbox" bind:checked={showNarration} />
        <span aria-hidden="true"></span>
        {$t("storyBuilder.cameraTimeline.showNarration")}
      </label>
      <button
        type="button"
        class="camera-timeline__capture"
        on:click={onAddPoint}
      >
        <Plus aria-hidden="true" />
        {$t("storyBuilder.cameraTimeline.capture")}
      </button>
    </div>
  </header>

  <div class="camera-timeline__transport">
    <button
      class="camera-timeline__play"
      type="button"
      disabled={points.length < 2}
      aria-label={$motionPreviewing
        ? $t("storyBuilder.motion.stopPreview")
        : $t("storyBuilder.motion.preview")}
      on:click={() =>
        $motionPreviewing ? onStopMotionPreview() : onPreviewMotion()}
    >
      {#if $motionPreviewing}<Square aria-hidden="true" />{:else}<CirclePlay
          aria-hidden="true"
        />{/if}
    </button>
    <span class="camera-timeline__time">0:00 / {time(durationMs)}</span>
    <div class="camera-timeline__track">
      {#if showNarration}
        <div class="camera-timeline__wave" aria-hidden="true">
          {#each Array(52) as _, index}
            <i style={`--wave:${20 + ((index * 17) % 65)}%`}></i>
          {/each}
        </div>
      {/if}
      <div class="camera-timeline__line" aria-hidden="true"></div>
      {#each points as point, index (point.id)}
        <button
          class="camera-timeline__marker"
          class:camera-timeline__marker--selected={$selectedPointId ===
            point.id}
          type="button"
          style={`--point-position:${position(point.timeMs)}`}
          aria-label={$t("storyBuilder.cameraTimeline.goTo", {
            number: index + 1,
            time: time(point.timeMs),
          })}
          aria-pressed={$selectedPointId === point.id}
          on:click={() => onGoToPoint(point.id)}
        >
          <span></span>
        </button>
      {/each}
    </div>
    <span class="camera-timeline__end">{time(durationMs)}</span>
  </div>

  <div class="camera-timeline__keyframes">
    <div class="camera-timeline__keyframe-label">
      <span>⌄</span>
      <strong
        >{$t("storyBuilder.cameraTimeline.keyframes", {
          count: points.length,
        })}</strong
      >
    </div>
    {#if points.length > 0}
      <div class="camera-timeline__cards">
        {#each points as point, index (point.id)}
          <button
            type="button"
            class="camera-timeline__card"
            class:camera-timeline__card--selected={$selectedPointId ===
              point.id}
            aria-label={$t("storyBuilder.cameraTimeline.select", {
              number: index + 1,
            })}
            on:click={() => onGoToPoint(point.id)}
          >
            {#if thumbnail}<img src={thumbnail} alt="" />{/if}
            <span class="camera-timeline__card-number">{index + 1}</span>
            <span class="camera-timeline__card-frame" aria-hidden="true"></span>
            <span class="camera-timeline__card-time">{time(point.timeMs)}</span>
          </button>
        {/each}
      </div>
    {:else}
      <button
        class="camera-timeline__empty"
        type="button"
        on:click={onAddPoint}
      >
        <Plus aria-hidden="true" />
        {$t("storyBuilder.cameraTimeline.empty")}
      </button>
    {/if}
  </div>
</section>

<style>
  .camera-timeline {
    --timeline-accent: var(--story-timeline-accent, #9a57ff);
    display: grid;
    gap: 9px;
    min-width: 0;
    padding: 11px 14px 12px;
    box-sizing: border-box;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--viewer-panel, #111a24) 96%,
      transparent
    );
    color: var(--viewer-text, #eef4fb);
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.32);
  }

  .camera-timeline__header,
  .camera-timeline__actions,
  .camera-timeline__title,
  .camera-timeline__transport,
  .camera-timeline__keyframe-label {
    display: flex;
    align-items: center;
  }

  .camera-timeline__header {
    justify-content: space-between;
    gap: 12px;
  }
  .camera-timeline__title {
    gap: 7px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .camera-timeline__title strong {
    font-size: 11px;
  }
  .camera-timeline__title :global(svg) {
    width: 14px;
    height: 14px;
    color: var(--viewer-muted, #aab5c2);
  }
  .camera-timeline__title :global(svg:last-child) {
    width: 13px;
  }
  .camera-timeline__actions {
    gap: 12px;
  }

  .camera-timeline__narration {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--viewer-muted, #aab5c2);
    font-size: 11px;
    cursor: pointer;
  }
  .camera-timeline__narration input {
    position: absolute;
    opacity: 0;
  }
  .camera-timeline__narration span {
    width: 28px;
    height: 15px;
    padding: 2px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    box-sizing: border-box;
  }
  .camera-timeline__narration span::after {
    content: "";
    display: block;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #dce4ed;
    transition: transform 0.15s ease;
  }
  .camera-timeline__narration input:checked + span {
    background: var(--timeline-accent);
  }
  .camera-timeline__narration input:checked + span::after {
    transform: translateX(13px);
  }

  .camera-timeline__capture,
  .camera-timeline__empty {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .camera-timeline__capture {
    min-height: 32px;
    padding: 6px 10px;
  }
  .camera-timeline__capture:hover,
  .camera-timeline__empty:hover {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: rgba(42, 199, 255, 0.08);
  }
  .camera-timeline__capture :global(svg),
  .camera-timeline__empty :global(svg) {
    width: 14px;
    height: 14px;
  }

  .camera-timeline__transport {
    gap: 11px;
    min-width: 0;
  }
  .camera-timeline__play {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .camera-timeline__play:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
  .camera-timeline__play :global(svg) {
    width: 18px;
    height: 18px;
  }
  .camera-timeline__time,
  .camera-timeline__end {
    flex: 0 0 auto;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .camera-timeline__end {
    color: var(--viewer-muted, #aab5c2);
  }
  .camera-timeline__track {
    position: relative;
    flex: 1 1 auto;
    min-width: 80px;
    height: 35px;
  }
  .camera-timeline__wave {
    position: absolute;
    inset: 0 0 14px;
    display: flex;
    align-items: end;
    gap: 1px;
    overflow: hidden;
    padding: 2px 8px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--timeline-accent) 10%, transparent);
    opacity: 0.7;
  }
  .camera-timeline__wave i {
    flex: 1;
    height: var(--wave);
    min-width: 1px;
    background: color-mix(in srgb, var(--timeline-accent) 70%, transparent);
  }
  .camera-timeline__line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 7px;
    height: 1px;
    background: rgba(229, 237, 246, 0.68);
  }
  .camera-timeline__marker {
    position: absolute;
    left: var(--point-position);
    bottom: 1px;
    z-index: 2;
    width: 14px;
    height: 14px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translateX(-50%);
    cursor: pointer;
  }
  .camera-timeline__marker span {
    display: block;
    width: 8px;
    height: 8px;
    margin: 3px;
    border: 1px solid #fff;
    background: #eef4fb;
    transform: rotate(45deg);
  }
  .camera-timeline__marker--selected span {
    border-color: var(--timeline-accent);
    background: var(--timeline-accent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--timeline-accent) 25%, transparent);
  }

  .camera-timeline__keyframes {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }
  .camera-timeline__keyframe-label {
    align-self: start;
    gap: 7px;
    padding-top: 5px;
    color: var(--viewer-muted, #aab5c2);
    text-transform: uppercase;
    letter-spacing: 0.11em;
    white-space: nowrap;
  }
  .camera-timeline__keyframe-label strong {
    font-size: 10px;
  }
  .camera-timeline__cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(130px, 1fr);
    gap: 9px;
    min-width: 0;
    overflow-x: auto;
    padding: 1px 2px 3px;
  }
  .camera-timeline__card {
    position: relative;
    height: 68px;
    min-width: 0;
    overflow: hidden;
    border: 2px solid transparent;
    border-radius: 10px;
    background:
      linear-gradient(
        115deg,
        rgba(227, 205, 166, 0.72),
        rgba(85, 111, 135, 0.55)
      ),
      var(--viewer-stage, #071019);
    color: #fff;
    cursor: pointer;
  }
  .camera-timeline__card::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 45%, rgba(3, 8, 14, 0.72));
  }
  .camera-timeline__card img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .camera-timeline__card--selected {
    border-color: var(--timeline-accent);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--timeline-accent) 18%, transparent);
  }
  .camera-timeline__card-number,
  .camera-timeline__card-time {
    position: absolute;
    z-index: 2;
    font-size: 10px;
    font-weight: 800;
  }
  .camera-timeline__card-number {
    top: 6px;
    left: 6px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.9);
    color: #17202a;
  }
  .camera-timeline__card-time {
    right: 6px;
    bottom: 5px;
  }
  .camera-timeline__card-frame {
    position: absolute;
    z-index: 1;
    inset: 14px 24%;
    border: 2px solid rgba(255, 255, 255, 0.9);
  }
  .camera-timeline__empty {
    justify-self: start;
    min-height: 44px;
    padding: 8px 14px;
    color: var(--viewer-muted, #aab5c2);
  }

  @container mango-viewer (max-width: 760px) {
    .camera-timeline {
      gap: 7px;
      padding: 9px 10px;
      border-radius: 11px;
    }
    .camera-timeline__narration {
      display: none;
    }
    .camera-timeline__capture {
      width: 34px;
      padding: 0;
    }
    .camera-timeline__capture {
      font-size: 0;
    }
    .camera-timeline__capture :global(svg) {
      width: 16px;
      height: 16px;
    }
    .camera-timeline__keyframes {
      grid-template-columns: 1fr;
      gap: 5px;
    }
    .camera-timeline__keyframe-label {
      padding-top: 0;
    }
    .camera-timeline__cards {
      grid-auto-columns: 112px;
    }
    .camera-timeline__card {
      height: 52px;
    }
  }
</style>
