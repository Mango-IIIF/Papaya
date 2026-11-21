<script lang="ts">
  import { Check } from "@lucide/svelte";
  import { readable, type Readable } from "svelte/store";
  import {
    type ChapterAnnotationTool,
    type ChapterCameraTrack,
    type StoryState,
  } from "../../core/types/story";
  import {
    ANNOTATION_TOOLS,
    annotationToolLabelKey,
  } from "../annotations/annotationTools";
  import type { MediaSource, MediaType } from "@mango-iiif/iiif-viewer/core";
  import type { MediaMarksState } from "../mediaMarks";
  import type { ChapterTaskId } from "../chapterTasks";
  import StoryBuilderWideNarration from "./StoryBuilderWideNarration.svelte";
  import StoryBuilderWideMediaTiming from "./StoryBuilderWideMediaTiming.svelte";
  import StoryCameraTimeline from "./StoryCameraTimeline.svelte";
  import { t } from '../../core/i18n';

  export let story: Readable<StoryState>;
  export let selectedChapterId: Readable<string | null>;
  export let activeTask: Readable<ChapterTaskId | null>;
  export let mediaType: Readable<MediaType | null>;
  export let mediaSources: Readable<MediaSource[]>;
  export let mediaMarks: Readable<MediaMarksState>;
  export let avMarksValid: Readable<boolean>;
  export let language = "en";
  export let languages: string[] = ["en"];
  export let onSetNarrationTrack: (language: string, src: string) => void;
  export let onAssignNarrationSegment: (
    language: string,
    start: number,
    end: number,
  ) => void;
  export let onSkipNarration: (language: string) => void = () => {};
  export let onAssignMediaSegment: (start: number, end: number) => void;
  export let onPreviewMediaSegment: () => void;
  export let onStopPreviewMediaSegment: () => void;
  /** Sets the chapter frame to the story-shaped box inside the current view. */
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
  export let motionPreviewing: Readable<boolean> = readable(false);
  export let onUpdateMotionDuration: (durationMs: number) => void = () => {};
  export let onUpdateMotionPathType: (pathType: "linear" | "spline") => void = () => {};
  export let onUpdateMotionInitialDwell: (dwellMs: number) => void = () => {};
  export let onUpdateMotionEasing: (
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out",
  ) => void = () => {};
  export let onApplyMotionPreset: (
    preset: NonNullable<ChapterCameraTrack["preset"]>,
  ) => void = () => {};
  export let onPreviewMotion: (options?: {
    startMs?: number;
    withAudio?: boolean;
  }) => void = () => {};
  export let onStopMotionPreview: () => void = () => {};
  export let annotationTool: Readable<ChapterAnnotationTool> = readable("select");
  export let selectedAnnotationId: Readable<string | null> = readable(null);
  export let onSetAnnotationTool: (tool: ChapterAnnotationTool) => void = () => {};
  /** The keyframe whose outline currently carries the handles on the image. */
  export let selectedPointId: Readable<string | null> = readable(null);
  /**
   * Closes the open tool, keeping its edits. The panel floats over the stage,
   * so it has to carry its own way out — the inspector's Done may be in
   * another group, scrolled away, or collapsed with the panel.
   */
  export let onDone: (() => void) | undefined = undefined;

  $: chapter =
    $story.chapters.find((entry) => entry.id === $selectedChapterId) ?? null;
  $: selectedAnnotation =
    chapter?.drawingAnnotations?.find(
      (annotation) => annotation.id === $selectedAnnotationId,
    ) ?? null;
  $: mediaTimingIsVideo =
    $mediaType === "video" || $mediaSources.some((entry) => entry.type === "video");
  /* Camera motion is authored on spatial media; audio and video chapters have
     their own timing editor. */
  $: spatialChapter =
    Boolean(chapter) && $mediaType !== "audio" && $mediaType !== "video";
  /* A frame is a region of an image; a 3D chapter is posed, not framed. */
  $: framedChapter =
    spatialChapter && $mediaType !== "model" && !chapter?.model;

  /* One line saying what the pointer does on the image right now. */
  $: annotationHint =
    $annotationTool !== "select"
      ? $t("storyBuilder.annotations.hintDraw", {
          shape: $t(annotationToolLabelKey($annotationTool)).toLowerCase(),
        })
      : selectedAnnotation
        ? $t("storyBuilder.annotations.hintEditing")
        : $t("storyBuilder.annotations.hintSelect");
</script>

{#if chapter && $activeTask === "focus"}
  <!--
    Annotation mode, in the same strip the camera timeline lives in. The bar
    holds what acts on the image: the tool in hand and the way out. What an
    annotation says and looks like is edited beside the rest of the chapter,
    in the inspector.
  -->
  <section
    class="annotation-bar"
    aria-label={$t("storyBuilder.annotations.drawing")}
    data-testid="annotation-bar"
  >
    <div class="annotation-bar__row">
      <div
        class="annotation-bar__tools"
        role="group"
        aria-label={$t("storyBuilder.annotations.tools")}
      >
        {#each ANNOTATION_TOOLS as tool}
          <button
            class="annotation-bar__tool"
            class:annotation-bar__tool--active={$annotationTool === tool.id}
            type="button"
            data-testid={`annotation-tool-${tool.id}`}
            aria-pressed={$annotationTool === tool.id}
            title={$t(annotationToolLabelKey(tool.id))}
            on:click={() => onSetAnnotationTool(tool.id)}
          >
            <svelte:component this={tool.icon} aria-hidden="true" />
            <span>{$t(annotationToolLabelKey(tool.id))}</span>
          </button>
        {/each}
      </div>
      <button
        class="annotation-bar__done"
        type="button"
        data-testid="story-wide-done"
        on:click={() => onDone?.()}
      >
        <Check aria-hidden="true" />
        <span>{$t("storyBuilder.inspector.done")}</span>
      </button>
    </div>
    <p class="annotation-bar__hint" data-testid="annotation-bar-hint">
      {annotationHint}
    </p>
  </section>
{:else if chapter && $activeTask === "audio-timing"}
  <div class="story-wide-modal">
    <button
      class="story-wide-modal__scrim"
      type="button"
      tabindex="-1"
      aria-label={$t('storyBuilder.inspector.done')}
      on:click={() => onDone?.()}
    ></button>
    <div
      class="story-wide-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-wide-audio-title"
    >
      <header class="story-wide-modal__header">
        <strong id="story-wide-audio-title">{$t('storyBuilder.narration.title')}</strong>
        <button
          class="story-wide-modal__done"
          type="button"
          on:click={() => onDone?.()}
        >
          <Check aria-hidden="true" />
          <span>{$t('storyBuilder.inspector.done')}</span>
        </button>
      </header>
      <div class="story-wide-modal__body">
        <StoryBuilderWideNarration
          {story}
          {selectedChapterId}
          {language}
          {languages}
          {onSetNarrationTrack}
          {onAssignNarrationSegment}
          {onSkipNarration}
        />
      </div>
    </div>
  </div>
{:else if chapter && $activeTask === "media-timing"}
  <div
    class="story-wide-modal story-wide-modal--media"
    class:story-wide-modal--video={mediaTimingIsVideo}
  >
    <button
      class="story-wide-modal__scrim"
      type="button"
      tabindex="-1"
      aria-label={$t('storyBuilder.inspector.done')}
      on:click={() => onDone?.()}
    ></button>
    <div
      class="story-wide-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-wide-media-title"
    >
      <header class="story-wide-modal__header">
        <strong id="story-wide-media-title">{$t('storyBuilder.media.segment')}</strong>
        <button
          class="story-wide-modal__done"
          type="button"
          on:click={() => onDone?.()}
        >
          <Check aria-hidden="true" />
          <span>{$t('storyBuilder.inspector.done')}</span>
        </button>
      </header>
      <div class="story-wide-modal__body">
        <StoryBuilderWideMediaTiming
          {story}
          {selectedChapterId}
          {mediaType}
          {mediaSources}
          {mediaMarks}
          marksValid={avMarksValid}
          {onAssignMediaSegment}
          onPreview={onPreviewMediaSegment}
          onStopPreview={onStopPreviewMediaSegment}
        />
      </div>
    </div>
  </div>
{:else if chapter && spatialChapter}
  <StoryCameraTimeline
    {story}
    {selectedChapterId}
    {selectedPointId}
    {motionPreviewing}
    {language}
    canSetFrame={framedChapter}
    {onSetFrameFromView}
    {onAddPoint}
    {onGoToPoint}
    {onSelectPoint}
    {onUpdatePointFromView}
    {onMovePointTime}
    {onReorderPoint}
    {onEvenSpace}
    {onScrubTo}
    {onDeletePoint}
    {onPreviewMotion}
    {onStopMotionPreview}
    onUpdateDuration={onUpdateMotionDuration}
    onUpdatePathType={onUpdateMotionPathType}
    onUpdateDwell={onUpdateMotionInitialDwell}
    onUpdateEasing={onUpdateMotionEasing}
    onApplyPreset={onApplyMotionPreset}
  />
{:else}
  <div class="story-wide-authoring--empty" aria-hidden="true"></div>
{/if}

<style>
  /*
   * The bottom bar is this component's alone: one strip under the whole
   * editor. Whatever is in it fills it, with none of the plugin panel's own
   * chrome, so the strip is the same height whichever tool is showing.
   */
  :global(.stage__bottom:has(.story-wide-authoring--empty)) {
    display: none;
  }
  :global(.stage__bottom .plugin-slot),
  :global(.stage__bottom .plugin-panel),
  :global(.stage__bottom .plugin-panel__panel),
  :global(.stage__bottom .plugin-panel__body) {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: visible;
  }
  :global(.stage__bottom .plugin-panel__panel) {
    gap: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  :global(.stage__bottom .plugin-panel__title) {
    display: none;
  }

  /* A modal tool covers the whole editor, not just the image: it positions
     against the builder grid, which is the nearest positioned ancestor. */
  .story-wide-modal {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    padding: clamp(10px, 3cqw, 28px);
    box-sizing: border-box;
  }
  .story-wide-modal__scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: rgba(3, 7, 12, 0.68);
    backdrop-filter: blur(5px);
    cursor: default;
  }
  .story-wide-modal__panel {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(960px, 100%);
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: var(--viewer-panel, #121922);
    color: var(--viewer-text, #e8edf4);
    box-shadow: var(--viewer-dock-button-shadow, 0 12px 24px rgba(0, 0, 0, 0.35));
  }
  .story-wide-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }
  .story-wide-modal__header > strong {
    font-size: 14px;
  }
  .story-wide-modal__done {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px 7px 9px;
    border: 1px solid color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 60%, transparent);
    border-radius: 8px;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .story-wide-modal__done:hover {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }
  .story-wide-modal__done :global(svg) {
    width: 13px;
    height: 13px;
  }
  .story-wide-modal__body {
    min-width: 0;
    min-height: 0;
    padding: 14px;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .story-wide-modal__body :global(.story-wide-narration),
  .story-wide-modal__body :global(.story-wide-media) {
    min-height: 0;
    max-height: none;
    overflow: visible;
    resize: none;
  }
  .story-wide-modal--video .story-wide-modal__scrim {
    background: var(--viewer-stage-tail, #050a10);
    backdrop-filter: none;
  }
  .story-wide-modal--video .story-wide-modal__panel {
    width: min(1180px, 100%);
  }

  .annotation-bar {
    container: annotation-bar / inline-size;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    height: 100%;
    min-width: 0;
    padding: 9px 12px;
    box-sizing: border-box;
    border: 1px solid var(--story-builder-accent, #2ac7ff);
    border-radius: var(--viewer-chrome-radius, 0);
    background: var(--viewer-panel, #121922);
    color: var(--viewer-text, #e8edf4);
  }
  .annotation-bar__row,
  .annotation-bar__tools {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .annotation-bar__row {
    justify-content: space-between;
    gap: 10px;
  }
  .annotation-bar__tools {
    gap: 6px;
    overflow-x: auto;
  }
  .annotation-bar__tool,
  .annotation-bar__done {
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
  .annotation-bar__tool:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .annotation-bar__tool :global(svg),
  .annotation-bar__done :global(svg) {
    width: 16px;
    height: 16px;
  }
  .annotation-bar__tool--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 12%, transparent);
  }
  .annotation-bar__tool:focus-visible,
  .annotation-bar__done:focus-visible {
    outline: 2px solid var(--viewer-focus-ring, rgba(42, 199, 255, 0.7));
    outline-offset: 1px;
  }
  .annotation-bar__done {
    border-color: transparent;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }
  .annotation-bar__done:hover {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }
  .annotation-bar__hint {
    align-self: center;
    margin: 0;
    overflow: hidden;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container annotation-bar (max-width: 640px) {
    .annotation-bar__tool span {
      display: none;
    }
    .annotation-bar__tool {
      width: 34px;
      padding: 0;
    }
  }
</style>
