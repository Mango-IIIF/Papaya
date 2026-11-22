<script lang="ts">
  import { Film, Headphones, Mic, Play } from '@lucide/svelte';
  import type { Readable } from 'svelte/store';
  import type { MediaSource, MediaType } from '@mango-iiif/iiif-viewer/core';
  import type { Chapter, StoryState } from '../../core/types/story';
  import type { MediaMarksState } from '../mediaMarks';
  import StoryBuilderWideNarration from '../ui/StoryBuilderWideNarration.svelte';
  import StoryBuilderWideMediaTiming from '../ui/StoryBuilderWideMediaTiming.svelte';
  import StudioCameraTimeline from './StudioCameraTimeline.svelte';
  import type { StudioMode } from './StudioToolbar.svelte';
  import { t } from '../../core/i18n';

  interface Props {
    mode: StudioMode;
    audioTrack: 'narration' | 'media';
    storyStore: Readable<StoryState>;
    story: StoryState;
    selectedChapterIdStore: Readable<string | null>;
    chapter: Chapter | null;
    language: string;
    languages: string[];
    mediaTypeStore: Readable<MediaType | null>;
    mediaType: MediaType | null;
    mediaSourcesStore: Readable<MediaSource[]>;
    mediaMarksStore: Readable<MediaMarksState>;
    avMarksValidStore: Readable<boolean>;
    selectedPointId: string | null;
    motionPreviewing: boolean;
    onSelectAudioTrack: (track: 'narration' | 'media') => void;
    onOpenAudioTrack: (track: 'narration' | 'media') => void;
    onSaveView: () => void;
    onAddShot: (atTimeMs?: number) => void;
    onGoToShot: (id: string) => void;
    onSelectShot: (id: string | null) => void;
    onMoveShotTime: (id: string, timeMs: number, maxDurationMs?: number) => void;
    onEvenSpaceShots: () => void;
    onScrubTo: (timeMs: number) => void;
    onPreviewMotion: (options?: { startMs?: number; withAudio?: boolean }) => void;
    onStopMotionPreview: () => void;
    onUpdateMotionDuration: (durationMs: number) => void;
    onPreviewChapter: (chapterId: string) => void;
    onSetNarrationTrack: (lang: string, src: string) => void;
    onAssignNarrationSegment: (lang: string, start: number, end: number) => void;
    onSkipNarration: (lang: string) => void;
    onAssignMediaSegment: (start: number, end: number) => void;
    onPreviewMediaSegment: () => void;
    onStopPreviewMediaSegment: () => void;
  }

  let {
    mode,
    audioTrack,
    storyStore,
    story,
    selectedChapterIdStore,
    chapter,
    language,
    languages,
    mediaTypeStore,
    mediaType,
    mediaSourcesStore,
    mediaMarksStore,
    avMarksValidStore,
    selectedPointId,
    motionPreviewing,
    onSelectAudioTrack,
    onOpenAudioTrack,
    onSaveView,
    onAddShot,
    onGoToShot,
    onSelectShot,
    onMoveShotTime,
    onEvenSpaceShots,
    onScrubTo,
    onPreviewMotion,
    onStopMotionPreview,
    onUpdateMotionDuration,
    onPreviewChapter,
    onSetNarrationTrack,
    onAssignNarrationSegment,
    onSkipNarration,
    onAssignMediaSegment,
    onPreviewMediaSegment,
    onStopPreviewMediaSegment,
  }: Props = $props();

  const formatMmSs = (sec: number): string => {
    const whole = Math.max(0, Math.floor(sec));
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  let isAvChapter = $derived(
    mediaType === 'audio' || mediaType === 'video' || Boolean(chapter?.media),
  );
  let isVideoChapter = $derived(
    mediaType === 'video' || $mediaSourcesStore.some((src) => src.type === 'video'),
  );
  let canFrame = $derived(
    Boolean(chapter) && !isAvChapter && mediaType !== 'model' && !chapter?.model,
  );
  let mediaRangeLabel = $derived(
    chapter?.media && chapter.media.end > chapter.media.start
      ? `${formatMmSs(chapter.media.start)}–${formatMmSs(chapter.media.end)}`
      : $t('storyBuilder.studio.whole'),
  );
  let narrationSegment = $derived.by(() => {
    const map = chapter?.narrationSegment ?? {};
    const preferred = map[language];
    if (preferred && preferred.end > preferred.start) return preferred;
    const fallback = Object.values(map).find((seg) => seg && seg.end > seg.start);
    return fallback ?? null;
  });
  let narrationRangeLabel = $derived(
    narrationSegment && narrationSegment.end > narrationSegment.start
      ? `${formatMmSs(narrationSegment.start)}–${formatMmSs(narrationSegment.end)}`
      : $t('storyBuilder.studio.none'),
  );
</script>

{#if chapter && mode === 'audio'}
  <section class="studio-dock studio-dock--audio" data-testid="studio-audio-dock">
    {#if isAvChapter}
      <div
        class="studio-dock__audio-tabs"
        role="tablist"
        aria-label={$t('storyBuilder.studio.audioTrackSwitchAria')}
      >
        <button
          type="button"
          role="tab"
          class="studio-dock__audio-tab"
          class:studio-dock__audio-tab--active={audioTrack === 'narration'}
          aria-selected={audioTrack === 'narration'}
          data-testid="studio-audio-tab-narration"
          onclick={() => onSelectAudioTrack('narration')}
        >
          <Mic aria-hidden="true" />
          <span>{$t('storyBuilder.studio.narrationTab')}</span>
          <time>{narrationRangeLabel}</time>
        </button>

        <button
          type="button"
          role="tab"
          class="studio-dock__audio-tab"
          class:studio-dock__audio-tab--active={audioTrack === 'media'}
          aria-selected={audioTrack === 'media'}
          data-testid="studio-audio-tab-media"
          onclick={() => onSelectAudioTrack('media')}
        >
          {#if isVideoChapter}
            <Film aria-hidden="true" />
            <span>{$t('storyBuilder.studio.iiifVideoTab')}</span>
          {:else}
            <Headphones aria-hidden="true" />
            <span>{$t('storyBuilder.studio.iiifAudioTab')}</span>
          {/if}
          <time>{mediaRangeLabel}</time>
        </button>
      </div>
    {/if}

    {#if isAvChapter && audioTrack === 'media'}
      <StoryBuilderWideMediaTiming
        story={storyStore}
        selectedChapterId={selectedChapterIdStore}
        mediaType={mediaTypeStore}
        mediaSources={mediaSourcesStore}
        mediaMarks={mediaMarksStore}
        marksValid={avMarksValidStore}
        {onAssignMediaSegment}
        onPreview={onPreviewMediaSegment}
        onStopPreview={onStopPreviewMediaSegment}
      />
    {:else}
      <StoryBuilderWideNarration
        story={storyStore}
        selectedChapterId={selectedChapterIdStore}
        {language}
        {languages}
        {onSetNarrationTrack}
        {onAssignNarrationSegment}
        {onSkipNarration}
      />
    {/if}
  </section>
{:else if chapter && mode === 'frame' && isAvChapter}
  <section class="studio-dock studio-dock--frame studio-dock--av-summary" data-testid="studio-av-summary">
    <button
      type="button"
      class="studio-dock__av-pill"
      data-testid="studio-av-edit-narration"
      onclick={() => onOpenAudioTrack('narration')}
    >
      <Mic aria-hidden="true" />
      <span>{$t('storyBuilder.studio.narrationTab')}</span>
      <time>{narrationRangeLabel}</time>
    </button>

    <button
      type="button"
      class="studio-dock__av-pill"
      data-testid="studio-av-edit-media"
      onclick={() => onOpenAudioTrack('media')}
    >
      {#if isVideoChapter}
        <Film aria-hidden="true" />
        <span>{$t('storyBuilder.studio.iiifVideoTab')}</span>
      {:else}
        <Headphones aria-hidden="true" />
        <span>{$t('storyBuilder.studio.iiifAudioTab')}</span>
      {/if}
      <time>{mediaRangeLabel}</time>
    </button>

    <div class="studio-dock__spacer"></div>

    <button
      type="button"
      class="studio-dock__btn"
      data-testid="chapter-preview"
      onclick={() => onPreviewChapter(chapter.id)}
    >
      <Play aria-hidden="true" />
      <span>{$t('storyBuilder.studio.previewChapterShort')}</span>
    </button>
  </section>
{:else if chapter && mode === 'frame' && !isAvChapter}
  <StudioCameraTimeline
    {story}
    {chapter}
    {language}
    {canFrame}
    {selectedPointId}
    {motionPreviewing}
    {onSaveView}
    {onAddShot}
    {onGoToShot}
    {onSelectShot}
    {onMoveShotTime}
    {onEvenSpaceShots}
    {onScrubTo}
    {onPreviewMotion}
    {onStopMotionPreview}
    {onUpdateMotionDuration}
    {onPreviewChapter}
  />
{/if}

<style>
  .studio-dock {
    background: var(--viewer-panel, #111720);
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    color: var(--viewer-text, #e8edf4);
    min-width: 0;
  }

  .studio-dock--frame {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 50px;
    padding: 0 14px;
    box-sizing: border-box;
  }

  .studio-dock--audio {
    display: grid;
    gap: 10px;
    max-height: 350px;
    overflow: auto;
    padding: 10px 16px 12px;
  }

  .studio-dock__audio-tabs {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .studio-dock__audio-tab,
  .studio-dock__av-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .studio-dock__audio-tab:hover,
  .studio-dock__av-pill:hover {
    color: var(--viewer-text, #e8edf4);
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-dock__audio-tab--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 16%, transparent);
    color: var(--viewer-text, #e8edf4);
  }

  .studio-dock__audio-tab :global(svg),
  .studio-dock__av-pill :global(svg) {
    width: 14px;
    height: 14px;
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-dock__audio-tab time,
  .studio-dock__av-pill time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }

  .studio-dock__spacer {
    flex: 1 1 auto;
  }

  .studio-dock__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .studio-dock__btn:hover:not(:disabled) {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-dock__btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  @media (max-width: 720px) {
    .studio-dock__btn span {
      display: none;
    }

    .studio-dock__btn {
      width: 30px;
      padding: 0;
    }
  }
</style>
