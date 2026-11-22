<script lang="ts">
  import {
    Download,
    Frame,
    Headphones,
    PanelRight,
    PenTool,
    Play,
    Redo2,
    Settings,
    Square,
    Undo2,
  } from '@lucide/svelte';
  import { t } from '../../core/i18n';

  export type StudioMode = 'frame' | 'annotate' | 'audio';

  interface Props {
    mode: StudioMode;
    hasChapters: boolean;
    canAnnotate: boolean;
    annotationCount?: number;
    canUndo: boolean;
    canRedo: boolean;
    isPreviewing: boolean;
    inspectorOpen: boolean;
    onSelectMode: (mode: StudioMode) => void;
    onUndo: () => void;
    onRedo: () => void;
    onTogglePreview: () => void;
    onOpenSettings: () => void;
    onExport: () => void;
    onToggleInspector: () => void;
  }

  let {
    mode,
    hasChapters,
    canAnnotate,
    annotationCount = 0,
    canUndo,
    canRedo,
    isPreviewing,
    inspectorOpen,
    onSelectMode,
    onUndo,
    onRedo,
    onTogglePreview,
    onOpenSettings,
    onExport,
    onToggleInspector,
  }: Props = $props();
</script>

<div class="studio-toolbar" data-testid="studio-toolbar">
  {#if hasChapters && !isPreviewing}
    <div
      class="studio-toolbar__modes"
      role="tablist"
      aria-label={$t('storyBuilder.studio.modeSwitchAria')}
    >
      <button
        type="button"
        role="tab"
        class="studio-toolbar__mode"
        class:studio-toolbar__mode--active={mode === 'frame'}
        aria-selected={mode === 'frame'}
        data-testid="studio-mode-frame"
        onclick={() => onSelectMode('frame')}
      >
        <Frame aria-hidden="true" />
        <span>{$t('storyBuilder.studio.modes.frame')}</span>
      </button>

      <button
        type="button"
        role="tab"
        class="studio-toolbar__mode"
        class:studio-toolbar__mode--active={mode === 'annotate'}
        aria-selected={mode === 'annotate'}
        disabled={!canAnnotate}
        data-testid="studio-mode-annotate"
        onclick={() => onSelectMode('annotate')}
      >
        <PenTool aria-hidden="true" />
        <span>{$t('storyBuilder.studio.modes.annotate')}</span>
        {#if annotationCount > 0}
          <em class="studio-toolbar__badge">{annotationCount}</em>
        {/if}
      </button>

      <button
        type="button"
        role="tab"
        class="studio-toolbar__mode"
        class:studio-toolbar__mode--active={mode === 'audio'}
        aria-selected={mode === 'audio'}
        data-testid="studio-mode-audio"
        onclick={() => onSelectMode('audio')}
      >
        <Headphones aria-hidden="true" />
        <span>{$t('storyBuilder.studio.modes.audio')}</span>
      </button>
    </div>
  {/if}

  <div class="studio-toolbar__actions">
    {#if !isPreviewing}
      <div class="studio-toolbar__history">
        <button
          type="button"
          class="studio-toolbar__icon-btn"
          data-testid="studio-undo"
          disabled={!canUndo}
          aria-label={$t('storyBuilder.topBar.undo')}
          title={$t('storyBuilder.topBar.undo')}
          onclick={onUndo}
        >
          <Undo2 aria-hidden="true" />
        </button>
        <button
          type="button"
          class="studio-toolbar__icon-btn"
          data-testid="studio-redo"
          disabled={!canRedo}
          aria-label={$t('storyBuilder.topBar.redo')}
          title={$t('storyBuilder.topBar.redo')}
          onclick={onRedo}
        >
          <Redo2 aria-hidden="true" />
        </button>
      </div>
    {/if}

    <button
      type="button"
      class="studio-toolbar__btn"
      class:studio-toolbar__btn--accent={isPreviewing}
      data-testid="studio-preview"
      disabled={!hasChapters}
      aria-pressed={isPreviewing}
      onclick={onTogglePreview}
    >
      {#if isPreviewing}
        <Square aria-hidden="true" />
        <span>{$t('storyBuilder.topBar.exitPreview')}</span>
      {:else}
        <Play aria-hidden="true" />
        <span>{$t('storyBuilder.topBar.preview')}</span>
      {/if}
    </button>

    {#if !isPreviewing}
      <button
        type="button"
        class="studio-toolbar__icon-btn"
        data-testid="studio-settings"
        aria-label={$t('storyBuilder.studio.settings')}
        title={$t('storyBuilder.studio.settings')}
        onclick={onOpenSettings}
      >
        <Settings aria-hidden="true" />
      </button>

      <button
        type="button"
        class="studio-toolbar__btn studio-toolbar__btn--primary"
        data-testid="studio-export"
        disabled={!hasChapters}
        onclick={onExport}
      >
        <Download aria-hidden="true" />
        <span>{$t('storyBuilder.topBar.export')}</span>
      </button>

      {#if hasChapters}
        <button
          type="button"
          class="studio-toolbar__icon-btn"
          class:studio-toolbar__icon-btn--active={inspectorOpen}
          data-testid="studio-toggle-inspector"
          aria-pressed={inspectorOpen}
          aria-label={$t('storyBuilder.studio.toggleInspector')}
          title={$t('storyBuilder.studio.toggleInspector')}
          onclick={onToggleInspector}
        >
          <PanelRight aria-hidden="true" />
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .studio-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .studio-toolbar__modes {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 6%, transparent);
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.09));
  }

  .studio-toolbar__mode {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 140ms ease, color 140ms ease;
  }

  .studio-toolbar__mode:hover:not(:disabled) {
    color: var(--viewer-text, #e8edf4);
  }

  .studio-toolbar__mode:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .studio-toolbar__mode--active {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-toolbar__mode--active:hover:not(:disabled) {
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-toolbar__mode :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-toolbar__badge {
    display: inline-grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    font-style: normal;
    font-size: 10px;
    font-weight: 700;
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .studio-toolbar__actions,
  .studio-toolbar__history {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .studio-toolbar__icon-btn,
  .studio-toolbar__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 140ms ease, border-color 140ms ease, opacity 140ms ease;
  }

  .studio-toolbar__icon-btn {
    width: 32px;
    padding: 0;
  }

  .studio-toolbar__btn {
    padding: 0 11px;
  }

  .studio-toolbar__icon-btn:hover:not(:disabled),
  .studio-toolbar__btn:hover:not(:disabled) {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-toolbar__icon-btn:disabled,
  .studio-toolbar__btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .studio-toolbar__icon-btn--active {
    border-color: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 55%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-toolbar__btn--primary {
    border-color: transparent;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-toolbar__btn--primary:hover:not(:disabled) {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }

  .studio-toolbar__btn--accent {
    border-color: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 65%, transparent);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 16%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-toolbar__icon-btn :global(svg),
  .studio-toolbar__btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  @media (max-width: 1080px) {
    .studio-toolbar__mode span,
    .studio-toolbar__btn span {
      display: none;
    }

    .studio-toolbar__mode,
    .studio-toolbar__btn {
      padding: 0 9px;
    }
  }
</style>
