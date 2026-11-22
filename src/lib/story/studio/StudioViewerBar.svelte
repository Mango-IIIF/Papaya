<script lang="ts">
  import { ChevronLeft, ChevronRight, Home, Minus, Plus } from '@lucide/svelte';
  import { t } from '../../core/i18n';

  interface Props {
    canvasIndex: number;
    canvasCount: number;
    zoomPercent: number;
    spatialChapter: boolean;
    onPrevCanvas: () => void;
    onNextCanvas: () => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onGoHome: () => void;
  }

  let {
    canvasIndex,
    canvasCount,
    zoomPercent,
    spatialChapter,
    onPrevCanvas,
    onNextCanvas,
    onZoomOut,
    onZoomIn,
    onGoHome,
  }: Props = $props();
</script>

<div
  class="studio-viewer-bar"
  data-testid="studio-viewer-controls"
  role="toolbar"
  aria-label={$t('storyBuilder.studio.viewerControlsAria')}
>
  <div class="studio-viewer-bar__group">
    <button
      type="button"
      class="studio-viewer-bar__btn"
      data-testid="studio-viewer-prev"
      disabled={canvasCount <= 1 || canvasIndex <= 0}
      aria-label={$t('storyBuilder.studio.prevCanvas')}
      title={$t('storyBuilder.studio.prevCanvas')}
      onclick={onPrevCanvas}
    >
      <ChevronLeft aria-hidden="true" />
    </button>
    <span class="studio-viewer-bar__page" data-testid="studio-viewer-page">
      {canvasCount > 0 ? `${canvasIndex + 1} / ${canvasCount}` : '1 / 1'}
    </span>
    <button
      type="button"
      class="studio-viewer-bar__btn"
      data-testid="studio-viewer-next"
      disabled={canvasCount <= 1 || canvasIndex >= canvasCount - 1}
      aria-label={$t('storyBuilder.studio.nextCanvas')}
      title={$t('storyBuilder.studio.nextCanvas')}
      onclick={onNextCanvas}
    >
      <ChevronRight aria-hidden="true" />
    </button>
  </div>

  {#if spatialChapter}
    <div class="studio-viewer-bar__group">
      <button
        type="button"
        class="studio-viewer-bar__btn"
        data-testid="studio-viewer-zoom-out"
        aria-label={$t('storyBuilder.studio.zoomOut')}
        title={$t('storyBuilder.studio.zoomOut')}
        onclick={onZoomOut}
      >
        <Minus aria-hidden="true" />
      </button>
      <span class="studio-viewer-bar__zoom" data-testid="studio-viewer-zoom">
        {Math.max(1, Math.round(zoomPercent))}%
      </span>
      <button
        type="button"
        class="studio-viewer-bar__btn"
        data-testid="studio-viewer-zoom-in"
        aria-label={$t('storyBuilder.studio.zoomIn')}
        title={$t('storyBuilder.studio.zoomIn')}
        onclick={onZoomIn}
      >
        <Plus aria-hidden="true" />
      </button>
      <button
        type="button"
        class="studio-viewer-bar__btn"
        data-testid="studio-viewer-home"
        aria-label={$t('storyBuilder.studio.fitView')}
        title={$t('storyBuilder.studio.fitView')}
        onclick={onGoHome}
      >
        <Home aria-hidden="true" />
      </button>
    </div>
  {/if}
</div>

<style>
  .studio-viewer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 2%, transparent);
  }

  .studio-viewer-bar__group {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .studio-viewer-bar__btn {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 7px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: var(--viewer-text, #e8edf4);
    cursor: pointer;
  }

  .studio-viewer-bar__btn:hover:not(:disabled) {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.12));
  }

  .studio-viewer-bar__btn:disabled {
    opacity: 0.34;
    cursor: not-allowed;
  }

  .studio-viewer-bar__btn :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-viewer-bar__page,
  .studio-viewer-bar__zoom {
    min-width: 40px;
    text-align: center;
    font-size: 11.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--viewer-muted, #9aa6b2);
  }
</style>
