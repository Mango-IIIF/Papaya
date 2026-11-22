<script lang="ts">
  import { Check, Eye, EyeOff, GripHorizontal, Plus, RotateCcw } from '@lucide/svelte';
  import type { ChapterAnnotationTool } from '../../core/types/story';
  import { ANNOTATION_TOOLS, annotationToolLabelKey } from '../annotations/annotationTools';
  import type { StudioMode } from './StudioToolbar.svelte';
  import { t } from '../../core/i18n';

  interface ChapterCardData {
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
    chapterCard: ChapterCardData | null;
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
    chapterCard,
    onSaveView,
    onAddShot,
    onResetView,
    onSelectAnnotationTool,
    onDoneAnnotating,
  }: Props = $props();

  let cardHidden = $state(false);
  let cardPos = $state<{ leftPct: number; topPct: number } | null>(null);
  let draggingCard = $state(false);
  let cardEl: HTMLElement | null = $state(null);

  const startCardDrag = (event: PointerEvent) => {
    if (isPreviewing || !cardEl) return;
    if ((event.target as HTMLElement)?.closest('button')) return;
    const host = cardEl.parentElement;
    if (!host) return;
    event.preventDefault();
    event.stopPropagation();

    const hostRect = host.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    if (hostRect.width <= 0 || hostRect.height <= 0) return;

    const offsetX = event.clientX - cardRect.left;
    const offsetY = event.clientY - cardRect.top;
    draggingCard = true;

    const updatePos = (clientX: number, clientY: number) => {
      const maxLeft = Math.max(0, hostRect.width - cardRect.width);
      const maxTop = Math.max(0, hostRect.height - cardRect.height);
      const nextLeft = Math.max(0, Math.min(maxLeft, clientX - hostRect.left - offsetX));
      const nextTop = Math.max(0, Math.min(maxTop, clientY - hostRect.top - offsetY));
      cardPos = {
        leftPct: (nextLeft / hostRect.width) * 100,
        topPct: (nextTop / hostRect.height) * 100,
      };
    };

    const onMove = (moveEvent: PointerEvent) => updatePos(moveEvent.clientX, moveEvent.clientY);
    const onUp = () => {
      draggingCard = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  let cardStyle = $derived(
    cardPos ? `left:${cardPos.leftPct.toFixed(2)}%; top:${cardPos.topPct.toFixed(2)}%; bottom:auto;` : '',
  );
  let showCard = $derived(
    Boolean(chapterCard) && (isPreviewing || (mode === 'frame' && !cardHidden)),
  );
</script>

{#if !isPreviewing && mode === 'annotate'}
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
{:else if !isPreviewing && mode === 'frame' && viewModified}
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

{#if showCard && chapterCard}
  <aside
    bind:this={cardEl}
    class="studio-hud__caption"
    class:studio-hud__caption--editable={!isPreviewing}
    class:studio-hud__caption--dragging={draggingCard}
    style={cardStyle}
    data-testid={isPreviewing ? 'builder-preview-caption' : 'studio-story-card'}
  >
    <div
      class="studio-hud__caption-head"
      role="presentation"
      title={!isPreviewing ? $t('storyBuilder.studio.dragCard') : undefined}
      onpointerdown={startCardDrag}
    >
      <div class="studio-hud__caption-eyebrow">
        {#if !isPreviewing}
          <GripHorizontal aria-hidden="true" />
        {/if}
        <span>
          {$t('storyViewer.chapterPosition', {
            current: chapterCard.index + 1,
            total: chapterCard.total,
          })}
        </span>
      </div>
      {#if !isPreviewing}
        <button
          type="button"
          class="studio-hud__caption-toggle"
          data-testid="studio-hide-card"
          aria-label={$t('storyBuilder.studio.hideCard')}
          title={$t('storyBuilder.studio.hideCard')}
          onclick={() => (cardHidden = true)}
        >
          <EyeOff aria-hidden="true" />
        </button>
      {/if}
    </div>
    <h3>{chapterCard.title}</h3>
    {#if chapterCard.descriptionHtml}
      <div class="studio-hud__caption-body">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html chapterCard.descriptionHtml}
      </div>
    {/if}
  </aside>
{:else if !isPreviewing && mode === 'frame' && chapterCard && cardHidden}
  <button
    type="button"
    class="studio-hud__show-card"
    data-testid="studio-show-card"
    onclick={() => (cardHidden = false)}
  >
    <Eye aria-hidden="true" />
    <span>{$t('storyBuilder.studio.showCard')}</span>
  </button>
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
  .studio-hud__btn :global(svg),
  .studio-hud__show-card :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-hud__caption {
    position: absolute;
    left: 18px;
    bottom: 18px;
    z-index: 12;
    width: min(340px, calc(100% - 36px));
    max-height: 44%;
    overflow: auto;
    padding: 11px 14px 13px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.16));
    border-radius: 12px;
    background: color-mix(in srgb, var(--viewer-panel, #121922) 88%, transparent);
    backdrop-filter: blur(12px);
    color: var(--viewer-text, #e8edf4);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42);
    pointer-events: auto;
    box-sizing: border-box;
  }

  .studio-hud__caption--editable .studio-hud__caption-head {
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .studio-hud__caption--dragging {
    border-color: var(--story-builder-accent, #2ac7ff);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.54);
  }

  .studio-hud__caption--dragging .studio-hud__caption-head {
    cursor: grabbing;
  }

  .studio-hud__caption-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .studio-hud__caption-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-hud__caption-eyebrow :global(svg) {
    width: 14px;
    height: 14px;
    opacity: 0.7;
  }

  .studio-hud__caption-toggle {
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

  .studio-hud__caption-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--viewer-text, #e8edf4);
  }

  .studio-hud__caption-toggle :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-hud__caption h3 {
    margin: 2px 0 6px;
    font-size: 15.5px;
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

  .studio-hud__show-card {
    position: absolute;
    left: 18px;
    bottom: 18px;
    z-index: 12;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: color-mix(in srgb, var(--viewer-panel, #111720) 86%, transparent);
    backdrop-filter: blur(10px);
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }

  .studio-hud__show-card:hover {
    background: color-mix(in srgb, var(--viewer-panel, #111720) 96%, transparent);
  }

  @media (max-width: 720px) {
    .studio-hud__tool span,
    .studio-hud__label {
      display: none;
    }
  }
</style>
