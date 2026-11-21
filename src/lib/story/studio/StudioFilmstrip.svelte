<script lang="ts">
  import { Copy, FolderOpen, Plus, Trash2 } from '@lucide/svelte';
  import {
    fetchManifest,
    manifestsStore,
    resolveCanvasThumbnail,
  } from '@mango-iiif/iiif-viewer/core';
  import type { Chapter, StoryState } from '../../core/types/story';
  import { animatableCameraDurationMs } from '../cameraTrack';
  import { resolveChapterTiming } from '../timing';
  import { t } from '../../core/i18n';

  interface Props {
    story: StoryState;
    selectedChapterId: string | null;
    language: string;
    languages: string[];
    onSelectChapter: (chapterId: string) => void;
    onAddChapter: () => void;
    onOpenSources: () => void;
    onDuplicateChapter: (chapterId: string) => void;
    onDeleteChapter: (chapterId: string) => void;
    onReorderChapter: (
      chapterId: string,
      targetChapterId: string,
      position?: 'before' | 'after',
    ) => void;
  }

  let {
    story,
    selectedChapterId,
    language,
    languages,
    onSelectChapter,
    onAddChapter,
    onOpenSources,
    onDuplicateChapter,
    onDeleteChapter,
    onReorderChapter,
  }: Props = $props();

  let confirmDeleteId = $state<string | null>(null);
  let draggedChapterId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);
  let dropPosition = $state<'before' | 'after'>('before');

  $effect(() => {
    const manifestIds = Array.from(
      new Set(
        story.chapters
          .map((chapter) => chapter.manifest)
          .filter((manifest): manifest is string => Boolean(manifest?.trim())),
      ),
    );
    for (const manifestId of manifestIds) {
      const entry = $manifestsStore[manifestId];
      if (!entry?.json && !entry?.isFetching && !entry?.error) {
        void fetchManifest(manifestId);
      }
    }
  });

  const labelForChapter = (chapter: Chapter, index: number): string => {
    const preferred = chapter.title?.[language]?.trim();
    if (preferred) return preferred;
    const fallback = Object.values(chapter.title ?? {}).find((v) => v?.trim());
    return fallback?.trim() || $t('storyBuilder.chapters.number', { number: index + 1 });
  };

  const durationForChapter = (chapter: Chapter): string => {
    const narrationMap = chapter.narrationSegment ?? {};
    const seg =
      [language, ...languages].map((l) => narrationMap[l]).find(Boolean) ??
      Object.values(narrationMap)[0];
    const narrationSec =
      seg && Number.isFinite(seg.start) && Number.isFinite(seg.end)
        ? Math.max(0, seg.end - seg.start)
        : 0;
    const mediaSec =
      chapter.media && Number.isFinite(chapter.media.start) && Number.isFinite(chapter.media.end)
        ? Math.max(0, chapter.media.end - chapter.media.start)
        : 0;
    const motionSec = animatableCameraDurationMs(chapter.cameraTrack) / 1000;
    const total =
      narrationSec > 0 || mediaSec > 0 || motionSec > 0
        ? Math.max(narrationSec + mediaSec, motionSec)
        : resolveChapterTiming(chapter).presentationDurationMs / 1000;
    const whole = Math.max(0, Math.floor(total));
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const thumbForChapter = (chapter: Chapter): string | null => {
    const manifesto = $manifestsStore[chapter.manifest]?.manifesto;
    if (!manifesto) return null;
    return resolveCanvasThumbnail(manifesto, undefined, chapter.canvasIndex);
  };

  const handleDragStart = (event: DragEvent, chapterId: string) => {
    draggedChapterId = chapterId;
    dropTargetId = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', chapterId);
    }
  };

  const handleDragOver = (event: DragEvent, targetId: string) => {
    if (!draggedChapterId || draggedChapterId === targetId) return;
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    const mid = el.getBoundingClientRect().top + el.offsetHeight / 2;
    dropTargetId = targetId;
    dropPosition = event.clientY >= mid ? 'after' : 'before';
  };

  const handleDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const sourceId = draggedChapterId || event.dataTransfer?.getData('text/plain') || null;
    if (sourceId && sourceId !== targetId) {
      onReorderChapter(sourceId, targetId, dropPosition);
    }
    draggedChapterId = null;
    dropTargetId = null;
  };

  const handleDragEnd = () => {
    draggedChapterId = null;
    dropTargetId = null;
  };
</script>

<aside
  class="studio-filmstrip"
  data-testid="studio-filmstrip"
  aria-label={$t('storyBuilder.chapters.title')}
>
  <header class="studio-filmstrip__header">
    <span>{$t('storyBuilder.chapters.title')}</span>
    <span class="studio-filmstrip__count">{story.chapters.length}</span>
  </header>

  <div class="studio-filmstrip__list" data-testid="chapter-list">
    {#each story.chapters as chapter, index (chapter.id)}
      {@const active = chapter.id === selectedChapterId}
      {@const thumb = thumbForChapter(chapter)}
      {@const hasMotion = (chapter.cameraTrack?.keyframes?.length ?? 0) >= 2}
      {@const annCount = chapter.drawingAnnotations?.length ?? 0}
      <div
        class="studio-slide"
        class:studio-slide--active={active}
        class:studio-slide--drop-before={dropTargetId === chapter.id && dropPosition === 'before'}
        class:studio-slide--drop-after={dropTargetId === chapter.id && dropPosition === 'after'}
        data-testid={`chapter-row-${chapter.id}`}
        draggable="true"
        role="listitem"
        ondragstart={(event) => handleDragStart(event, chapter.id)}
        ondragover={(event) => handleDragOver(event, chapter.id)}
        ondrop={(event) => handleDrop(event, chapter.id)}
        ondragend={handleDragEnd}
      >
        <button
          type="button"
          class="studio-slide__select"
          aria-current={active ? 'true' : undefined}
          onclick={() => {
            confirmDeleteId = null;
            onSelectChapter(chapter.id);
          }}
        >
          <div class="studio-slide__thumb">
            {#if thumb}
              <img src={thumb} alt="" loading="lazy" />
            {:else}
              <span class="studio-slide__thumb-fallback">{index + 1}</span>
            {/if}
            <span class="studio-slide__num">{index + 1}</span>
            <span class="studio-slide__dur">{durationForChapter(chapter)}</span>
          </div>
          <div class="studio-slide__meta">
            <span class="studio-slide__title">{labelForChapter(chapter, index)}</span>
            {#if hasMotion || annCount > 0}
              <span class="studio-slide__dots" aria-hidden="true">
                {#if hasMotion}<i class="studio-slide__dot studio-slide__dot--motion"></i>{/if}
                {#if annCount > 0}<i class="studio-slide__dot studio-slide__dot--ann"></i>{/if}
              </span>
            {/if}
          </div>
        </button>

        {#if confirmDeleteId === chapter.id}
          <div class="studio-slide__confirm">
            <span>{$t('storyBuilder.studio.confirmDelete')}</span>
            <button
              type="button"
              class="studio-slide__confirm-yes"
              onclick={() => {
                confirmDeleteId = null;
                onDeleteChapter(chapter.id);
              }}
            >
              {$t('common.delete')}
            </button>
            <button
              type="button"
              class="studio-slide__confirm-no"
              onclick={() => (confirmDeleteId = null)}
            >
              {$t('common.cancel')}
            </button>
          </div>
        {:else}
          <div class="studio-slide__actions">
            <button
              type="button"
              class="studio-slide__action"
              aria-label={$t('storyBuilder.chapters.duplicate')}
              title={$t('storyBuilder.chapters.duplicate')}
              onclick={() => onDuplicateChapter(chapter.id)}
            >
              <Copy aria-hidden="true" />
            </button>
            <button
              type="button"
              class="studio-slide__action studio-slide__action--danger"
              aria-label={$t('storyBuilder.chapters.delete')}
              title={$t('storyBuilder.chapters.delete')}
              onclick={() => (confirmDeleteId = chapter.id)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <footer class="studio-filmstrip__footer">
    <button
      type="button"
      class="studio-filmstrip__btn studio-filmstrip__btn--primary"
      data-testid="studio-add-chapter"
      onclick={onAddChapter}
    >
      <Plus aria-hidden="true" />
      <span>{$t('storyBuilder.studio.newChapter')}</span>
    </button>
    <button
      type="button"
      class="studio-filmstrip__btn"
      data-testid="open-sources"
      onclick={onOpenSources}
    >
      <FolderOpen aria-hidden="true" />
      <span>{$t('storyBuilder.studio.addFromIiif')}</span>
    </button>
  </footer>
</aside>

<style>
  .studio-filmstrip {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    min-width: 0;
    background: var(--viewer-panel, #111720);
    border-right: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    color: var(--viewer-text, #e8edf4);
    overflow: hidden;
  }

  .studio-filmstrip__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-filmstrip__count {
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 8%, transparent);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .studio-filmstrip__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 2px 10px 12px;
  }

  .studio-slide {
    position: relative;
    border-radius: 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 3%, transparent);
    transition: border-color 140ms ease, background-color 140ms ease;
  }

  .studio-slide:hover {
    border-color: color-mix(in srgb, var(--viewer-text, #e8edf4) 22%, transparent);
  }

  .studio-slide--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 9%, transparent);
  }

  .studio-slide--drop-before {
    box-shadow: inset 0 2px 0 0 var(--story-builder-accent, #2ac7ff);
  }

  .studio-slide--drop-after {
    box-shadow: inset 0 -2px 0 0 var(--story-builder-accent, #2ac7ff);
  }

  .studio-slide__select {
    display: grid;
    gap: 6px;
    width: 100%;
    padding: 6px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .studio-slide__thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    width: 100%;
    border-radius: 6px;
    overflow: hidden;
    background: #090d13;
    display: grid;
    place-items: center;
  }

  .studio-slide__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .studio-slide__thumb-fallback {
    font-size: 16px;
    font-weight: 700;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-slide__num,
  .studio-slide__dur {
    position: absolute;
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(6, 10, 16, 0.78);
    color: #edf4ff;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    backdrop-filter: blur(4px);
  }

  .studio-slide__num {
    top: 5px;
    left: 5px;
  }

  .studio-slide--active .studio-slide__num {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-slide__dur {
    bottom: 5px;
    right: 5px;
  }

  .studio-slide__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
    padding: 0 2px;
  }

  .studio-slide__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .studio-slide__dots {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .studio-slide__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .studio-slide__dot--motion {
    background: var(--story-builder-accent, #2ac7ff);
  }

  .studio-slide__dot--ann {
    background: #fbbf24;
  }

  .studio-slide__actions {
    position: absolute;
    top: 10px;
    right: 10px;
    display: inline-flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .studio-slide:hover .studio-slide__actions,
  .studio-slide:focus-within .studio-slide__actions {
    opacity: 1;
  }

  .studio-slide__action {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    background: rgba(9, 13, 19, 0.85);
    color: #e8edf4;
    cursor: pointer;
  }

  .studio-slide__action:hover {
    background: rgba(20, 28, 40, 0.95);
  }

  .studio-slide__action--danger:hover {
    border-color: rgba(248, 113, 113, 0.6);
    color: #fca5a5;
  }

  .studio-slide__action :global(svg) {
    width: 12px;
    height: 12px;
  }

  .studio-slide__confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    font-size: 11px;
  }

  .studio-slide__confirm button {
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-slide__confirm-yes {
    border-color: rgba(248, 113, 113, 0.45) !important;
    background: rgba(248, 113, 113, 0.16) !important;
    color: #fecaca !important;
  }

  .studio-filmstrip__footer {
    display: grid;
    gap: 6px;
    padding: 10px;
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }

  .studio-filmstrip__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 140ms ease;
  }

  .studio-filmstrip__btn:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-filmstrip__btn--primary {
    border-color: transparent;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-filmstrip__btn--primary:hover {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }

  .studio-filmstrip__btn :global(svg) {
    width: 15px;
    height: 15px;
  }
</style>
