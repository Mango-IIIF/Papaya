<script lang="ts">
  import { Check, Plus, RotateCcw } from '@lucide/svelte';
  import type { ChapterAnnotationTool } from '../../core/types/story';
  import { ANNOTATION_TOOLS, annotationToolLabelKey } from '../annotations/annotationTools';
  import type { StudioMode } from './StudioToolbar.svelte';
  import { t } from '../../core/i18n';

  interface PreviewCaption {
    index: number;
    total: number;
    title: string;
    descriptionHtml: string;
  }

  interface Props {
    mode: StudioMode;
    isPreviewing: boolean;
    viewModified: boolean;
    selectedShotNumber: number | null;
    canAddShot: boolean;
    annotationTool: ChapterAnnotationTool;
    previewCaption: PreviewCaption | null;
    onSaveView: () => void;
    onAddShot: () => void;
    onResetView: () => void;
    onSelectAnnotationTool: (tool: ChapterAnnotationTool) => void;
    onDoneAnnotating: () => void;
  }

  let {
    mode,
    isPreviewing,
    viewModified,
    selectedShotNumber,
    canAddShot,
    annotationTool,
    previewCaption,
    onSaveView,
    onAddShot,
    onResetView,
    onSelectAnnotationTool,
    onDoneAnnotating,
  }: Props = $props();
</script>

{#if isPreviewing}
  {#if previewCaption}
    <aside class="studio-hud__caption" data-testid="builder-preview-caption">
      <div class="studio-hud__caption-eyebrow">
        {$t('storyViewer.chapterPosition', {
          current: previewCaption.index + 1,
          total: previewCaption.total,
        })}
      </div>
      <h3>{previewCaption.title}</h3>
      {#if previewCaption.descriptionHtml}
        <div class="studio-hud__caption-body">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html previewCaption.descriptionHtml}
        </div>
      {/if}
    </aside>
  {/if}
{:else if mode === 'annotate'}
  <div class="studio-hud__pill studio-hud__pill--tools" data-testid="annotation-bar">
    <div
      class="studio-hud__tools"
      role="group"
      aria-label={$t('storyBuilder.annotations.tools')}
    >
      {#each ANNOTATION_TOOLS as tool}
        {@const ToolIcon = tool.icon}
        <button
          type="button"
          class="studio-hud__tool"
          class:studio-hud__tool--active={annotationTool === tool.id}
          data-testid={`annotation-tool-${tool.id}`}
          aria-pressed={annotationTool === tool.id}
          title={$t(annotationToolLabelKey(tool.id))}
          onclick={() => onSelectAnnotationTool(tool.id)}
        >
          <ToolIcon aria-hidden="true" />
          <span>{$t(annotationToolLabelKey(tool.id))}</span>
        </button>
      {/each}
    </div>
    <span class="studio-hud__divider" aria-hidden="true"></span>
    <button
      type="button"
      class="studio-hud__btn studio-hud__btn--primary"
      data-testid="story-wide-done"
      onclick={onDoneAnnotating}
    >
      <Check aria-hidden="true" />
      <span>{$t('storyBuilder.inspector.done')}</span>
    </button>
  </div>
{:else if mode === 'frame' && viewModified}
  <div class="studio-hud__pill studio-hud__pill--view" data-testid="studio-view-changed">
    <span class="studio-hud__label">
      {selectedShotNumber !== null
        ? $t('storyBuilder.studio.shotChanged', { number: selectedShotNumber })
        : $t('storyBuilder.studio.viewChanged')}
    </span>

    <button
      type="button"
      class="studio-hud__btn studio-hud__btn--primary"
      data-testid="studio-save-view"
      onclick={onSaveView}
    >
      <Check aria-hidden="true" />
      <span>
        {selectedShotNumber !== null
          ? $t('storyBuilder.studio.updateShot', { number: selectedShotNumber })
          : $t('storyBuilder.studio.saveView')}
      </span>
    </button>

    {#if canAddShot && selectedShotNumber === null}
      <button
        type="button"
        class="studio-hud__btn"
        data-testid="studio-hud-add-shot"
        onclick={onAddShot}
      >
        <Plus aria-hidden="true" />
        <span>{$t('storyBuilder.studio.addShot')}</span>
      </button>
    {/if}

    <button
      type="button"
      class="studio-hud__btn studio-hud__btn--ghost"
      data-testid="studio-reset-view"
      onclick={onResetView}
    >
      <RotateCcw aria-hidden="true" />
      <span>{$t('storyBuilder.studio.resetView')}</span>
    </button>
  </div>
{/if}

<style>
  .studio-hud__pill {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 12;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: calc(100% - 28px);
    padding: 5px 7px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: color-mix(in srgb, var(--viewer-panel, #111720) 88%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
    color: var(--viewer-text, #e8edf4);
    pointer-events: auto;
  }

  .studio-hud__label {
    padding: 0 6px 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--viewer-muted, #9aa6b2);
    white-space: nowrap;
  }

  .studio-hud__tools {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
  }

  .studio-hud__tool,
  .studio-hud__btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .studio-hud__tool:hover,
  .studio-hud__btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .studio-hud__tool--active {
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 22%, transparent);
    border-color: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 60%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-hud__btn--primary {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-hud__btn--primary:hover {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }

  .studio-hud__btn--ghost {
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-hud__divider {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.14);
  }

  .studio-hud__tool :global(svg),
  .studio-hud__btn :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-hud__caption {
    position: absolute;
    inset-inline-start: 18px;
    inset-block-end: 18px;
    z-index: 12;
    max-width: min(440px, calc(100% - 36px));
    max-height: 45%;
    overflow: auto;
    padding: 12px 15px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 12px;
    background: color-mix(in srgb, var(--viewer-panel, #121922) 90%, transparent);
    backdrop-filter: blur(12px);
    color: var(--viewer-text, #e8edf4);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.36);
    pointer-events: auto;
  }

  .studio-hud__caption-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-hud__caption h3 {
    margin: 4px 0 6px;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
  }

  .studio-hud__caption-body {
    font-size: 13px;
    line-height: 1.45;
    color: var(--viewer-muted, #d8dee9);
  }

  .studio-hud__caption-body :global(p) {
    margin: 0 0 6px;
  }

  .studio-hud__caption-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .studio-hud__caption-body :global(a) {
    color: var(--story-builder-accent, #2ac7ff);
    text-decoration: underline;
  }

  @media (max-width: 720px) {
    .studio-hud__tool span,
    .studio-hud__label {
      display: none;
    }
  }
</style>
