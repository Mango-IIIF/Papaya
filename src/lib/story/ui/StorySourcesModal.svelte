<script lang="ts">
  import { FolderOpen, Layers, Plus, Replace } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import type { Readable } from 'svelte/store';
  import { manifestsStore } from '@mango-iiif/iiif-viewer/core';
  import type { StoryState } from '../../core/types/story';
  import { parseIiifResource, type ParsedIiifResource } from '../manifestSources';
  import { t } from '../../core/i18n';

  export let story: Readable<StoryState>;
  export let open = false;
  export let currentManifest: string | null = null;
  export let initialUrl: string | null = null;
  export let hasSelectedChapter = false;
  export let language = 'en';
  export let onClose: (() => void) | undefined = undefined;
  export let onSelectSourceCanvas:
    | ((manifest: string, canvasIndex: number, mode: 'add' | 'replace') => void)
    | undefined = undefined;

  let panelRoot: HTMLDivElement | null = null;
  let urlInput = '';
  let loading = false;
  let errorMessage: string | null = null;
  let resource: ParsedIiifResource | null = null;
  let lastLoadedUrl = '';
  let wasOpen = false;

  onMount(() => {
    if (!panelRoot) return;
    const legacyOverlay = panelRoot.closest('.stage__overlay');
    if (!legacyOverlay) return;
    const stage = panelRoot.closest('.stage--story-builder');
    const grid = stage?.closest('.viewer__grid');
    grid?.classList.add('viewer__grid--settings-modal');
    stage?.appendChild(panelRoot);
    return () => {
      grid?.classList.remove('viewer__grid--settings-modal');
    };
  });

  $: storyManifests = Array.from(
    new Set(
      [
        ...$story.chapters.map((chapter) => chapter.manifest),
        ...(currentManifest ? [currentManifest] : []),
      ].filter((entry): entry is string => Boolean(entry?.trim())),
    ),
  );

  const labelForManifest = (manifestId: string): string => {
    const entry = $manifestsStore[manifestId];
    if (entry?.json) {
      const parsed = parseIiifResource(entry.json, manifestId, language);
      if (parsed?.label) return parsed.label;
    }
    try {
      const parsedUrl = new URL(manifestId);
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      return segments.slice(-2).join('/') || parsedUrl.hostname;
    } catch {
      return manifestId;
    }
  };

  const loadResource = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;
    urlInput = trimmed;
    loading = true;
    errorMessage = null;
    try {
      const cached = $manifestsStore[trimmed]?.json;
      let json: unknown = cached;
      if (!json) {
        const response = await fetch(trimmed);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        json = await response.json();
      }
      const parsed = parseIiifResource(json, trimmed, language);
      if (!parsed) throw new Error('Unrecognized IIIF resource');
      resource = parsed;
      lastLoadedUrl = trimmed;
    } catch {
      resource = null;
      errorMessage = $t('storyBuilder.sources.loadError');
    } finally {
      loading = false;
    }
  };

  $: if (open && !wasOpen) {
    wasOpen = true;
    const initial = initialUrl?.trim() || currentManifest || storyManifests[0] || '';
    if (initial && initial !== lastLoadedUrl) {
      void loadResource(initial);
    } else if (initial && !urlInput) {
      urlInput = initial;
    }
  } else if (!open && wasOpen) {
    wasOpen = false;
  }

  const chooseCanvas = (manifestId: string, canvasIndex: number, mode: 'add' | 'replace') => {
    onSelectSourceCanvas?.(manifestId, canvasIndex, mode);
    onClose?.();
  };
</script>

<svelte:window
  on:keydown={(event) => {
    if (open && event.key === 'Escape') {
      onClose?.();
    }
  }}
/>

<div
  bind:this={panelRoot}
  class="story-sources-modal"
  data-testid="story-sources-modal"
  aria-hidden={!open}
  hidden={!open}
>
  <button
    class="story-sources-modal__scrim"
    type="button"
    tabindex="-1"
    aria-label={$t('common.close')}
    on:click={() => onClose?.()}
  ></button>

  <div
    class="story-sources-modal__panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="story-sources-title"
  >
    <header class="story-sources-modal__header">
      <div>
        <strong id="story-sources-title">{$t('storyBuilder.sources.title')}</strong>
        <small>{$t('storyBuilder.sources.subtitle')}</small>
      </div>
      <button
        type="button"
        class="story-sources-modal__close"
        data-testid="story-sources-close"
        aria-label={$t('common.close')}
        on:click={() => onClose?.()}
      >
        {$t('common.closeGlyph')}
      </button>
    </header>

    <div class="story-sources-modal__body">
      {#if storyManifests.length > 0}
        <section class="story-sources-modal__section">
          <div class="story-sources-modal__section-title">
            {$t('storyBuilder.sources.usedInStory')}
          </div>
          <div class="story-sources-modal__chips">
            {#each storyManifests as manifestId (manifestId)}
              <button
                type="button"
                class="story-sources-modal__chip"
                class:story-sources-modal__chip--active={lastLoadedUrl === manifestId}
                data-testid="story-source-chip"
                title={manifestId}
                on:click={() => loadResource(manifestId)}
              >
                <Layers aria-hidden="true" />
                <span>{labelForManifest(manifestId)}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <form
        class="story-sources-modal__url-row"
        on:submit|preventDefault={() => loadResource(urlInput)}
      >
        <label class="story-sources-modal__label">
          {$t('storyBuilder.sources.urlLabel')}
          <input
            type="url"
            data-testid="story-sources-url"
            bind:value={urlInput}
            placeholder="https://example.org/iiif/manifest.json"
          />
        </label>
        <button
          type="submit"
          class="story-sources-modal__browse"
          data-testid="story-sources-browse"
          disabled={loading || !urlInput.trim()}
        >
          {$t('storyBuilder.sources.load')}
        </button>
      </form>

      {#if loading}
        <p class="story-sources-modal__status">{$t('storyBuilder.sources.loading')}</p>
      {:else if errorMessage}
        <p class="story-sources-modal__error" role="alert">{errorMessage}</p>
      {:else if resource?.kind === 'collection'}
        <section class="story-sources-modal__section">
          <div class="story-sources-modal__section-title">
            {resource.label} · {$t('storyBuilder.sources.collectionItems', { count: resource.items.length })}
          </div>
          <div class="story-sources-modal__grid" data-testid="story-sources-collection-items">
            {#each resource.items as item (item.id)}
              <button
                type="button"
                class="story-sources-modal__card story-sources-modal__card--clickable"
                on:click={() => loadResource(item.id)}
              >
                <div class="story-sources-modal__thumb">
                  {#if item.thumbnail}
                    <img src={item.thumbnail} alt="" loading="lazy" />
                  {:else}
                    <FolderOpen aria-hidden="true" />
                  {/if}
                </div>
                <strong title={item.label}>{item.label}</strong>
                <small>{item.type}</small>
              </button>
            {/each}
          </div>
        </section>
      {:else if resource?.kind === 'manifest'}
        <section class="story-sources-modal__section">
          <div class="story-sources-modal__section-title">
            {resource.label} · {$t('storyBuilder.sources.canvases', { count: resource.canvases.length })}
          </div>
          <div class="story-sources-modal__grid" data-testid="story-sources-canvases">
            {#each resource.canvases as canvas (canvas.id + ':' + canvas.index)}
              <article class="story-sources-modal__card" data-testid={`source-canvas-${canvas.index}`}>
                <div class="story-sources-modal__thumb">
                  {#if canvas.thumbnail}
                    <img src={canvas.thumbnail} alt="" loading="lazy" />
                  {:else}
                    <span>{canvas.index + 1}</span>
                  {/if}
                  <span class="story-sources-modal__badge">{canvas.index + 1}</span>
                </div>
                <strong title={canvas.label}>{canvas.label}</strong>
                <div class="story-sources-modal__card-actions">
                  <button
                    type="button"
                    class="story-sources-modal__action story-sources-modal__action--primary"
                    data-testid={`source-canvas-add-${canvas.index}`}
                    on:click={() => chooseCanvas(lastLoadedUrl, canvas.index, 'add')}
                  >
                    <Plus aria-hidden="true" />
                    <span>{$t('storyBuilder.sources.addAsChapter')}</span>
                  </button>
                  {#if hasSelectedChapter}
                    <button
                      type="button"
                      class="story-sources-modal__action"
                      data-testid={`source-canvas-use-${canvas.index}`}
                      on:click={() => chooseCanvas(lastLoadedUrl, canvas.index, 'replace')}
                    >
                      <Replace aria-hidden="true" />
                      <span>{$t('storyBuilder.sources.useForChapter')}</span>
                    </button>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .story-sources-modal {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: grid;
    place-items: center;
    padding: clamp(12px, 3cqw, 28px);
    box-sizing: border-box;
    pointer-events: auto;
  }

  .story-sources-modal[hidden] {
    display: none;
  }

  .story-sources-modal__scrim {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: color-mix(in srgb, var(--viewer-stage-tail, #050a10) 78%, transparent);
    backdrop-filter: blur(8px);
    cursor: default;
  }

  .story-sources-modal__panel {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(980px, 100%);
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    background: var(--viewer-panel, #121922);
    color: var(--viewer-text, #e8edf4);
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.5);
  }

  .story-sources-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }

  .story-sources-modal__header > div {
    display: grid;
    gap: 2px;
  }

  .story-sources-modal__header strong {
    font-size: 16px;
  }

  .story-sources-modal__header small {
    color: var(--viewer-muted, #9aa6b2);
    font-size: 12px;
  }

  .story-sources-modal__close {
    width: 28px;
    height: 28px;
    border: 1px solid var(--viewer-close-button-border, rgba(255, 255, 255, 0.18));
    border-radius: 8px;
    background: var(--viewer-close-button-bg, rgba(255, 255, 255, 0.08));
    color: inherit;
    cursor: pointer;
  }

  .story-sources-modal__body {
    display: grid;
    align-content: start;
    gap: 16px;
    padding: 16px 18px 22px;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .story-sources-modal__section {
    display: grid;
    gap: 10px;
  }

  .story-sources-modal__section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .story-sources-modal__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .story-sources-modal__chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 280px;
    padding: 6px 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    background: var(--viewer-surface, #151d26);
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .story-sources-modal__chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .story-sources-modal__chip :global(svg) {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    color: var(--story-builder-accent, #2ac7ff);
  }

  .story-sources-modal__chip--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 12%, transparent);
  }

  .story-sources-modal__url-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: end;
  }

  .story-sources-modal__label {
    display: grid;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--viewer-muted, #9aa6b2);
  }

  .story-sources-modal__label input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 9px 11px;
    border: 1px solid color-mix(in srgb, var(--viewer-text, #e8edf4) 20%, transparent);
    border-radius: 8px;
    background: var(--viewer-well-bg, rgba(5, 10, 16, 0.35));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 13px;
  }

  .story-sources-modal__browse {
    min-height: 38px;
    padding: 8px 14px;
    border: 0;
    border-radius: 8px;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .story-sources-modal__browse:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .story-sources-modal__status {
    margin: 0;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 13px;
  }

  .story-sources-modal__error {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--viewer-danger, #ffb8b8) 12%, transparent);
    color: var(--viewer-danger, #ffb8b8);
    font-size: 13px;
  }

  .story-sources-modal__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }

  .story-sources-modal__card {
    display: grid;
    gap: 8px;
    align-content: start;
    padding: 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--viewer-surface, #151d26);
    color: inherit;
    text-align: left;
  }

  .story-sources-modal__card--clickable {
    cursor: pointer;
    font: inherit;
  }

  .story-sources-modal__card--clickable:hover {
    border-color: var(--story-builder-accent, #2ac7ff);
  }

  .story-sources-modal__card strong {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .story-sources-modal__card small {
    font-size: 11px;
    color: var(--viewer-muted, #9aa6b2);
  }

  .story-sources-modal__thumb {
    position: relative;
    aspect-ratio: 4 / 3;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 7px;
    background: var(--viewer-well-bg, rgba(5, 10, 16, 0.35));
    color: var(--viewer-muted, #9aa6b2);
  }

  .story-sources-modal__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .story-sources-modal__badge {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 2px 6px;
    border-radius: 5px;
    background: rgba(6, 12, 18, 0.78);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
  }

  .story-sources-modal__card-actions {
    display: grid;
    gap: 5px;
  }

  .story-sources-modal__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 8px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .story-sources-modal__action :global(svg) {
    width: 13px;
    height: 13px;
  }

  .story-sources-modal__action--primary {
    border-color: transparent;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .story-sources-modal__action:hover {
    opacity: 0.92;
  }
</style>
