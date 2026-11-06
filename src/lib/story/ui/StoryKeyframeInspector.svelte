<script lang="ts">
  import { ChevronLeft, ChevronRight, Crosshair, Trash2 } from "@lucide/svelte";
  import { readable, type Readable } from "svelte/store";
  import type { StoryState } from "../../core/types/story";
  import {
    manifestsStore,
    resolveCanvasThumbnail,
  } from "@mango-iiif/iiif-viewer/core";
  import { t } from "../../core/i18n";

  export let story: Readable<StoryState>;
  export let selectedChapterId: Readable<string | null>;
  export let selectedPointId: Readable<string | null> = readable(null);
  export let language = "en";
  export let onGoToPoint: (keyframeId: string) => void;
  export let onUpdatePointFromView: (keyframeId: string) => void;
  export let onDeletePoint: (keyframeId: string) => void;

  $: chapter =
    $story.chapters.find((entry) => entry.id === $selectedChapterId) ?? null;
  $: points = [...(chapter?.cameraTrack?.keyframes ?? [])].sort(
    (a, b) => a.timeMs - b.timeMs,
  );
  $: selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.id === $selectedPointId),
  );
  $: point = points[selectedIndex] ?? null;
  $: thumbnail = chapter
    ? resolveCanvasThumbnail(
        $manifestsStore[chapter.manifest]?.manifesto,
        chapter.canvasId,
        chapter.canvasIndex,
      )
    : null;

  const time = (timeMs: number): string => `${(timeMs / 1000).toFixed(1)}s`;

  const go = (index: number) => {
    const next = points[index];
    if (next) onGoToPoint(next.id);
  };
</script>

{#if point}
  <div class="keyframe-inspector" data-testid="keyframe-inspector">
    <header class="keyframe-inspector__header">
      <div>
        <span
          >{$t("storyBuilder.cameraTimeline.keyframeNumber", {
            number: selectedIndex + 1,
          })}</span
        >
        <strong>{time(point.timeMs)}</strong>
      </div>
      <nav aria-label={$t("storyBuilder.cameraTimeline.navigation")}>
        <button
          type="button"
          disabled={selectedIndex <= 0}
          on:click={() => go(selectedIndex - 1)}
          aria-label={$t("storyBuilder.cameraTimeline.previous")}
          ><ChevronLeft aria-hidden="true" /></button
        >
        <button
          type="button"
          disabled={selectedIndex >= points.length - 1}
          on:click={() => go(selectedIndex + 1)}
          aria-label={$t("storyBuilder.cameraTimeline.next")}
          ><ChevronRight aria-hidden="true" /></button
        >
      </nav>
    </header>

    <div
      class="keyframe-inspector__preview"
      aria-label={$t("storyBuilder.cameraTimeline.savedPreview")}
    >
      {#if thumbnail}<img src={thumbnail} alt="" />{/if}
      <span>{selectedIndex + 1}</span>
      <i aria-hidden="true"></i>
      <small
        >{point.viewBox
          ? `${Math.round(point.viewBox.w)} × ${Math.round(point.viewBox.h)}`
          : $t("storyBuilder.cameraTimeline.savedView")}</small
      >
    </div>

    <section class="keyframe-inspector__section">
      <h3>⌄ <span>{$t("storyBuilder.cameraTimeline.details")}</span></h3>
      <label
        >{$t("storyBuilder.cameraTimeline.time")}
        <input value={time(point.timeMs)} readonly /></label
      >
      <label
        >{$t("storyBuilder.cameraTimeline.durationNext")}
        <input
          value={selectedIndex < points.length - 1
            ? time(points[selectedIndex + 1].timeMs - point.timeMs)
            : "—"}
          readonly
        /></label
      >
      <div class="keyframe-inspector__label">
        {$t("storyBuilder.cameraTimeline.cameraView")}
      </div>
      <div
        class="keyframe-inspector__segments"
        role="group"
        aria-label={$t("storyBuilder.cameraTimeline.cameraViewMode")}
      >
        <button type="button" aria-pressed="true"
          >{$t("storyBuilder.cameraTimeline.frame")}</button
        >
        <button type="button" aria-pressed="false"
          >{$t("storyBuilder.cameraTimeline.panZoom")}</button
        >
      </div>
      <button
        class="keyframe-inspector__update"
        type="button"
        on:click={() => onUpdatePointFromView(point.id)}
      >
        <Crosshair aria-hidden="true" />
        {$t("storyBuilder.cameraTimeline.updateFromView")}
      </button>
    </section>

    <section class="keyframe-inspector__section">
      <h3>⌄ <span>{$t("storyBuilder.narration.title")}</span></h3>
      <p>
        {chapter?.description?.[language] ??
          Object.values(chapter?.description ?? {})[0] ??
          $t("storyBuilder.cameraTimeline.narrationFallback")}
      </p>
    </section>

    <button
      class="keyframe-inspector__delete"
      type="button"
      on:click={() => onDeletePoint(point.id)}
    >
      <Trash2 aria-hidden="true" />
      {$t("storyBuilder.cameraTimeline.delete")}
    </button>
  </div>
{/if}

<style>
  .keyframe-inspector {
    display: grid;
    gap: 14px;
    padding: 14px;
    color: var(--viewer-text, #e8edf4);
    overflow: auto;
  }
  .keyframe-inspector__header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 12px;
  }
  .keyframe-inspector__header > div {
    display: grid;
    gap: 3px;
  }
  .keyframe-inspector__header span {
    color: var(--viewer-muted, #9aa6b2);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .keyframe-inspector__header strong {
    font-size: 22px;
  }
  .keyframe-inspector__header nav {
    display: flex;
    gap: 7px;
  }
  .keyframe-inspector__header button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .keyframe-inspector__header button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .keyframe-inspector__header :global(svg) {
    width: 16px;
  }
  .keyframe-inspector__preview {
    position: relative;
    height: 146px;
    overflow: hidden;
    border-radius: 12px;
    background: linear-gradient(125deg, #d2bd94, #7893aa 62%, #4c6576);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .keyframe-inspector__preview::after {
    content: "";
    position: absolute;
    inset: 52% 0 0;
    background: linear-gradient(
      180deg,
      rgba(87, 105, 111, 0.2),
      rgba(36, 54, 62, 0.68)
    );
  }
  .keyframe-inspector__preview img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .keyframe-inspector__preview > span {
    position: absolute;
    z-index: 2;
    top: 9px;
    left: 9px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.9);
    color: #17202a;
    font-size: 11px;
    font-weight: 800;
  }
  .keyframe-inspector__preview i {
    position: absolute;
    z-index: 2;
    inset: 28px 17%;
    border: 3px solid rgba(255, 255, 255, 0.94);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.16);
  }
  .keyframe-inspector__preview small {
    position: absolute;
    z-index: 3;
    right: 9px;
    bottom: 8px;
    padding: 3px 6px;
    border-radius: 5px;
    background: rgba(4, 9, 15, 0.62);
    color: #fff;
    font-size: 9px;
  }
  .keyframe-inspector__section {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.09));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--viewer-well-bg, #071019) 55%,
      transparent
    );
  }
  .keyframe-inspector__section h3 {
    display: flex;
    gap: 7px;
    margin: 0;
    color: var(--viewer-text, #e8edf4);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .keyframe-inspector__section label {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px;
    align-items: center;
    gap: 10px;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .keyframe-inspector__section input {
    min-width: 0;
    padding: 8px 9px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--viewer-well-bg, rgba(5, 10, 16, 0.35));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  .keyframe-inspector__label {
    color: var(--viewer-muted, #9aa6b2);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .keyframe-inspector__segments {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .keyframe-inspector__segments button {
    min-height: 34px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
    border-radius: 9px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .keyframe-inspector__segments button[aria-pressed="true"] {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(
      in srgb,
      var(--story-builder-accent, #2ac7ff) 12%,
      transparent
    );
    color: var(--viewer-text, #e8edf4);
  }
  .keyframe-inspector__update {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.035);
    color: inherit;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .keyframe-inspector__update:hover {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(
      in srgb,
      var(--story-builder-accent, #2ac7ff) 8%,
      transparent
    );
  }
  .keyframe-inspector__update :global(svg) {
    width: 15px;
  }
  .keyframe-inspector__section p {
    min-height: 54px;
    margin: 0;
    padding: 9px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    color: var(--viewer-muted, #aab5c2);
    font-size: 12px;
    line-height: 1.45;
  }
  .keyframe-inspector__delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 36px;
    border: 1px solid
      color-mix(in srgb, var(--viewer-danger, #ffb8b8) 36%, transparent);
    border-radius: 9px;
    background: transparent;
    color: var(--viewer-danger, #ffb8b8);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .keyframe-inspector__delete :global(svg) {
    width: 14px;
  }
</style>
