<script lang="ts">
  import { ChevronLeft, ChevronRight, Crosshair, Plus, Trash2 } from '@lucide/svelte';
  import type { Chapter, ChapterCameraTrack } from '../../core/types/story';
  import { animatableCameraDurationMs, balanceCameraTrackKeyframes } from '../cameraTrack';
  import { t } from '../../core/i18n';

  interface Props {
    chapter: Chapter;
    language: string;
    selectedPointId: string | null;
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
    onUpdateMotionEasing: (easing: NonNullable<ChapterCameraTrack['easing']>) => void;
    onEvenSpaceShots: () => void;
  }

  let {
    chapter,
    language,
    selectedPointId,
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
  }: Props = $props();

  const PRESETS: Array<{
    id: NonNullable<ChapterCameraTrack['preset']>;
    labelKey: string;
  }> = [
    { id: 'zoom-in', labelKey: 'storyBuilder.motion.preset.zoom-in' },
    { id: 'zoom-out', labelKey: 'storyBuilder.motion.preset.zoom-out' },
    { id: 'pan', labelKey: 'storyBuilder.motion.preset.pan' },
  ];

  const clock = (timeMs: number): string => {
    const total = Math.max(0, Math.round(timeMs / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  let track = $derived(chapter.cameraTrack);
  let shots = $derived(track ? balanceCameraTrackKeyframes(track) : []);
  let hasMotion = $derived(shots.length >= 2);
  let durationMs = $derived(
    track && hasMotion ? Math.max(1, animatableCameraDurationMs(track)) : 0,
  );
  let narrationSegment = $derived(chapter.narrationSegment?.[language] ?? null);
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
  let durationSec = $derived(Math.round(((track?.durationMs ?? 5000) / 1000) * 10) / 10);
  let dwellSec = $derived(
    Math.round(((track?.keyframes?.[0]?.dwellMs ?? 0) / 1000) * 10) / 10,
  );
</script>

<section class="studio-section" data-testid="studio-camera-section">
  <div class="studio-section__head">
    <h3>{$t('storyBuilder.studio.cameraMotion')}</h3>
    <span class="studio-section__meta">
      {#if hasMotion}
        {$t('storyBuilder.studio.shotsMeta', {
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
            onclick={() => (isSelected ? onSelectShot(null) : onGoToShot(point.id))}
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
              (event.currentTarget as HTMLSelectElement).value as 'linear' | 'spline',
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

<style>
  .studio-section {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.07));
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

  .studio-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--viewer-muted, #9aa6b2);
  }
</style>
