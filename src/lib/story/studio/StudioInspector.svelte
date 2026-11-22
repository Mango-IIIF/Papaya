<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    Crosshair,
    FolderOpen,
    Plus,
    Trash2,
  } from '@lucide/svelte';
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
  import {
    animatableCameraDurationMs,
    balanceCameraTrackKeyframes,
  } from '../cameraTrack';
  import { resolveIiifText } from '../manifestAttribution';
  import ChapterTextForm from '../ui/ChapterTextForm.svelte';
  import StoryBuilderWideAnnotations from '../ui/StoryBuilderWideAnnotations.svelte';
  import StoryBuilderWideAnnotationOptions from '../ui/StoryBuilderWideAnnotationOptions.svelte';
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

  let track = $derived(chapter?.cameraTrack);
  let shots = $derived(track ? balanceCameraTrackKeyframes(track) : []);
  let hasMotion = $derived(shots.length >= 2);
  let durationMs = $derived(
    track && hasMotion ? Math.max(1, animatableCameraDurationMs(track)) : 0,
  );
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

  let narrationSegment = $derived(chapter?.narrationSegment?.[language] ?? null);
  let narrationMs = $derived(
    narrationSegment && narrationSegment.end > narrationSegment.start
      ? Math.round((narrationSegment.end - narrationSegment.start) * 1000)
      : 0,
  );
  let holdMs = $derived(
    track && hasMotion && track.timingMode !== 'custom'
      ? Math.max(0, durationMs - track.durationMs)
      : 0,
  );
  let canMatchNarration = $derived(
    hasMotion && narrationMs > holdMs && Math.abs(narrationMs - durationMs) > 100,
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

  let audioUrlDraft = $state('');
  let lastAudioSyncKey = '';
  $effect(() => {
    const src = story.narration?.tracks?.[language]?.src ?? '';
    const key = `${language}::${src}`;
    if (key !== lastAudioSyncKey) {
      lastAudioSyncKey = key;
      audioUrlDraft = src;
    }
  });

  const clock = (ms: number): string => {
    const total = Math.max(0, ms) / 1000;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    const whole = Math.floor(s);
    const tenth = Math.floor((s - whole) * 10);
    return `${m}:${String(whole).padStart(2, '0')}${tenth ? `.${tenth}` : ''}`;
  };

  const formatHms = (sec: number): string => {
    const total = Math.max(0, Math.floor(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  let advanceMode = $derived<ChapterAdvance['mode']>(
    chapter?.advance?.mode ?? 'manual',
  );
  let delaySec = $derived(
    Math.round(((chapter?.advance?.delayMs ?? 2000) / 1000) * 10) / 10,
  );
  let durationSec = $derived(
    Math.round(((track?.durationMs ?? 5000) / 1000) * 10) / 10,
  );
  let dwellSec = $derived(
    Math.round(((track?.keyframes?.[0]?.dwellMs ?? 0) / 1000) * 10) / 10,
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

  const PRESETS: Array<{
    id: NonNullable<ChapterCameraTrack['preset']>;
    labelKey: string;
  }> = [
    { id: 'zoom-in', labelKey: 'storyBuilder.motion.preset.zoom-in' },
    { id: 'zoom-out', labelKey: 'storyBuilder.motion.preset.zoom-out' },
    { id: 'pan', labelKey: 'storyBuilder.motion.preset.pan' },
  ];
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
    <header class="studio-inspector__header">
      <div class="studio-inspector__eyebrow">
        {$t('storyBuilder.chapters.number', { number: chapterIndex + 1 })}
      </div>
      {#if chapterSourceTitle}
        <div class="studio-inspector__source" data-testid="chapter-source-context">
          <span title={chapter.manifest}>
            {chapterSourceTitle} · {$t('storyBuilder.sources.canvasNumber', {
              number: chapter.canvasIndex + 1,
            })}
          </span>
          <button
            type="button"
            class="studio-inspector__source-btn"
            data-testid="chapter-change-source"
            onclick={onOpenSources}
          >
            <FolderOpen aria-hidden="true" />
            <span>{$t('storyBuilder.studio.switchSource')}</span>
          </button>
        </div>
      {/if}
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
          <section class="studio-section" data-testid="studio-motion-section">
            <div class="studio-section__head">
              <h3>{$t('storyBuilder.studio.cameraMotion')}</h3>
              <span class="studio-section__meta">
                {#if hasMotion}
                  {$t('storyBuilder.studio.shotsSummary', {
                    count: shots.length,
                    duration: clock(durationMs),
                  })}
                {:else}
                  {$t('storyBuilder.studio.staticFraming')}
                {/if}
              </span>
            </div>

            {#if chapter.viewBox}
              <div class="studio-presets" role="group" aria-label={$t('storyBuilder.studio.cameraMotion')}>
                <button
                  type="button"
                  class="studio-chip"
                  class:studio-chip--active={!hasMotion}
                  onclick={onClearMotion}
                >
                  {$t('storyBuilder.studio.presetStatic')}
                </button>
                {#each PRESETS as preset}
                  <button
                    type="button"
                    class="studio-chip"
                    class:studio-chip--active={hasMotion && track?.preset === preset.id}
                    data-testid={`studio-preset-${preset.id}`}
                    onclick={() => onApplyPreset(preset.id)}
                  >
                    {$t(preset.labelKey)}
                  </button>
                {/each}
              </div>
            {/if}

            {#if shots.length > 0}
              <div class="studio-shots">
                {#each shots as point, index (point.id)}
                  {@const isSelected = selectedPointId === point.id}
                  <div
                    class="studio-shot"
                    class:studio-shot--selected={isSelected}
                    data-testid={`studio-shot-${index + 1}`}
                  >
                    <button
                      type="button"
                      class="studio-shot__select"
                      aria-pressed={isSelected}
                      onclick={() =>
                        isSelected ? onSelectShot(null) : onGoToShot(point.id)}
                    >
                      <b>{index + 1}</b>
                      <span>{$t('storyBuilder.studio.shotLabel', { number: index + 1 })}</span>
                      <time>{clock(point.timeMs)}</time>
                    </button>

                    <div class="studio-shot__actions">
                      <button
                        type="button"
                        class="studio-shot__btn"
                        title={$t('storyBuilder.cameraTimeline.updateFromViewHint')}
                        onclick={() => onUpdateShotFromView(point.id)}
                      >
                        <Crosshair aria-hidden="true" />
                      </button>
                      {#if shots.length >= 2}
                        <button
                          type="button"
                          class="studio-shot__btn"
                          disabled={index === 0}
                          aria-label={$t('storyBuilder.cameraTimeline.moveEarlier')}
                          title={$t('storyBuilder.cameraTimeline.moveEarlier')}
                          onclick={() => onReorderShot(point.id, -1)}
                        >
                          <ChevronLeft aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          class="studio-shot__btn"
                          disabled={index === shots.length - 1}
                          aria-label={$t('storyBuilder.cameraTimeline.moveLater')}
                          title={$t('storyBuilder.cameraTimeline.moveLater')}
                          onclick={() => onReorderShot(point.id, 1)}
                        >
                          <ChevronRight aria-hidden="true" />
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="studio-shot__btn studio-shot__btn--danger"
                        aria-label={$t('storyBuilder.cameraTimeline.deleteNumber', {
                          number: index + 1,
                        })}
                        onclick={() => onDeleteShot(point.id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if shots.length === 1}
              <p class="studio-hint">{$t('storyBuilder.studio.oneShotHint')}</p>
            {/if}

            <button
              type="button"
              class="studio-full-btn"
              data-testid="studio-add-shot"
              onclick={onAddShot}
            >
              <Plus aria-hidden="true" />
              <span>{$t('storyBuilder.studio.addShotFromView')}</span>
            </button>

            {#if hasMotion}
              <div class="studio-motion-grid">
                <label class="studio-field">
                  <span>{$t('storyBuilder.motion.durationSeconds')}</span>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={durationSec}
                    onchange={(event) => {
                      const val = Number((event.currentTarget as HTMLInputElement).value);
                      if (Number.isFinite(val) && val > 0) {
                        onUpdateMotionDuration(Math.round(val * 1000));
                      }
                    }}
                  />
                </label>

                <label class="studio-field">
                  <span>{$t('storyBuilder.motion.dwell')}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={dwellSec}
                    onchange={(event) => {
                      const val = Number((event.currentTarget as HTMLInputElement).value);
                      if (Number.isFinite(val) && val >= 0) {
                        onUpdateMotionDwell(Math.round(val * 1000));
                      }
                    }}
                  />
                </label>

                <label class="studio-field">
                  <span>{$t('storyBuilder.motion.path')}</span>
                  <select
                    value={track?.pathType ?? 'spline'}
                    onchange={(event) =>
                      onUpdateMotionPathType(
                        (event.currentTarget as HTMLSelectElement).value as
                          | 'linear'
                          | 'spline',
                      )}
                  >
                    <option value="spline">{$t('storyBuilder.motion.curved')}</option>
                    <option value="linear">{$t('storyBuilder.motion.straight')}</option>
                  </select>
                </label>

                <label class="studio-field">
                  <span>{$t('storyBuilder.motion.easing')}</span>
                  <select
                    value={track?.easing ?? 'ease-in-out'}
                    onchange={(event) =>
                      onUpdateMotionEasing(
                        (event.currentTarget as HTMLSelectElement).value as NonNullable<
                          ChapterCameraTrack['easing']
                        >,
                      )}
                  >
                    <option value="ease-in-out">{$t('storyBuilder.motion.easingOptions.ease-in-out')}</option>
                    <option value="ease-in">{$t('storyBuilder.motion.easingOptions.ease-in')}</option>
                    <option value="ease-out">{$t('storyBuilder.motion.easingOptions.ease-out')}</option>
                    <option value="linear">{$t('storyBuilder.motion.easingOptions.linear')}</option>
                  </select>
                </label>
              </div>

              {#if canMatchNarration || track?.timingMode === 'custom'}
                <div class="studio-motion-pills">
                  {#if canMatchNarration}
                    <button
                      type="button"
                      class="studio-chip"
                      onclick={() => onUpdateMotionDuration(narrationMs - holdMs)}
                    >
                      {$t('storyBuilder.cameraTimeline.matchNarration')}
                    </button>
                  {/if}
                  {#if track?.timingMode === 'custom'}
                    <button
                      type="button"
                      class="studio-chip"
                      data-testid="motion-even-space"
                      onclick={onEvenSpaceShots}
                    >
                      {$t('storyBuilder.cameraTimeline.evenSpace')}
                    </button>
                  {/if}
                </div>
              {/if}
            {/if}
          </section>
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
        <section class="studio-section" data-testid="studio-audio-panel">
          {#if isAvChapter}
            <div
              class="studio-segmented studio-segmented--full"
              role="tablist"
              aria-label={$t('storyBuilder.studio.audioTrackSwitchAria')}
            >
              <button
                type="button"
                role="tab"
                class:studio-segmented--active={audioTrack === 'narration'}
                aria-selected={audioTrack === 'narration'}
                data-testid="inspector-audio-tab-narration"
                onclick={() => onSelectAudioTrack('narration')}
              >
                {$t('storyBuilder.studio.narrationTab')}
              </button>
              <button
                type="button"
                role="tab"
                class:studio-segmented--active={audioTrack === 'media'}
                aria-selected={audioTrack === 'media'}
                data-testid="inspector-audio-tab-media"
                onclick={() => onSelectAudioTrack('media')}
              >
                {isVideoChapter
                  ? $t('storyBuilder.studio.iiifVideoTab')
                  : $t('storyBuilder.studio.iiifAudioTab')}
              </button>
            </div>
          {/if}

          {#if isAvChapter && audioTrack === 'media'}
            <div class="studio-section__head">
              <h3>{$t('storyBuilder.studio.sourceMediaTitle')}</h3>
            </div>

            <div class="studio-audio-summary" data-testid="studio-source-media-summary">
              {#if chapter.media && chapter.media.end > chapter.media.start}
                <strong>
                  {$t('storyBuilder.inspector.mediaSummary', {
                    start: formatHms(chapter.media.start),
                    end: formatHms(chapter.media.end),
                  })}
                </strong>
              {:else}
                <span>{$t('storyBuilder.inspector.mediaWhole')}</span>
              {/if}
            </div>

            <p class="studio-hint">{$t('storyBuilder.studio.sourceMediaHint')}</p>
          {:else}
            <div class="studio-section__head">
              <h3>{$t('storyBuilder.studio.audioTrackTitle')}</h3>
            </div>

            {#if languages.length > 1}
              <div class="studio-presets">
                {#each languages as lang}
                  <button
                    type="button"
                    class="studio-chip"
                    class:studio-chip--active={lang === language}
                    onclick={() => onLanguageChange(lang)}
                  >
                    {lang.toUpperCase()}
                  </button>
                {/each}
              </div>
            {/if}

            <label class="studio-field">
              <span>{$t('storyBuilder.narration.audioUrl')}</span>
              <input
                type="url"
                placeholder={$t('storyBuilder.settings.audioFileUrl')}
                bind:value={audioUrlDraft}
              />
            </label>

            <button
              type="button"
              class="studio-full-btn"
              onclick={() => onSetNarrationTrack(language, audioUrlDraft.trim())}
            >
              {$t('storyBuilder.settings.saveAudio')}
            </button>

            <div class="studio-audio-summary">
              {#if narrationSegment}
                <strong>
                  {$t('storyBuilder.inspector.narrationSummary', {
                    language: language.toUpperCase(),
                    start: formatHms(narrationSegment.start),
                    end: formatHms(narrationSegment.end),
                  })}
                </strong>
                <button
                  type="button"
                  class="studio-chip"
                  onclick={() => onSkipNarration(language)}
                >
                  {$t('storyBuilder.narration.skip')}
                </button>
              {:else}
                <span>
                  {$t('storyBuilder.inspector.narrationNone', {
                    language: language.toUpperCase(),
                  })}
                </span>
              {/if}
            </div>

            <p class="studio-hint">{$t('storyBuilder.studio.audioTrackHint')}</p>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .studio-inspector {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
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

  .studio-section__meta {
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-presets,
  .studio-motion-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .studio-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 3%, transparent);
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
  }

  .studio-chip:hover {
    color: var(--viewer-text, #e8edf4);
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 8%, transparent);
  }

  .studio-chip--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 14%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-shots {
    display: grid;
    gap: 5px;
  }

  .studio-shot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 3px 4px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 2%, transparent);
  }

  .studio-shot--selected {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 10%, transparent);
  }

  .studio-shot__select {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 5px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .studio-shot__select b {
    display: grid;
    place-items: center;
    width: 19px;
    height: 19px;
    flex: 0 0 auto;
    border-radius: 5px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 14%, transparent);
    font-size: 11px;
  }

  .studio-shot--selected .studio-shot__select b {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-shot__select time {
    margin-left: auto;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-shot__actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .studio-shot__btn {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    cursor: pointer;
  }

  .studio-shot__btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--viewer-text, #e8edf4);
  }

  .studio-shot__btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .studio-shot__btn--danger:hover:not(:disabled) {
    color: #fca5a5;
  }

  .studio-shot__btn :global(svg) {
    width: 13px;
    height: 13px;
  }

  .studio-full-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-full-btn:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-full-btn :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-motion-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
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

  .studio-field input,
  .studio-field select {
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

  .studio-segmented--full {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    box-sizing: border-box;
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

  .studio-audio-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
    font-size: 12px;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-audio-summary strong {
    color: var(--viewer-text, #e8edf4);
    font-variant-numeric: tabular-nums;
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
