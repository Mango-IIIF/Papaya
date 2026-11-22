<script lang="ts">
  import { FolderOpen } from '@lucide/svelte';
  import { writable, type Readable } from 'svelte/store';
  import {
    manifestsStore,
    type MediaSource,
    type MediaType,
  } from '@mango-iiif/iiif-viewer/core';
  import type {
    Chapter,
    ChapterAdvance,
    ChapterCameraTrack,
    ChapterDrawingAnnotation,
    StoryState,
  } from '../../core/types/story';
  import { resolveIiifText } from '../manifestAttribution';
  import ChapterTextForm from '../ui/ChapterTextForm.svelte';
  import StoryBuilderWideAnnotations from '../ui/StoryBuilderWideAnnotations.svelte';
  import StoryBuilderWideAnnotationOptions from '../ui/StoryBuilderWideAnnotationOptions.svelte';
  import StudioViewerBar from './StudioViewerBar.svelte';
  import StudioInspectorCamera from './StudioInspectorCamera.svelte';
  import StudioInspectorAudio from './StudioInspectorAudio.svelte';
  import type { StudioMode } from './StudioToolbar.svelte';
  import { t } from '../../core/i18n';

  interface Props {
    mode: StudioMode;
    audioTrack: 'narration' | 'media';
    storyStore: Readable<StoryState>;
    story: StoryState;
    chapter: Chapter | null;
    chapterIndex: number;
    language: string;
    languages: string[];
    mediaType: MediaType | null;
    layers: MediaSource[];
    layerOpacities: Record<string, number>;
    selectedPointId: string | null;
    selectedAnnotationIdStore: Readable<string | null>;
    selectedAnnotationId: string | null;
    viewerCanvasIndex: number;
    viewerCanvasCount: number;
    viewerZoomPercent: number;
    onPrevCanvas: () => void;
    onNextCanvas: () => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onGoHome: () => void;
    onLanguageChange: (lang: string) => void;
    onOpenSources: () => void;
    onUpdateTitle: (lang: string, value: string) => void;
    onUpdateDescription: (lang: string, value: string) => void;
    onApplyPreset: (preset: NonNullable<ChapterCameraTrack['preset']>) => void;
    onClearMotion: () => void;
    onAddShot: () => void;
    onGoToShot: (id: string) => void;
    onSelectShot: (id: string | null) => void;
    onUpdateShotFromView: (id: string) => void;
    onReorderShot: (id: string, direction: -1 | 1) => void;
    onDeleteShot: (id: string) => void;
    onUpdateMotionDuration: (durationMs: number) => void;
    onUpdateMotionPathType: (pathType: 'linear' | 'spline') => void;
    onUpdateMotionDwell: (dwellMs: number) => void;
    onUpdateMotionEasing: (
      easing: NonNullable<ChapterCameraTrack['easing']>,
    ) => void;
    onEvenSpaceShots: () => void;
    onUpdateAdvanceMode: (mode: ChapterAdvance['mode']) => void;
    onUpdateDelay: (delayMs?: number) => void;
    onUpdateLayerOpacity: (id: string, opacity: number) => void;
    onEditAnnotation: (id: string) => void;
    onFinishAnnotationEdit: () => void;
    onDeleteAnnotation: (id: string) => void;
    onSetAnnotationLabel: (id: string, lang: string, value: string) => void;
    onSetAnnotationStyle: (
      id: string,
      style: {
        color?: string | null;
        strokeWidth?: 'thin' | 'medium' | 'thick';
        fillMode?: ChapterDrawingAnnotation['fillMode'];
        motivation?: ChapterDrawingAnnotation['motivation'] | null;
      },
    ) => void;
    onSetNarrationTrack: (lang: string, src: string) => void;
    onSkipNarration: (lang: string) => void;
    onSelectAudioTrack: (track: 'narration' | 'media') => void;
  }

  let {
    mode,
    audioTrack,
    storyStore,
    story,
    chapter,
    chapterIndex,
    language,
    languages,
    mediaType,
    layers,
    layerOpacities,
    selectedPointId,
    selectedAnnotationIdStore,
    selectedAnnotationId,
    viewerCanvasIndex,
    viewerCanvasCount,
    viewerZoomPercent,
    onPrevCanvas,
    onNextCanvas,
    onZoomOut,
    onZoomIn,
    onGoHome,
    onLanguageChange,
    onOpenSources,
    onUpdateTitle,
    onUpdateDescription,
    onApplyPreset,
    onClearMotion,
    onAddShot,
    onGoToShot,
    onSelectShot,
    onUpdateShotFromView,
    onReorderShot,
    onDeleteShot,
    onUpdateMotionDuration,
    onUpdateMotionPathType,
    onUpdateMotionDwell,
    onUpdateMotionEasing,
    onEvenSpaceShots,
    onUpdateAdvanceMode,
    onUpdateDelay,
    onUpdateLayerOpacity,
    onEditAnnotation,
    onFinishAnnotationEdit,
    onDeleteAnnotation,
    onSetAnnotationLabel,
    onSetAnnotationStyle,
    onSetNarrationTrack,
    onSkipNarration,
    onSelectAudioTrack,
  }: Props = $props();

  const chapterIdStore = writable<string | null>(null);
  $effect(() => {
    chapterIdStore.set(chapter?.id ?? null);
  });

  let isAvChapter = $derived(
    mediaType === 'audio' || mediaType === 'video' || Boolean(chapter?.media),
  );
  let isVideoChapter = $derived(
    mediaType === 'video' || layers.some((src) => src.type === 'video'),
  );
  let spatialChapter = $derived(Boolean(chapter) && !isAvChapter);
  let supportsLayers = $derived(
    layers.length > 1 && layers.every((src) => src.type === 'image'),
  );

  let chapterSourceTitle = $derived.by(() => {
    if (!chapter?.manifest) return '';
    const json = $manifestsStore[chapter.manifest]?.json as
      | Record<string, unknown>
      | undefined;
    const resolved = json ? resolveIiifText(json.label, language) : '';
    if (resolved) return resolved;
    try {
      const parsed = new URL(chapter.manifest);
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts.slice(-2).join('/') || parsed.hostname;
    } catch {
      return chapter.manifest;
    }
  });

  let advanceMode = $derived(chapter?.advance?.mode ?? 'manual');
  let delaySec = $derived(
    Math.round(((chapter?.advance?.delayMs ?? 2000) / 1000) * 10) / 10,
  );
  let annotationSelected = $derived(
    Boolean(
      selectedAnnotationId &&
        chapter?.drawingAnnotations?.some((a) => a.id === selectedAnnotationId),
    ),
  );

  const toggleAnnotation = (id: string) => {
    if (selectedAnnotationId === id) onFinishAnnotationEdit();
    else onEditAnnotation(id);
  };
</script>

<aside
  class="studio-inspector"
  data-testid="studio-inspector"
  aria-label={$t('storyBuilder.studio.toggleInspector')}
>
  {#if !chapter}
    <div class="studio-inspector__empty">
      <strong>{$t('storyBuilder.overlay.noChapter')}</strong>
      <span>{$t('storyBuilder.overlay.noChapterHint')}</span>
    </div>
  {:else}
    <StudioViewerBar
      canvasIndex={viewerCanvasIndex}
      canvasCount={viewerCanvasCount}
      zoomPercent={viewerZoomPercent}
      {spatialChapter}
      {onPrevCanvas}
      {onNextCanvas}
      {onZoomOut}
      {onZoomIn}
      {onGoHome}
    />

    <header class="studio-inspector__header">
      <span class="studio-inspector__eyebrow">
        {$t('storyBuilder.chapters.number', { number: chapterIndex + 1 })}
      </span>
      <div class="studio-inspector__source">
        <span title={chapter.manifest}>{chapterSourceTitle}</span>
        <button
          type="button"
          class="studio-inspector__source-btn"
          data-testid="studio-switch-source"
          onclick={onOpenSources}
        >
          <FolderOpen aria-hidden="true" />
          <span>{$t('storyBuilder.studio.switchSource')}</span>
        </button>
      </div>
    </header>

    <div class="studio-inspector__body">
      {#if mode === 'frame'}
        <section class="studio-section">
          <ChapterTextForm
            activeLanguage={language}
            {languages}
            chapterTitleDraft={chapter.title?.[language] ?? ''}
            chapterDescriptionDraft={chapter.description?.[language] ?? ''}
            {onLanguageChange}
            onChapterTitleInput={(event) =>
              onUpdateTitle(language, (event.currentTarget as HTMLInputElement).value)}
            onChapterDescriptionInput={(event) =>
              onUpdateDescription(language, (event.currentTarget as HTMLTextAreaElement).value)}
          />
        </section>

        {#if spatialChapter}
          <StudioInspectorCamera
            {chapter}
            {language}
            {selectedPointId}
            {onApplyPreset}
            {onClearMotion}
            {onAddShot}
            {onGoToShot}
            {onSelectShot}
            {onUpdateShotFromView}
            {onReorderShot}
            {onDeleteShot}
            {onUpdateMotionDuration}
            {onUpdateMotionPathType}
            {onUpdateMotionDwell}
            {onUpdateMotionEasing}
            {onEvenSpaceShots}
          />
        {/if}

        <section class="studio-section">
          <div class="studio-section__head">
            <h3>{$t('storyBuilder.studio.playbackTitle')}</h3>
            <div class="studio-segmented">
              <button
                type="button"
                class:studio-segmented--active={advanceMode === 'manual'}
                onclick={() => onUpdateAdvanceMode('manual')}
              >
                {$t('storyBuilder.studio.manualAdvance')}
              </button>
              <button
                type="button"
                class:studio-segmented--active={advanceMode === 'auto'}
                onclick={() => onUpdateAdvanceMode('auto')}
              >
                {$t('storyBuilder.studio.autoAdvance')}
              </button>
            </div>
          </div>

          {#if advanceMode === 'auto'}
            <label class="studio-field studio-field--inline">
              <span>{$t('storyBuilder.studio.delaySeconds')}</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={delaySec}
                onchange={(event) => {
                  const val = Number((event.currentTarget as HTMLInputElement).value);
                  if (Number.isFinite(val) && val >= 0) {
                    onUpdateDelay(Math.round(val * 1000));
                  }
                }}
              />
            </label>
          {/if}
        </section>

        {#if supportsLayers}
          <section class="studio-section">
            <div class="studio-section__head">
              <h3>{$t('storyBuilder.studio.layersTitle')}</h3>
            </div>
            <div class="studio-layers">
              {#each layers as layer, idx (layer.id)}
                {@const opacity = layerOpacities[layer.id] ?? 1}
                <label class="studio-layer">
                  <div class="studio-layer__meta">
                    <span>{layer.label || `Layer ${idx + 1}`}</span>
                    <span>{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={opacity}
                    oninput={(event) =>
                      onUpdateLayerOpacity(
                        layer.id,
                        Number((event.currentTarget as HTMLInputElement).value),
                      )}
                  />
                </label>
              {/each}
            </div>
          </section>
        {/if}
      {:else if mode === 'annotate'}
        <section class="studio-section" data-testid="studio-annotate-panel">
          {#if (chapter.drawingAnnotations?.length ?? 0) === 0}
            <p class="studio-hint">{$t('storyBuilder.studio.annotateEmptyHint')}</p>
          {/if}
          <StoryBuilderWideAnnotations
            story={storyStore}
            layout="inspector"
            selectedChapterId={chapterIdStore}
            selectedAnnotationId={selectedAnnotationIdStore}
            {language}
            onDeleteDrawing={onDeleteAnnotation}
            onEditDrawing={toggleAnnotation}
          />
          {#if annotationSelected}
            <div class="studio-annotation-editor" data-testid="annotation-options">
              <StoryBuilderWideAnnotationOptions
                story={storyStore}
                layout="inspector"
                selectedChapterId={chapterIdStore}
                selectedAnnotationId={selectedAnnotationIdStore}
                {language}
                {languages}
                onSetLabel={onSetAnnotationLabel}
                onSetStyle={onSetAnnotationStyle}
              />
            </div>
          {/if}
        </section>
      {:else if mode === 'audio'}
        <StudioInspectorAudio
          {story}
          {chapter}
          {audioTrack}
          {isAvChapter}
          {isVideoChapter}
          {language}
          {languages}
          {onLanguageChange}
          {onSetNarrationTrack}
          {onSkipNarration}
          {onSelectAudioTrack}
        />
      {/if}
    </div>
  {/if}
</aside>

<style>
  .studio-inspector {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    min-width: 0;
    background: var(--viewer-panel, #111720);
    border-left: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    color: var(--viewer-text, #e8edf4);
    overflow: hidden;
  }

  .studio-inspector__empty {
    display: grid;
    align-content: center;
    gap: 6px;
    padding: 24px 18px;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 13px;
  }

  .studio-inspector__empty strong {
    color: var(--viewer-text, #e8edf4);
    font-size: 14px;
  }

  .studio-inspector__header {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: 12px 14px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }

  .studio-inspector__eyebrow {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-inspector__source {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    font-size: 11.5px;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-inspector__source > span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .studio-inspector__source-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: transparent;
    color: var(--story-builder-accent, #2ac7ff);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-inspector__source-btn:hover {
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 12%, transparent);
  }

  .studio-inspector__source-btn :global(svg) {
    width: 12px;
    height: 12px;
  }

  .studio-inspector__body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 14px 14px 24px;
  }

  .studio-section {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.07));
  }

  .studio-section:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .studio-section__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .studio-section__head h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .studio-field--inline {
    grid-template-columns: minmax(0, 1fr) 84px;
    align-items: center;
  }

  .studio-field span {
    font-size: 11px;
    font-weight: 600;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-field input {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: var(--viewer-input-bg, rgba(6, 10, 16, 0.6));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12.5px;
    box-sizing: border-box;
  }

  .studio-segmented {
    display: inline-flex;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
  }

  .studio-segmented button {
    height: 24px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-segmented .studio-segmented--active {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-layers {
    display: grid;
    gap: 8px;
  }

  .studio-layer {
    display: grid;
    gap: 4px;
    font-size: 12px;
  }

  .studio-layer__meta {
    display: flex;
    justify-content: space-between;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-annotation-editor {
    padding-top: 10px;
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }

  /* Theme ChapterTextForm inputs cleanly inside StudioInspector */
  .studio-inspector :global(.chapter-text-form) {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .studio-inspector :global(.chapter-overlay__field),
  .studio-inspector :global(.chapter-overlay__label) {
    display: grid;
    gap: 5px;
    min-width: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-inspector :global(.chapter-overlay__section-title) {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-inspector :global(.chapter-overlay__input),
  .studio-inspector :global(.chapter-overlay__textarea) {
    width: 100%;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-input-bg, rgba(6, 10, 16, 0.6));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    line-height: 1.45;
    box-sizing: border-box;
    transition: border-color 120ms ease;
  }

  .studio-inspector :global(.chapter-overlay__input:focus),
  .studio-inspector :global(.chapter-overlay__textarea:focus) {
    outline: none;
    border-color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-inspector :global(.chapter-overlay__textarea) {
    resize: vertical;
    min-height: 76px;
  }
</style>
