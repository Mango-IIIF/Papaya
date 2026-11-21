<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { writable } from 'svelte/store';
  import { Globe } from '@lucide/svelte';
  import {
    ViewerCore,
    fetchManifest,
    manifestsStore,
    normaliseViewerConfig,
    parseViewerConfig,
    resolveCanvasThumbnail,
    type ViewBox,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import { t, translate } from '../../core/i18n';
  import type { StoryConfig, StoryEventMap } from '../../core/types/story';
  import { extractManifestAttribution } from '../manifestAttribution';
  import StoryShell from './StoryShell.svelte';
  import { createStoryViewerBridge } from './storyViewerBridge';
  import MangoFooterBrand from '../ui/MangoFooterBrand.svelte';
  import StoryAnnotationOverlay from '../ui/StoryAnnotationOverlay.svelte';
  import StoryControlsStage from '../viewer/StoryControlsStage.svelte';
  import {
    normaliseStoryInput,
    validateStoryViewer,
    type StoryWithDefaults,
  } from '../viewer/storyLoader';
  import { createStoryViewerRuntime } from '../viewer/storyViewerController';
  import { createStoryPlayback } from '../viewer/storyPlayback.svelte';

  interface Props {
    /** A story AnnotationPage, as an object or JSON text. Wins over `storyUrl`. */
    story?: string | Record<string, unknown> | undefined;
    storyUrl?: string | undefined;
    config?: StoryConfig | string | undefined;
    /** Plugins for the embedded viewer's stage. */
    plugins?: ViewerPlugin[];
    /** Where viewer and story events are dispatched as DOM events. */
    eventTarget?: EventTarget | null;
    onstoryViewerError?: (payload: { message: string; cause?: unknown }) => void;
  }

  let {
    story = undefined,
    storyUrl = undefined,
    config = undefined,
    plugins = [],
    eventTarget = null,
    onstoryViewerError = undefined,
  }: Props = $props();

  const STORY_DEFAULT_LANGUAGE = 'en';
  const EMPTY_STORY: StoryWithDefaults = Object.freeze({
    chapters: Object.freeze([]),
  }) as unknown as StoryWithDefaults;

  let normalisedConfig: StoryConfig = $derived(
    normaliseViewerConfig(
      parseViewerConfig(config, (error) => {
        console.warn(translate('warnings.invalidConfig'), error);
      }),
    ) as StoryConfig,
  );

  /* A story link can arrive the IIIF Content State way, as `?iiif-content=`. */
  const contentStateUrl = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('iiif-content') ?? undefined;
  };
  let effectiveStoryUrl = $derived(storyUrl ?? contentStateUrl());

  let root: HTMLDivElement | null = $state(null);
  let core: ViewerCoreInstance | null = $state(null);
  const bridge = createStoryViewerBridge();
  $effect(() => {
    if (core) bridge.attach(core, eventTarget ?? root);
  });
  onDestroy(() => bridge.detach());

  let storyData = $state<StoryWithDefaults | null>(null);
  let storyError: string | null = $state(null);
  let storyLoading = $state(false);
  let storyChapters = $state(0);
  let storyControlsDisabled = $state(true);
  let storyLoadToken = 0;
  let storyChapterThumbnails: Array<string | null> = $state([]);
  const storyThumbnailCache = new Map<string, string>();
  const storyViewBoxStore = writable<ViewBox | null>(null);
  const storyDataStore = writable<StoryWithDefaults>(EMPTY_STORY);

  const resolvePreferredStoryLanguage = (): string => {
    const configured = normalisedConfig.language?.trim();
    if (configured) return configured.toLowerCase();
    if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.split('-')[0]?.trim().toLowerCase();
      if (browserLang) return browserLang;
    }
    return STORY_DEFAULT_LANGUAGE;
  };
  let selectedLanguage = $state<string | null>(null);
  let availableLanguages = $derived.by(() => {
    const found = new Set<string>();
    const addKeys = (map: Record<string, unknown> | undefined) => {
      if (!map) return;
      for (const key of Object.keys(map)) {
        const cleaned = key.trim().toLowerCase();
        if (cleaned) found.add(cleaned);
      }
    };
    addKeys(storyData?.title);
    addKeys(storyData?.narration?.tracks);
    for (const chapter of storyData?.chapters ?? []) {
      addKeys(chapter.title);
      addKeys(chapter.description);
      addKeys(chapter.narrationSegment);
      for (const drawing of chapter.drawingAnnotations ?? []) {
        addKeys(drawing.label);
      }
    }
    return Array.from(found);
  });
  let storyLanguage = $derived.by(() => {
    if (selectedLanguage && availableLanguages.includes(selectedLanguage)) {
      return selectedLanguage;
    }
    const preferred = resolvePreferredStoryLanguage();
    if (availableLanguages.length === 0 || availableLanguages.includes(preferred)) {
      return preferred;
    }
    return availableLanguages.includes('en') ? 'en' : availableLanguages[0];
  });

  const resolveLanguageValue = (
    value: Record<string, string> | undefined,
    lang: string,
  ): string => {
    if (!value) return '';
    const preferred = value[lang]?.trim();
    if (preferred) return preferred;
    const firstAvailable = Object.values(value).find(
      (entry) => typeof entry === 'string' && entry.trim().length > 0,
    );
    return firstAvailable?.trim() ?? '';
  };

  /*
   * The fallback is a display string and stays one: an untitled story stays
   * untitled in the data, and the interface still has to say something.
   */
  let storyTitle = $derived.by(() => {
    const resolvedTitle = resolveLanguageValue(storyData?.title, storyLanguage);
    return resolvedTitle || $t('storyBuilder.settings.untitled');
  });

  const storyRuntime = createStoryViewerRuntime(bridge.api, {
    language: resolvePreferredStoryLanguage(),
  });
  const storyPlayback = createStoryPlayback({
    runtime: storyRuntime,
    guards: {
      canControl: () => !storyControlsDisabled,
      canNavigate: () => !storyControlsDisabled && !storyLoading,
      chapterCount: () => storyChapters,
    },
    onExternalStageFade: (handler) => bridge.events.on('stageFade', handler),
  });
  onDestroy(() => storyPlayback.destroy());

  const offViewBox = bridge.events.on('viewBoxChange', ({ viewBox }) => {
    storyViewBoxStore.set(viewBox);
  });
  onDestroy(offViewBox);

  let activeChapter = $derived(storyData?.chapters?.[storyPlayback.currentChapterIndex] ?? null);
  let chapterTitle = $derived.by(() => {
    const resolvedTitle = resolveLanguageValue(activeChapter?.title, storyLanguage);
    return (
      resolvedTitle || (storyChapters > 0 ? `Chapter ${storyPlayback.currentChapterIndex + 1}` : '')
    );
  });
  let chapterDescription = $derived(
    resolveLanguageValue(activeChapter?.description, storyLanguage),
  );
  let storyCurrentChapterId = $derived(activeChapter?.id ?? null);
  let activeAttribution = $derived.by(() => {
    const manifestId = activeChapter?.manifest;
    if (!manifestId) return null;
    const entry = $manifestsStore[manifestId];
    if (!entry?.json) return null;
    return extractManifestAttribution(entry.json, manifestId, storyLanguage);
  });
  let hasNarration = $derived(
    Boolean(
      storyData?.narration?.tracks &&
        Object.values(storyData.narration.tracks).some((track) => Boolean(track?.src?.trim())),
    ),
  );
  let framingMode = $derived<'exact' | 'fill'>(
    normalisedConfig.story?.framingMode === 'fill' ? 'fill' : 'exact',
  );

  $effect(() => {
    storyPlayback.setLanguage(storyLanguage);
  });

  let stageEl: HTMLElement | null = $state(null);
  onMount(() => {
    if (!stageEl || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        storyPlayback.refitCurrentChapter();
      }, 90);
    });
    observer.observe(stageEl);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  });

  const setStoryError = (message: string) => {
    storyError = message;
    storyControlsDisabled = true;
    onstoryViewerError?.({ message });
    bridge.events.emit('storyViewerError', { message });
  };

  const loadStoryInput = async (input: typeof story, url: string | undefined): Promise<void> => {
    const token = ++storyLoadToken;
    storyLoading = true;
    storyError = null;
    storyControlsDisabled = true;
    storyData = null;
    storyChapters = 0;

    let source: unknown;
    if (input !== undefined && input !== null && `${input}` !== '') {
      source = input;
    } else if (url) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source = await response.json();
      } catch {
        if (token !== storyLoadToken) return;
        setStoryError('Failed to load story');
        storyLoading = false;
        return;
      }
    } else {
      setStoryError('Story input missing');
      storyLoading = false;
      return;
    }

    if (token !== storyLoadToken) return;
    let parsed: unknown = source;
    if (typeof source === 'string') {
      try {
        parsed = JSON.parse(source);
      } catch {
        setStoryError('Invalid story JSON');
        storyLoading = false;
        return;
      }
    }

    const normalised = normaliseStoryInput(parsed);
    if (!normalised.ok || !normalised.story) {
      setStoryError(normalised.error ?? $t('storyViewer.invalid'));
      storyLoading = false;
      return;
    }

    const validation = validateStoryViewer(normalised.story);
    if (!validation.ok) {
      setStoryError(validation.errors[0] ?? $t('storyViewer.invalid'));
      storyLoading = false;
      return;
    }

    storyData = normalised.story;
    storyChapters = normalised.story.chapters.length;
    storyControlsDisabled = false;
    storyLoading = false;
    /* The stage only mounts once there is a story to show, so the viewer the
       runtime drives may still be on its way. */
    await bridge.ready;
    if (token !== storyLoadToken) return;
    await storyRuntime.loadStory(normalised.story);
  };

  const preloadStoryManifests = async (value: StoryWithDefaults): Promise<void> => {
    const uniqueManifestIds = Array.from(
      new Set(
        (value.chapters ?? [])
          .map((chapter) => chapter.manifest)
          .filter(
            (manifest): manifest is string => typeof manifest === 'string' && manifest.length > 0,
          ),
      ),
    );
    await Promise.all(uniqueManifestIds.map((manifest) => fetchManifest(manifest)));
  };

  $effect(() => {
    const input = story;
    const url = effectiveStoryUrl;
    untrack(() => void loadStoryInput(input, url));
  });
  $effect(() => {
    if (storyData?.chapters?.length) void preloadStoryManifests(storyData);
  });
  $effect(() => {
    storyChapterThumbnails = storyData?.chapters?.length
      ? storyData.chapters.map((chapter) => {
          const chapterKey = `${chapter.id}:${chapter.manifest}:${chapter.canvasIndex}`;
          const manifestEntry = $manifestsStore[chapter.manifest];
          if (!manifestEntry?.manifesto) {
            return storyThumbnailCache.get(chapterKey) ?? null;
          }
          const resolved = resolveCanvasThumbnail(
            manifestEntry.manifesto,
            undefined,
            chapter.canvasIndex,
          );
          if (resolved) {
            storyThumbnailCache.set(chapterKey, resolved);
            return resolved;
          }
          return storyThumbnailCache.get(chapterKey) ?? null;
        })
      : [];
  });
  $effect(() => {
    storyDataStore.set(storyData ?? EMPTY_STORY);
  });

  export function getStory(): StoryWithDefaults | null {
    return storyData;
  }

  export function getViewer() {
    return bridge.api;
  }

  export function on<K extends keyof StoryEventMap>(
    event: K,
    handler: (payload: StoryEventMap[K]) => void,
  ): () => void {
    return bridge.events.on(event, handler);
  }

  export function off<K extends keyof StoryEventMap>(
    event: K,
    handler: (payload: StoryEventMap[K]) => void,
  ): void {
    bridge.events.off(event, handler);
  }
</script>

<StoryShell variant="viewer" theme={normalisedConfig.theme} bind:root>
  {#snippet title()}
    <MangoFooterBrand position="inline" />
    {#if storyTitle}
      <span class="viewer__title-divider" aria-hidden="true">|</span>
      <span>{storyTitle}</span>
    {/if}
  {/snippet}

  {#snippet actions()}
    {#if availableLanguages.length > 1}
      <label class="story-viewer__language" data-testid="story-viewer-language">
        <Globe aria-hidden="true" />
        <select
          aria-label={$t('storyViewer.language')}
          value={storyLanguage}
          onchange={(event) => {
            selectedLanguage = (event.currentTarget as HTMLSelectElement).value;
          }}
        >
          {#each availableLanguages as lang}
            <option value={lang}>{lang.toUpperCase()}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/snippet}

  <div class="viewer__grid">
    <main class="stage stage--story" aria-label={$t('viewer.stage.label')} bind:this={stageEl}>
      <StoryControlsStage
        currentChapterIndex={storyPlayback.currentChapterIndex}
        totalChapters={storyChapters}
        chapterThumbnails={storyChapterThumbnails}
        chapterDurationSec={storyPlayback.chapterDurationSec}
        chapterElapsedSec={storyPlayback.chapterElapsedSec}
        presentationAspect={storyData?.presentationAspect}
        {framingMode}
        {hasNarration}
        isMuted={storyPlayback.isMuted}
        attribution={activeAttribution}
        stageOpacity={storyPlayback.stageOpacity}
        stageFadeMs={storyPlayback.stageFadeMs}
        {chapterTitle}
        {chapterDescription}
        disabled={storyControlsDisabled || storyLoading}
        loading={storyPlayback.isLoading}
        error={storyError}
        playState={storyPlayback.playState}
        onselectChapter={(detail) => storyPlayback.selectChapter(detail.index, true)}
        onplay={storyPlayback.play}
        onpause={storyPlayback.pause}
        onstop={storyPlayback.stop}
        ontoggleMute={storyPlayback.toggleMute}
        onzoomIn={() => core?.zoomIn()}
        onzoomOut={() => core?.zoomOut()}
        onfit={() => core?.goHome()}
        onrefresh={storyPlayback.refresh}
        onpreviousChapter={storyPlayback.previousChapter}
        onnextChapter={storyPlayback.nextChapter}
      >
        {#snippet stage()}
          <div class="stage__story-slot">
            <div class="stage__presentation-frame">
              <ViewerCore bind:this={core} config={normalisedConfig} {plugins} chrome={false} />
              <StoryAnnotationOverlay
                story={storyDataStore}
                viewBox={storyViewBoxStore}
                chapterId={storyCurrentChapterId}
                language={storyLanguage}
              />
            </div>
          </div>
        {/snippet}
      </StoryControlsStage>
    </main>
  </div>
</StoryShell>

<style>
  :global(.viewer--story-viewer) .viewer__grid {
    height: auto;
    min-height: 0;
  }

  :global(.viewer:fullscreen) .viewer__grid {
    max-height: 100%;
  }

  :global(.viewer:-webkit-full-screen) .viewer__grid {
    max-height: 100%;
  }

  :global(.viewer.viewer--fullscreen-fallback) .viewer__grid {
    max-height: 100%;
  }

  .viewer__grid {
    position: relative;
    display: grid;
    /*
       * `minmax(0, 1fr)`, never a bare `1fr`. A bare `1fr` is `minmax(auto, 1fr)`,
       * so the track floors at the content's min-content width — and OSD's <canvas>
       * carries an intrinsic width. On iOS that let the canvas pin the column at
       * its own size: a 343px-wide element ended up with a 541px stage, so the
       * image was laid out in a box wider than the viewer and appeared shoved right
       * and cropped. Zero-floored tracks let the stage shrink to the element.
       */
    grid-template-columns: minmax(0, 1fr);
    row-gap: 18px;
    column-gap: 18px;
    align-items: stretch;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    transition:
      grid-template-columns 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
      column-gap 240ms ease;
  }

  .stage {
    display: grid;
    gap: 12px;
    height: 100%;
    min-height: 0;
    /* Same reason as the grid tracks above: the canvas inside must never be able
         to push this column wider than the element that contains it. */
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    align-content: start;
  }

  .stage--story {
    --mango-viewer-av-player-max-width: calc((100cqh - 24px) * 16 / 9);
    overflow: hidden;
    align-content: stretch;
  }

  .stage__story-slot {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /*
     * The picture and everything drawn on it share one box.
     *
     * Annotations are positioned as percentages of their offset parent, so the
     * overlay has to be the same box as the media rather than the slot around
     * it. When those diverged, every shape was stretched across the difference —
     * a polygon drawn over a line of text ended up a third wider than the page.
     */
  .stage__presentation-frame {
    position: relative;
    display: grid;
    min-inline-size: 0;
    min-block-size: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  @container mango-viewer (max-width: 1024px) {
    .viewer__grid {
      /* minmax(0, …): a bare 1fr floors the track at the content min-content
           width, and the mobile dock rail is `max-content` (~541px), which dragged
           the stage wider than the element on iOS. */
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      row-gap: 8px;
      height: 100%;
      max-height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .viewer__grid {
      position: relative;
    }
    .viewer__grid > .stage {
      grid-row: 1;
      grid-column: 1;
    }
    .stage {
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .stage--story {
      height: 100%;
      overflow: hidden;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .viewer__grid {
      transition: none;
    }
  }

  .story-viewer__language {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 34px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--viewer-panel);
    color: var(--viewer-text);
    font-size: 12px;
    font-weight: 600;
  }

  .story-viewer__language :global(svg) {
    width: 14px;
    height: 14px;
    color: var(--viewer-muted);
  }

  .story-viewer__language select {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    outline: none;
  }
</style>
