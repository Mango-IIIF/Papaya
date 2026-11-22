<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    CirclePlay,
    Film,
    Headphones,
    Mic,
    Play,
    Plus,
    Scan,
    Square,
    Volume2,
    VolumeX,
  } from '@lucide/svelte';
  import type { Readable } from 'svelte/store';
  import type { MediaSource, MediaType } from '@mango-iiif/iiif-viewer/core';
  import type { Chapter, StoryState } from '../../core/types/story';
  import type { MediaMarksState } from '../mediaMarks';
  import {
    animatableCameraDurationMs,
    balanceCameraTrackKeyframes,
  } from '../cameraTrack';
  import { loadAudioSlicePeaks } from '../audioWaveform';
  import StoryBuilderWideNarration from '../ui/StoryBuilderWideNarration.svelte';
  import StoryBuilderWideMediaTiming from '../ui/StoryBuilderWideMediaTiming.svelte';
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
    onMoveShotTime: (id: string, timeMs: number) => void;
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

  let trackEl: HTMLDivElement | null = $state(null);
  let audioMuted = $state(false);
  let waveformPeaks = $state<number[]>([]);
  let lastWaveformKey = '';
  let waveformRequest = 0;

  let elapsedMs = $state(0);
  let scrubbed = $state(false);
  let playheadFrame: number | null = null;
  let playheadStartedAt = 0;
  let playheadOriginMs = 0;
  let lastChapterId: string | null = null;

  let track = $derived(chapter?.cameraTrack);
  let points = $derived(track ? balanceCameraTrackKeyframes(track) : []);
  let hasMotion = $derived(points.length >= 2);
  let durationMs = $derived(
    track && hasMotion ? Math.max(1, animatableCameraDurationMs(track)) : 0,
  );
  let isAvChapter = $derived(
    mediaType === 'audio' || mediaType === 'video' || Boolean(chapter?.media),
  );
  let isVideoChapter = $derived(
    mediaType === 'video' || $mediaSourcesStore.some((src) => src.type === 'video'),
  );
  let canFrame = $derived(
    Boolean(chapter) && !isAvChapter && mediaType !== 'model' && !chapter?.model,
  );

  const formatMmSs = (sec: number): string => {
    const whole = Math.max(0, Math.floor(sec));
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  let mediaRangeLabel = $derived(
    chapter?.media && chapter.media.end > chapter.media.start
      ? `${formatMmSs(chapter.media.start)}–${formatMmSs(chapter.media.end)}`
      : $t('storyBuilder.studio.whole'),
  );

  let narrationEntry = $derived.by(() => {
    const map = chapter?.narrationSegment ?? {};
    const preferred = map[language];
    if (preferred && preferred.end > preferred.start) {
      return { lang: language, segment: preferred };
    }
    const fallback = Object.entries(map).find(([, seg]) => seg && seg.end > seg.start);
    return fallback ? { lang: fallback[0], segment: fallback[1] } : null;
  });
  let narrationSegment = $derived(narrationEntry?.segment ?? null);
  let narrationSrc = $derived(
    narrationEntry ? (story.narration?.tracks?.[narrationEntry.lang]?.src ?? '') : '',
  );
  let narrationRangeLabel = $derived(
    narrationSegment && narrationSegment.end > narrationSegment.start
      ? `${formatMmSs(narrationSegment.start)}–${formatMmSs(narrationSegment.end)}`
      : $t('storyBuilder.studio.none'),
  );
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
  let timelineSpanMs = $derived(durationMs || narrationMs || (track?.durationMs ?? 5000));
  let showTimeline = $derived(hasMotion || narrationMs > 0);

  $effect(() => {
    const id = chapter?.id ?? null;
    if (id !== lastChapterId) {
      lastChapterId = id;
      elapsedMs = 0;
      scrubbed = false;
    }
  });

  $effect(() => {
    const key =
      narrationSrc && narrationSegment
        ? `${narrationSrc}:${narrationSegment.start}:${narrationSegment.end}`
        : '';
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
          96,
        ).then((peaks) => {
          if (req === waveformRequest) waveformPeaks = peaks ?? [];
        });
      }
    }
  });

  const stopPlayhead = (resetToZero = true) => {
    if (playheadFrame !== null && typeof cancelAnimationFrame === 'function') {
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

  $effect(() => {
    if (motionPreviewing) {
      if (playheadFrame === null && typeof requestAnimationFrame === 'function') {
        playheadStartedAt = performance.now();
        playheadOriginMs = elapsedMs >= durationMs ? 0 : elapsedMs;
        playheadFrame = requestAnimationFrame(tickPlayhead);
      }
    } else if (playheadFrame !== null) {
      stopPlayhead(elapsedMs >= durationMs);
    }
  });

  onDestroy(() => stopPlayhead(true));

  const position = (timeMs: number): string =>
    timelineSpanMs > 0
      ? `${Math.max(0, Math.min(100, (timeMs / timelineSpanMs) * 100))}%`
      : '0%';

  const clock = (timeMs: number): string => {
    const total = Math.max(0, timeMs) / 1000;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    const whole = Math.floor(s);
    const tenth = Math.floor((s - whole) * 10);
    return `${m}:${String(whole).padStart(2, '0')}${tenth ? `.${tenth}` : ''}`;
  };

  const timeMsFromClientX = (clientX: number): number => {
    if (!trackEl || timelineSpanMs <= 0) return 0;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * timelineSpanMs);
  };

  let draggingMarkerId = $state<string | null>(null);
  let markerMoved = false;

  const startMarkerDrag = (event: PointerEvent, pointId: string) => {
    event.preventDefault();
    event.stopPropagation();
    draggingMarkerId = pointId;
    markerMoved = false;
    onSelectShot(pointId);
    const startX = event.clientX;
    try {
      trackEl?.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events in unit tests may not have an active pointer id.
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (draggingMarkerId !== pointId) return;
      if (Math.abs(moveEvent.clientX - startX) > 3) markerMoved = true;
      if (!markerMoved) return;
      const nextTime = timeMsFromClientX(moveEvent.clientX);
      elapsedMs = nextTime;
      scrubbed = true;
      onMoveShotTime(pointId, nextTime);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try {
        trackEl?.releasePointerCapture?.(event.pointerId);
      } catch {
        // Ignore if capture was already released.
      }
      draggingMarkerId = null;
      if (markerMoved) {
        setTimeout(() => {
          markerMoved = false;
        }, 0);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleTrackPointerDown = (event: PointerEvent) => {
    if (!timelineSpanMs) return;
    if ((event.target as HTMLElement)?.closest('.studio-dock__marker')) return;
    const applyScrub = (clientX: number) => {
      const nextTime = timeMsFromClientX(clientX);
      elapsedMs = nextTime;
      scrubbed = true;
      if (hasMotion) onScrubTo(nextTime);
    };
    applyScrub(event.clientX);
    const onMove = (moveEvent: PointerEvent) => applyScrub(moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handlePlayToggle = () => {
    if (motionPreviewing) {
      onStopMotionPreview();
      return;
    }
    const startMs = elapsedMs >= durationMs ? 0 : elapsedMs;
    if (startMs === 0) elapsedMs = 0;
    onPreviewMotion({ startMs, withAudio: !audioMuted });
  };
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
  <section class="studio-dock studio-dock--frame" data-testid="camera-timeline">
    {#if showTimeline}
      <button
        type="button"
        class="studio-dock__icon-btn"
        data-testid="camera-timeline-play"
        disabled={!hasMotion}
        aria-label={motionPreviewing
          ? $t('storyBuilder.motion.stopPreview')
          : $t('storyBuilder.motion.preview')}
        title={motionPreviewing
          ? $t('storyBuilder.motion.stopPreview')
          : $t('storyBuilder.motion.preview')}
        onclick={handlePlayToggle}
      >
        {#if motionPreviewing}
          <Square aria-hidden="true" />
        {:else}
          <CirclePlay aria-hidden="true" />
        {/if}
      </button>

      <span class="studio-dock__time" data-testid="camera-timeline-time">
        {clock(elapsedMs)} / {clock(durationMs || timelineSpanMs)}
      </span>

      <div
        bind:this={trackEl}
        class="studio-dock__track"
        role="slider"
        tabindex="0"
        aria-label={$t('storyBuilder.cameraTimeline.scrub')}
        aria-valuemin={0}
        aria-valuemax={timelineSpanMs}
        aria-valuenow={elapsedMs}
        data-testid="camera-timeline-track"
        onpointerdown={handleTrackPointerDown}
      >
        {#if waveformPeaks.length > 0}
          <div class="studio-dock__waveform" aria-hidden="true" data-testid="camera-timeline-waveform">
            {#each waveformPeaks as peak}
              <span style={`height:${Math.round(peak * 100)}%`}></span>
            {/each}
          </div>
        {/if}
        <div class="studio-dock__line" aria-hidden="true"></div>
        {#if motionPreviewing || scrubbed}
          <div
            class="studio-dock__playhead"
            aria-hidden="true"
            style={`--pos:${position(elapsedMs)}`}
          ></div>
        {/if}
        {#each points as point, index (point.id)}
          <button
            type="button"
            class="studio-dock__marker"
            class:studio-dock__marker--selected={selectedPointId === point.id}
            class:studio-dock__marker--dragging={draggingMarkerId === point.id}
            data-testid={`camera-timeline-marker-${index + 1}`}
            style={`--pos:${position(point.timeMs)}`}
            aria-label={$t('storyBuilder.cameraTimeline.goTo', {
              number: index + 1,
              time: clock(point.timeMs),
            })}
            aria-pressed={selectedPointId === point.id}
            onpointerdown={(event) => startMarkerDrag(event, point.id)}
            onclick={() => {
              if (!markerMoved) onGoToShot(point.id);
              markerMoved = false;
            }}
          >
            <span></span>
          </button>
        {/each}
      </div>

      {#if narrationSrc && narrationMs > 0}
        <button
          type="button"
          class="studio-dock__icon-btn"
          data-testid="camera-timeline-audio-toggle"
          aria-pressed={audioMuted}
          aria-label={audioMuted
            ? $t('storyBuilder.cameraTimeline.unmuteAudio')
            : $t('storyBuilder.cameraTimeline.muteAudio')}
          onclick={() => (audioMuted = !audioMuted)}
        >
          {#if audioMuted}
            <VolumeX aria-hidden="true" />
          {:else}
            <Volume2 aria-hidden="true" />
          {/if}
        </button>
      {/if}

      {#if canMatchNarration}
        <button
          type="button"
          class="studio-dock__btn"
          data-testid="camera-timeline-match-narration"
          onclick={() => onUpdateMotionDuration(narrationMs - holdMs)}
        >
          {$t('storyBuilder.cameraTimeline.matchNarration')}
        </button>
      {/if}
    {:else}
      <div class="studio-dock__spacer"></div>
    {/if}

    {#if canFrame}
      <button
        type="button"
        class="studio-dock__btn"
        data-testid="chapter-position-from-view"
        title={$t('storyBuilder.position.setFromViewHint')}
        onclick={onSaveView}
      >
        <Scan aria-hidden="true" />
        <span>{$t('storyBuilder.studio.saveView')}</span>
      </button>
    {/if}

    <button
      type="button"
      class="studio-dock__btn studio-dock__btn--primary"
      data-testid="camera-timeline-capture"
      onclick={() => onAddShot(scrubbed || motionPreviewing ? elapsedMs : undefined)}
    >
      <Plus aria-hidden="true" />
      <span>{$t('storyBuilder.studio.addShot')}</span>
    </button>

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
    justify-self: start;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
  }

  .studio-dock__audio-tab,
  .studio-dock__av-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .studio-dock__av-pill {
    height: 32px;
    border-color: var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: var(--viewer-text, #e8edf4);
  }

  .studio-dock__audio-tab:hover,
  .studio-dock__av-pill:hover {
    color: var(--viewer-text, #e8edf4);
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.09));
  }

  .studio-dock__audio-tab--active {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-dock__audio-tab--active:hover {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-dock__audio-tab time,
  .studio-dock__av-pill time {
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 14%, transparent);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .studio-dock__audio-tab :global(svg),
  .studio-dock__av-pill :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-dock__spacer {
    flex: 1 1 auto;
  }

  .studio-dock__time {
    flex: 0 0 auto;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--viewer-muted, #9aa6b2);
    white-space: nowrap;
  }

  .studio-dock__track {
    position: relative;
    flex: 1 1 auto;
    min-width: 80px;
    height: 30px;
    cursor: pointer;
    touch-action: none;
  }

  .studio-dock__waveform {
    position: absolute;
    inset: 3px 0;
    display: flex;
    align-items: center;
    gap: 1px;
    pointer-events: none;
  }

  .studio-dock__waveform span {
    flex: 1 1 0;
    min-height: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 32%, transparent);
  }

  .studio-dock__line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 24%, transparent);
  }

  .studio-dock__playhead {
    position: absolute;
    left: var(--pos);
    top: 2px;
    bottom: 2px;
    width: 2px;
    margin-left: -1px;
    background: var(--story-builder-accent, #2ac7ff);
    pointer-events: none;
    z-index: 3;
  }

  .studio-dock__marker {
    position: absolute;
    left: var(--pos);
    top: 50%;
    z-index: 4;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translate(-50%, -50%);
    cursor: grab;
    touch-action: none;
  }

  .studio-dock__marker--dragging {
    cursor: grabbing;
  }

  .studio-dock__marker span {
    display: block;
    width: 12px;
    height: 12px;
    margin: 6px;
    box-sizing: border-box;
    border: 2px solid var(--viewer-text, #e8edf4);
    border-radius: 50%;
    background: var(--viewer-panel, #111720);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }

  .studio-dock__marker--selected span {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: var(--story-builder-accent, #2ac7ff);
  }

  .studio-dock__marker:hover span,
  .studio-dock__marker--dragging span {
    transform: scale(1.22);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 30%, transparent);
  }

  .studio-dock__icon-btn,
  .studio-dock__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    gap: 6px;
    height: 32px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .studio-dock__icon-btn {
    width: 32px;
    padding: 0;
  }

  .studio-dock__btn {
    padding: 0 11px;
  }

  .studio-dock__icon-btn:hover:not(:disabled),
  .studio-dock__btn:hover:not(:disabled) {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-dock__icon-btn:disabled,
  .studio-dock__btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .studio-dock__btn--primary {
    border-color: transparent;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-dock__btn--primary:hover:not(:disabled) {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }

  .studio-dock__icon-btn :global(svg),
  .studio-dock__btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  @media (max-width: 720px) {
    .studio-dock__btn span {
      display: none;
    }

    .studio-dock__btn {
      width: 32px;
      padding: 0;
    }
  }
</style>
