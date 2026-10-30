<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { PanelLeft, PanelRight } from '@lucide/svelte';
  import {
    ViewerCore,
    normaliseViewerConfig,
    parseViewerConfig,
    resolveAnnotationJson,
    shapeFromResolved,
    shapeTool,
    styleClassForLayer,
    type ImageRendererExtension,
    type ResolvedAnnotation,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import { t, translate } from '../../core/i18n';
  import type {
    ChapterAnnotationTool,
    StoryConfig,
    StoryEventMap,
    StoryFrame,
    StoryPlugin,
    StoryPluginContext,
    StoryState,
  } from '../../core/types/story';
  import type { StoryBuilderController } from '../storyBuilderController';
  import type { ExportEnvelope } from '../storySerializer';
  import { normaliseStoryInput } from '../viewer/storyLoader';
  import AnnotationEditorLayer, {
    type LayerItem,
  } from '../annotations/AnnotationEditorLayer.svelte';
  import { STORY_LABEL_SIZING } from '../annotations/rectangleLabelLayout';
  import StoryStage from '../ui/StoryStage.svelte';
  import StoryFrameLayer from '../ui/StoryFrameLayer.svelte';
  import StoryShell from './StoryShell.svelte';
  import StoryPluginPanel from './StoryPluginPanel.svelte';
  import { createStoryViewerBridge } from './storyViewerBridge';

  interface Props {
    /** A story AnnotationPage to edit, as an object or JSON text. Wins over `storyUrl`. */
    story?: string | Record<string, unknown> | undefined;
    storyUrl?: string | undefined;
    config?: StoryConfig | string | undefined;
    /** Plugins for the embedded viewer's stage. */
    plugins?: ViewerPlugin[];
    /** Where viewer and story events are dispatched as DOM events. */
    eventTarget?: EventTarget | null;
  }

  let {
    story = undefined,
    storyUrl = undefined,
    config = undefined,
    plugins = [],
    eventTarget = null,
  }: Props = $props();

  const DEFAULT_ANNOTATION_LAYERS: LayerItem[] = [
    { id: 'research', name: 'Research Notes', color: '#fb7185', visible: true },
    {
      id: 'transcription',
      name: 'Transcription',
      color: '#60a5fa',
      visible: true,
    },
    { id: 'highlights', name: 'Highlights', color: '#34d399', visible: true },
    { id: 'mine', name: 'My Annotations', color: '#a78bfa', visible: true },
  ];
  // Portrait tablets need the same single-column treatment as phones.
  const MOBILE_LAYOUT_WIDTH = 1024;

  const matchesInitialMobileLayout = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(max-width: ${MOBILE_LAYOUT_WIDTH}px)`).matches;

  let normalisedConfig: StoryConfig = $derived(
    normaliseViewerConfig(
      parseViewerConfig(config, (error) => {
        console.warn(translate('warnings.invalidConfig'), error);
      }),
    ) as StoryConfig,
  );

  const contentStateUrl = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('iiif-content') ?? undefined;
  };
  let effectiveStoryUrl = $derived(storyUrl ?? contentStateUrl());

  /* Stage surfaces the builder draws over the embedded viewer. */
  let annotationTool = $state<ChapterAnnotationTool>('select');
  let storyAnnotations = $state<ResolvedAnnotation[]>([]);
  let storyAnnotationEditing = $state(false);
  let activeStoryAnnotationId = $state<string | null>(null);
  /* Motion keyframes remain selectable canvas objects. The chapter frame is
     the fixed StoryStage itself and is never drawn as a second rectangle. */
  let storyFrames = $state<StoryFrame[]>([]);
  let storyFrameSelection = $state<string | null>(null);
  let presentationAspect = $state(16 / 9);
  let stageOpacity = $state(1);
  let stageFadeMs = $state(0);

  const bridge = createStoryViewerBridge({
    setAnnotationTool: (tool) => {
      annotationTool = tool;
    },
    setStoryAnnotations: (annotations) => {
      storyAnnotations = annotations;
      if (
        activeStoryAnnotationId &&
        !annotations.some((annotation) => annotation.id === activeStoryAnnotationId)
      ) {
        activeStoryAnnotationId = null;
      }
    },
    setStoryAnnotationEditing: (enabled) => {
      storyAnnotationEditing = enabled;
      if (!enabled) {
        activeStoryAnnotationId = null;
        annotationTool = 'select';
      }
    },
    setStoryAnnotationSelection: (annotationId) => {
      activeStoryAnnotationId = annotationId;
    },
    setStoryPresentationAspect: (aspect) => {
      if (Number.isFinite(aspect) && aspect > 0) presentationAspect = aspect;
    },
    setStoryFrames: (frames) => {
      storyFrames = frames;
      const declaredAspect = frames.find(
        (frame) => Number.isFinite(frame.aspect) && frame.aspect > 0,
      )?.aspect;
      if (declaredAspect) presentationAspect = declaredAspect;
      if (storyFrameSelection && !frames.some((frame) => frame.id === storyFrameSelection)) {
        storyFrameSelection = null;
      }
    },
    setStoryFrameSelection: (frameId) => {
      storyFrameSelection = frameId;
    },
  });

  let root: HTMLDivElement | null = $state(null);
  let core: ViewerCoreInstance | null = $state(null);
  /* Plugins mount only once the viewer is attached: the builder controller
     reads and drives the viewer from the moment it is initialised. */
  let viewerReady = $state(false);
  $effect(() => {
    if (!core) return;
    bridge.attach(core, eventTarget ?? root);
    viewerReady = true;
  });

  /* The OpenSeadragon viewer the drawing and frame layers attach to. */
  let osdViewer: ImageRendererExtension['viewer'] | null = $state(null);
  let canvasSize = $state({ width: 0, height: 0 });
  let canvasId = $state<string | null>(null);

  const syncCanvasSize = () => {
    const size = osdViewer?.world?.getItemAt(0)?.getContentSize?.();
    if (size && size.x > 0 && size.y > 0) {
      canvasSize = { width: size.x, height: size.y };
      return;
    }
    const content = core?.getContentSize?.();
    if (content) canvasSize = { width: content.width, height: content.height };
  };

  const offs: Array<() => void> = [
    bridge.events.on('rendererReady', ({ renderer }) => {
      osdViewer?.removeHandler('open', syncCanvasSize);
      osdViewer = renderer.kind === 'image' ? renderer.viewer : null;
      osdViewer?.addHandler('open', syncCanvasSize);
      syncCanvasSize();
    }),
    bridge.events.on('mediaChange', ({ canvasId: id, mediaType }) => {
      canvasId = id;
      if (mediaType !== 'image') osdViewer = null;
    }),
    bridge.events.on('pageChange', ({ canvasId: id }) => {
      canvasId = id;
    }),
    bridge.events.on('stageFade', ({ opacity, durationMs }) => {
      stageOpacity = opacity;
      stageFadeMs = durationMs;
    }),
  ];
  onDestroy(() => {
    offs.forEach((off) => off());
    osdViewer?.removeHandler('open', syncCanvasSize);
    bridge.detach();
  });

  /*
   * The authoring stage is the thing being edited, so it gets the whole width
   * and the panels float above it. Collapsing them is how an author checks a
   * framing against what a reader will actually see.
   */
  const initialMobileLayout = matchesInitialMobileLayout();
  let isMobileLayout = $state(initialMobileLayout);
  let builderLeftCollapsed = $state(initialMobileLayout);
  let builderRightCollapsed = $state(initialMobileLayout);

  onMount(() => {
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const mobile = (root?.clientWidth ?? 0) <= MOBILE_LAYOUT_WIDTH;
      if (mobile && !isMobileLayout && !builderLeftCollapsed && !builderRightCollapsed) {
        builderRightCollapsed = true;
      }
      isMobileLayout = mobile;
    });
    observer.observe(root);
    return () => observer.disconnect();
  });

  /* Frame mode gives the fixed stage full attention. The selection sentinel
     contains no SVG object; it only moves chrome aside until Done/Escape. */
  let builderPanelsBeforeFrameTool: { left: boolean; right: boolean } | null = null;
  $effect(() => {
    const frameTool = storyFrameSelection === 'chapter';
    untrack(() => {
      if (frameTool && !builderPanelsBeforeFrameTool) {
        builderPanelsBeforeFrameTool = {
          left: builderLeftCollapsed,
          right: builderRightCollapsed,
        };
        builderLeftCollapsed = true;
        builderRightCollapsed = true;
      } else if (!frameTool && builderPanelsBeforeFrameTool) {
        builderLeftCollapsed = builderPanelsBeforeFrameTool.left;
        builderRightCollapsed = builderPanelsBeforeFrameTool.right;
        builderPanelsBeforeFrameTool = null;
      }
    });
  });

  /* The story being edited, and the builder plugins made for it. */
  let builderPlugins = $state<StoryPlugin[]>([]);
  let builderController: StoryBuilderController | null = $state(null);
  let pluginRequest = 0;

  const loadStoryForBuilder = async (
    input: typeof story,
    url: string | undefined,
  ): Promise<StoryState | null> => {
    let source: unknown;
    if (input !== undefined && input !== null && `${input}` !== '') {
      source = input;
    } else if (url) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source = await response.json();
      } catch (error) {
        console.error('Failed to load story for builder:', error);
        return null;
      }
    } else {
      return null;
    }

    let parsed: unknown = source;
    if (typeof source === 'string') {
      try {
        parsed = JSON.parse(source);
      } catch (error) {
        console.error('Invalid story JSON:', error);
        return null;
      }
    }

    const normalised = normaliseStoryInput(parsed);
    if (normalised.ok && normalised.story) return normalised.story;
    console.error(normalised.error ?? translate('storyViewer.invalidAnnotationPage'));
    return null;
  };

  $effect(() => {
    const input = story;
    const url = effectiveStoryUrl;
    untrack(() => {
      const requestId = ++pluginRequest;
      builderController = null;
      /*
       * Loaded on demand, as the viewer used to: the builder UI's styles then
       * follow the layout's, which is the order their shared selectors rely on.
       */
      void Promise.all([
        loadStoryForBuilder(input, url),
        import('../../plugins/storyBuilder'),
      ]).then(([loadedStory, { createStoryBuilderPlugins }]) => {
        if (requestId !== pluginRequest) return;
        const storyOptions = normalisedConfig.story;
        builderPlugins = createStoryBuilderPlugins({
          initialStory: loadedStory ?? undefined,
          languages: storyOptions?.languages,
          annotationPageId: storyOptions?.annotationPageId,
          annotationBase: storyOptions?.annotationBase,
          identifiersLocked: storyOptions?.identifiersLocked,
          onControllerReady: (controller) => {
            if (requestId === pluginRequest) builderController = controller;
          },
        });
      });
    });
  });
  $effect(() => {
    builderController?.setSaveConfig(normalisedConfig.story?.save ?? {});
  });

  const pluginContext: Omit<StoryPluginContext, 'mount'> = {
    viewer: bridge.api,
    events: bridge.events,
    get config(): StoryConfig {
      return normalisedConfig;
    },
  };
  const pluginsFor = (slot: StoryPlugin['slot']) =>
    (viewerReady ? builderPlugins : [])
      .filter((plugin) => plugin.slot === slot)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let topPlugins = $derived(pluginsFor('top'));
  let leftPlugins = $derived(pluginsFor('left'));
  let rightPlugins = $derived(pluginsFor('right'));
  let overlayPlugins = $derived(pluginsFor('overlay'));
  let bottomPlugins = $derived(pluginsFor('bottom'));

  /* Drawing on the stage, reported to the builder as story events. */
  const handleAnnotationCreate = (payload: {
    annotation: unknown;
    tool?: Exclude<ChapterAnnotationTool, 'select'>;
  }) => {
    const annotation = payload?.annotation;
    if (!annotation || typeof annotation !== 'object') return;
    const { annotation: resolved } = resolveAnnotationJson(annotation, {
      provenance: 'draft',
    });
    if (!resolved) return;
    bridge.events.emit('annotationCreate', {
      annotation: resolved,
      tool: payload.tool ?? shapeTool(shapeFromResolved(resolved)) ?? undefined,
    });
    annotationTool = 'select';
  };

  const handleAnnotationUpdate = (id: string, patch: Partial<ResolvedAnnotation>) => {
    let effectivePatch = patch;
    if (patch.targetStyleClass !== undefined) {
      const requested = patch.targetStyleClass.trim();
      const layer = DEFAULT_ANNOTATION_LAYERS.find(
        (entry) => entry.id === requested || styleClassForLayer(entry.id) === requested,
      );
      if (layer) {
        effectivePatch = {
          ...patch,
          targetStyleClass: styleClassForLayer(layer.id),
        };
      }
    }
    bridge.events.emit('annotationUpdate', {
      annotationId: id,
      patch: effectivePatch,
    });
  };

  /*
   * Motion opens a contextual bottom rail. Measure it so floating panels stop
   * above it. Narration and media timing share the slot but are full-stage
   * modals, so `apply` deliberately excludes them from this inset. The height
   * is written directly to the grid because an element binding inside the
   * custom element's shadow tree can report the initial zero rather than its
   * later content size.
   */
  const trackBottomInset = (node: HTMLElement) => {
    const grid = node.closest('.viewer__grid') as HTMLElement | null;
    const stage = node.closest('.stage') as HTMLElement | null;
    let toolbar: HTMLElement | null = null;
    const observer = new ResizeObserver(() => apply());
    const apply = () => {
      /* The toolbar only exists once a source is loaded, which is later than
         this footer mounts, so it is looked up until it is found. */
      if (!toolbar) {
        toolbar = stage?.querySelector('.stage__toolbar--below') ?? null;
        if (toolbar) observer.observe(toolbar);
      }
      const toolbarHeight = toolbar?.offsetHeight ?? 0;
      stage?.style.setProperty('--builder-toolbar-inset', `${toolbarHeight}px`);
      /* Audio and source-media timing use the whole stage as a modal
         workspace; the grid is marked so the sidebars step aside. */
      const modal = Boolean(node.querySelector('.story-wide-modal'));
      grid?.classList.toggle('viewer__grid--tool-modal', modal);
      const height = modal ? 0 : node.offsetHeight;
      grid?.style.setProperty(
        '--builder-bottom-inset',
        `${height > 0 ? height + toolbarHeight + 14 : 0}px`,
      );
    };
    apply();
    /* A resize observer on the empty bar alone kept reporting the initial 0
       when a tool filled it; the mutation observer catches that moment. */
    observer.observe(node);
    const mutations = new MutationObserver(apply);
    mutations.observe(node, { childList: true, subtree: true });
    if (stage) mutations.observe(stage, { childList: true, subtree: true });
    return {
      destroy() {
        observer.disconnect();
        mutations.disconnect();
        grid?.classList.remove('viewer__grid--tool-modal');
        grid?.style.removeProperty('--builder-bottom-inset');
        stage?.style.removeProperty('--builder-toolbar-inset');
      },
    };
  };

  /** A detached snapshot of the story being edited. */
  export function getStory(): StoryState | null {
    return builderController?.getStory() ?? null;
  }

  /** The builder's portable IIIF AnnotationPage representation. */
  export function exportStory(): ExportEnvelope | null {
    if (!builderController) return null;
    const validation = builderController.saveExport();
    return validation.ok ? builderController.getExportPayload() : null;
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

<StoryShell variant="builder" theme={normalisedConfig.theme} bind:root>
  {#snippet actions()}
    {#if topPlugins.length > 0}
      <div class="plugin-slot plugin-slot--top">
        {#each topPlugins as plugin (plugin.id)}
          <StoryPluginPanel {plugin} context={pluginContext} />
        {/each}
      </div>
    {/if}
  {/snippet}

  <div
    class="viewer__grid viewer__grid--builder-overlay"
    class:viewer__grid--builder-annotation-editing={storyAnnotationEditing}
    class:viewer__grid--builder-left-collapsed={builderLeftCollapsed}
    class:viewer__grid--builder-right-collapsed={builderRightCollapsed}
  >
    {#if leftPlugins.length > 0}
      <aside class="panel-stack panel-stack--left" aria-label={$t('viewer.panels.leftLabel')}>
        <div class="plugin-slot plugin-slot--left">
          {#each leftPlugins as plugin (plugin.id)}
            <StoryPluginPanel {plugin} context={pluginContext} />
          {/each}
        </div>
      </aside>
    {/if}

    <main class="stage stage--story-builder" aria-label={$t('viewer.stage.label')}>
      <div
        class="stage__primary"
        style={`opacity: ${stageOpacity}; transition: opacity ${stageFadeMs}ms ease-in-out;`}
      >
        <StoryStage aspect={presentationAspect} fluid={true}>
          <div class="story-builder__media">
            <ViewerCore
              bind:this={core}
              config={normalisedConfig}
              {plugins}
              chrome={false}
              toolbar={true}
            />

            <AnnotationEditorLayer
              enabled={storyAnnotationEditing}
              viewer={osdViewer}
              activeTool={annotationTool}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              {canvasId}
              annotations={storyAnnotations}
              activeAnnotationId={activeStoryAnnotationId}
              layers={DEFAULT_ANNOTATION_LAYERS}
              activeLayerId="mine"
              labelSizing={STORY_LABEL_SIZING}
              onannotationcreate={handleAnnotationCreate}
              onannotationupdate={(payload) => handleAnnotationUpdate(payload.id, payload.patch)}
              onannotationdelete={(payload) =>
                bridge.events.emit('annotationDelete', {
                  annotationId: payload.id,
                })}
              onannotationselect={(payload) => {
                if (storyAnnotationEditing) activeStoryAnnotationId = payload.id;
              }}
              ontoolchange={(payload) => (annotationTool = payload.tool)}
            />

            {#if storyFrames.length > 0}
              <StoryFrameLayer
                viewer={osdViewer}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                frames={storyFrames}
                selectedFrameId={storyFrameSelection}
                onframecommit={(payload) => bridge.events.emit('storyFrameChange', payload)}
                onframeselect={(payload) => {
                  storyFrameSelection = payload.frameId;
                  bridge.events.emit('storyFrameSelect', payload);
                }}
              />
            {/if}

            {#if overlayPlugins.length > 0}
              <div
                class="stage__overlay"
                class:stage__overlay--annotation-editing={storyAnnotationEditing}
              >
                <div class="plugin-slot plugin-slot--overlay">
                  {#each overlayPlugins as plugin (plugin.id)}
                    <StoryPluginPanel {plugin} context={pluginContext} overlay />
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </StoryStage>
      </div>

      {#if bottomPlugins.length > 0}
        <div class="stage__bottom" use:trackBottomInset>
          <div class="plugin-slot plugin-slot--bottom">
            {#each bottomPlugins as plugin (plugin.id)}
              <StoryPluginPanel {plugin} context={pluginContext} />
            {/each}
          </div>
        </div>
      {/if}
    </main>

    <button
      class="builder-panel-toggle builder-panel-toggle--left"
      type="button"
      data-testid="builder-toggle-chapters"
      aria-expanded={!builderLeftCollapsed}
      aria-label={builderLeftCollapsed
        ? $t('storyBuilder.panels.showChapters')
        : $t('storyBuilder.panels.hideChapters')}
      title={builderLeftCollapsed
        ? $t('storyBuilder.panels.showChapters')
        : $t('storyBuilder.panels.hideChapters')}
      onclick={() => {
        builderLeftCollapsed = !builderLeftCollapsed;
        if (!builderLeftCollapsed && isMobileLayout) builderRightCollapsed = true;
      }}
    >
      <PanelLeft class="builder-panel-toggle__icon" aria-hidden="true" strokeWidth={1.8} />
    </button>

    <button
      class="builder-panel-toggle builder-panel-toggle--right"
      type="button"
      data-testid="builder-toggle-tools"
      aria-expanded={!builderRightCollapsed}
      aria-label={builderRightCollapsed
        ? $t(
            storyAnnotationEditing
              ? 'storyBuilder.panels.showAnnotationInspector'
              : 'storyBuilder.panels.showTools',
          )
        : $t(
            storyAnnotationEditing
              ? 'storyBuilder.panels.hideAnnotationInspector'
              : 'storyBuilder.panels.hideTools',
          )}
      title={builderRightCollapsed
        ? $t(
            storyAnnotationEditing
              ? 'storyBuilder.panels.showAnnotationInspector'
              : 'storyBuilder.panels.showTools',
          )
        : $t(
            storyAnnotationEditing
              ? 'storyBuilder.panels.hideAnnotationInspector'
              : 'storyBuilder.panels.hideTools',
          )}
      onclick={() => {
        builderRightCollapsed = !builderRightCollapsed;
        if (!builderRightCollapsed && isMobileLayout) builderLeftCollapsed = true;
      }}
    >
      <PanelRight class="builder-panel-toggle__icon" aria-hidden="true" strokeWidth={1.8} />
      {#if storyAnnotationEditing}
        <span class="builder-panel-toggle__label">
          {$t(
            builderRightCollapsed
              ? 'storyBuilder.panels.showAnnotationInspector'
              : 'storyBuilder.panels.hideAnnotationInspector',
          )}
        </span>
      {/if}
    </button>

    {#if rightPlugins.length > 0}
      <aside class="panel-stack panel-stack--right" aria-label={$t('viewer.panels.rightLabel')}>
        <div class="plugin-slot plugin-slot--right">
          {#each rightPlugins as plugin (plugin.id)}
            <StoryPluginPanel {plugin} context={pluginContext} />
          {/each}
        </div>
      </aside>
    {/if}
  </div>
</StoryShell>

<style>
  .plugin-slot {
    display: grid;
    gap: 12px;
  }

  .story-builder__media {
    position: relative;
    display: grid;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  .stage__overlay {
    position: absolute;
    inset: 0;
    display: grid;
    align-content: start;
    gap: 12px;
    pointer-events: none;
  }

  .stage__overlay :global(.plugin-panel--overlay) {
    pointer-events: auto;
  }

  /*
   * Overlay plugins fill the stage and normally own its pointer input. While the
   * annotation editor is open, that transparent panel must not sit in front of
   * the editor's SVG handles. Interactive overlay children can still opt back
   * in with pointer-events: auto (for example, story placement controls).
   */
  .stage__overlay--annotation-editing :global(.plugin-panel--overlay) {
    pointer-events: none;
  }

  .panel-stack--left {
    box-sizing: border-box;
    padding: 16px;
    border-radius: var(--viewer-chrome-radius, 0);
    background: var(--story-sidebar-bg, var(--viewer-panel, #121922));
    color: var(--story-sidebar-text, var(--viewer-text, #e8edf4));
    border: 1px solid
      var(--story-sidebar-border, var(--viewer-panel-border, rgba(255, 255, 255, 0.08)));
    height: 100%;
    min-height: 0;
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
    overscroll-behavior: contain;
  }

  @container mango-viewer (max-width: 768px) {
    .panel-stack--left {
      padding: 12px;
    }
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

  /*
     * Story builder: one full-width stage with the panels floating above it.
     *
     * Docked panels took roughly 60% of the window, so the author composed in a
     * tall narrow box and the reader saw a wide one — the framing that looked
     * right while editing was never the framing they got. Overlaying the panels
     * gives the stage the shape a reader's does, and collapsing them is how you
     * check a chapter against the real thing without leaving the editor.
     */
  .viewer__grid--builder-overlay {
    position: relative;
    --builder-panel-inline: min(340px, 30vw);
    grid-template-columns: 1fr;
    column-gap: 0;
  }

  /* Properties need reading and typing width; the picture does not pay for it
       because panels float over the invariant StoryStage. */
  .viewer__grid--builder-annotation-editing {
    --builder-panel-inline: clamp(420px, 38%, 520px);
  }

  /* Annotation creation is canvas-first. Temporarily move both floating
       sidebars and their toggles away without changing the user's collapse
       preferences; they return when the annotation task is finished. */
  :global(.viewer--story-builder)
    .viewer__grid--builder-annotation-editing
    :global(.panel-stack--left),
  :global(.viewer--story-builder) .viewer__grid--builder-annotation-editing .panel-stack--right,
  :global(.viewer--story-builder) .viewer__grid--builder-annotation-editing .builder-panel-toggle {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /*
     * Scoped through `.viewer--story-builder` for specificity, not decoration:
     * the sidebar sets `.panel-stack--left:has(.story-sidebar) { height: 100% }`,
     * which ties this rule and wins on source order, leaving the panel full
     * height and covering the annotation footer.
     */
  :global(.viewer--story-builder) .viewer__grid--builder-overlay :global(.panel-stack--left),
  :global(.viewer--story-builder) .viewer__grid--builder-overlay .panel-stack--right {
    position: absolute;
    inset-block-start: 14px;
    /* Stops above the floating footer rather than covering its ends. */
    inset-block-end: calc(var(--builder-bottom-inset, 0px) + 14px);
    /*
       * The panels carry `height: 100%` for their docked layout. On an absolutely
       * positioned box that over-constrains the insets and the height wins, so
       * the panel ran past the footer regardless of where its bottom was set.
       */
    height: auto;
    inline-size: var(--builder-panel-inline);
    z-index: 6;
    /* Readable over the artwork without hiding it completely. */
    background: color-mix(in srgb, var(--viewer-panel) 92%, transparent);
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
    transition:
      transform 0.22s ease,
      opacity 0.22s ease;
  }

  .viewer__grid--builder-overlay :global(.panel-stack--left) {
    inset-inline-start: 14px;
  }

  .viewer__grid--builder-overlay .panel-stack--right {
    inset-inline-end: 14px;
  }

  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay.viewer__grid--builder-left-collapsed
    :global(.panel-stack--left) {
    transform: translateX(calc(-100% - 28px));
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }

  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay.viewer__grid--builder-right-collapsed
    .panel-stack--right {
    transform: translateX(calc(100% + 28px));
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }

  /* Story metadata and first-source setup now share the central modal. Keep
       the chapter/tools drawers out of that workspace. */
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--settings-modal)
    :global(.panel-stack--left),
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--settings-modal)
    .panel-stack--right {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }

  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--settings-modal)
    .builder-panel-toggle {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /* Export is also a focused modal workspace. Keep the chapter and tools
       drawers, including their restore handles, behind it until it closes. */
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--export-modal)
    :global(.panel-stack--left),
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--export-modal)
    .panel-stack--right,
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--export-modal)
    .builder-panel-toggle {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /* Narration and source-media timing are focused modal workspaces. Keep the
       chapter list, inspector, and their restore controls out of the modal until
       it closes, without changing the user's saved collapse state. */
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--tool-modal)
    :global(.panel-stack--left),
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--tool-modal)
    .panel-stack--right,
  :global(.viewer--story-builder)
    .viewer__grid--builder-overlay:global(.viewer__grid--tool-modal)
    .builder-panel-toggle {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /*
     * The focused annotation inspector already has Done plus sticky Save/Cancel
     * actions. Hiding the duplicate stage footer while the inspector is visible
     * returns its bottom clearance to the properties form. If the inspector is
     * collapsed, the stage Done control returns so the author is never trapped in
     * drawing mode.
     */
  .viewer__grid--builder-annotation-editing:not(.viewer__grid--builder-right-collapsed)
    .stage__bottom:has(:global(.story-wide-authoring--bare)) {
    display: none;
  }

  /* Once a shape tool is chosen, the artwork owns the workspace until the
       geometry is placed. The hidden marker comes from the annotation footer;
       using it here removes the footer shell as well as its contents. */
  .stage--story-builder .stage__bottom:has(:global(.story-wide-authoring--annotation-placing)) {
    display: none;
  }

  .viewer__grid--builder-annotation-editing:not(.viewer__grid--builder-right-collapsed)
    .panel-stack--right {
    inset-block-end: 14px;
  }

  .builder-panel-toggle {
    position: absolute;
    z-index: 8;
    inset-block-start: 18px;
    display: grid;
    place-items: center;
    inline-size: 34px;
    block-size: 34px;
    padding: 0;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: color-mix(in srgb, var(--viewer-panel, #0b121a) 88%, transparent);
    backdrop-filter: blur(10px);
    color: var(--viewer-text, #eef3f8);
    cursor: pointer;
    transition:
      inset-inline 0.22s ease,
      background 0.15s ease;
  }

  .builder-panel-toggle:hover {
    background: var(--viewer-panel, #0b121a);
  }

  .builder-panel-toggle :global(.builder-panel-toggle__icon) {
    inline-size: 17px;
    block-size: 17px;
  }

  .builder-panel-toggle__label {
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .viewer__grid--builder-annotation-editing .builder-panel-toggle--right {
    inline-size: auto;
    padding-inline: 10px;
    gap: 7px;
  }

  /* Sits just outside the panel it controls, and slides in when it collapses. */
  .builder-panel-toggle--left {
    inset-inline-start: calc(var(--builder-panel-inline) + 24px);
  }

  .viewer__grid--builder-left-collapsed .builder-panel-toggle--left {
    inset-inline-start: 18px;
  }

  .builder-panel-toggle--right {
    inset-inline-end: calc(var(--builder-panel-inline) + 24px);
  }

  .viewer__grid--builder-right-collapsed .builder-panel-toggle--right {
    inset-inline-end: 18px;
  }

  /* In the focused annotation workspace this becomes a labelled control in
       the inspector's own top-right corner. Keeping it inside avoids a wide pill
       covering the artwork; once collapsed, the general rule above returns the
       icon to the stage edge so the inspector is easy to restore. */
  .viewer__grid--builder-annotation-editing:not(.viewer__grid--builder-right-collapsed)
    .builder-panel-toggle--right {
    left: calc(100% - 224px) !important;
    right: auto !important;
    inset-inline-start: calc(100% - 224px) !important;
    inset-inline-end: auto !important;
    inline-size: 200px;
    justify-content: center;
  }

  :global(.viewer--story-builder) .viewer__grid {
    row-gap: 14px;
  }

  :global(.viewer--story-builder) .panel-stack--right {
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 18px;
    background: var(--viewer-panel);
  }

  :global(.viewer--story-builder) .panel-stack--right :global(.plugin-slot),
  :global(.viewer--story-builder) .panel-stack--right :global(.plugin-panel),
  :global(.viewer--story-builder) .panel-stack--right :global(.plugin-panel__panel),
  :global(.viewer--story-builder) .panel-stack--right :global(.plugin-panel__body) {
    height: 100%;
    min-height: 0;
  }

  :global(.viewer--story-builder) .panel-stack--right :global(.plugin-panel__panel) {
    padding: 0;
    border: 0;
    background: transparent;
  }

  :global(.viewer--story-builder) .panel-stack--right :global(.plugin-panel__title) {
    display: none;
  }

  :global(.viewer--story-preview) .viewer__grid {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  :global(.viewer--story-preview) .viewer__grid :global(.panel-stack--left),
  :global(.viewer--story-preview) .panel-stack--right {
    display: none !important;
  }

  /* Preview is the reader view. The panels are already removed above, so
       their floating restore handles must leave with them rather than sitting
       over the story image. Exit preview remains in the top bar. */
  :global(.viewer--story-preview) .builder-panel-toggle {
    display: none !important;
  }

  /* Preview is a clean reader view. The top-bar Exit control remains. */
  :global(.viewer--story-preview) .stage__bottom,
  :global(.viewer--story-preview) :global(.stage__toolbar--below) {
    display: none !important;
  }

  /* Motion preview keeps only its compact Stop / pin visibility / Done
       controls. The authoring footer itself remains removed. */
  :global(.viewer--story-preview) .stage__bottom:has(:global(.story-wide-preview-controls)) {
    display: block !important;
    width: auto;
    height: 48px;
    min-height: 48px;
    padding: 6px;
    overflow: visible;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 12px;
    background: var(--viewer-stage-bottom-bg, rgba(12, 16, 22, 0.86));
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
  }

  :global(.viewer--story-preview) .viewer__grid > .stage {
    grid-column: 1 !important;
    grid-row: 1 / -1 !important;
  }

  .panel-stack {
    display: grid;
    gap: 16px;
    align-content: start;
    min-height: 0;
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

  .stage__primary {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-height: 0;
    min-width: 0;
  }

  .stage--story-builder :global(.stage__toolbar--below) {
    /* `margin-top: 0` used to sit here to cancel the bar's old negative tuck.
         That tuck is gone, so zeroing the margin only reintroduced the overlap
         it was written to prevent. */
    padding-top: 8px;
  }

  /*
     * The authoring stage is one row the picture owns outright. Contextual tools
     * float over it — a compact rail for motion and full-stage modals for audio
     * and media timing — rather than taking a row of their own. Opening or
     * closing any of them therefore leaves the artwork, and the viewer's idea of
     * the current view, exactly the same size. The chapters rail and inspector
     * already float for the same reason.
     */
  .stage--story-builder {
    position: relative;
    z-index: 0;
    isolation: isolate;
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
  }

  .stage--story-builder .stage__bottom {
    position: absolute;
    z-index: 7;
    inset-inline: 14px;
    /* Just above the stage toolbar, which keeps the zoom controls in reach. */
    inset-block-end: calc(var(--builder-toolbar-inset, 0px) + 14px);
    width: auto;
    /* Grows upward with its content, never past the stage. */
    max-block-size: calc(100% - var(--builder-toolbar-inset, 0px) - 28px);
    overflow: auto;
    overscroll-behavior: contain;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
  }

  .stage--story-builder .stage__bottom:has(:global(.story-wide-modal)) {
    z-index: 10;
  }

  /* Video timing has its own player inside the modal. Do not leave a second,
       blurred copy painting behind it in the ordinary canvas workspace. */
  .stage--story-builder:has(:global(.story-wide-modal--video)) > .stage__primary {
    visibility: hidden;
  }

  .stage__bottom {
    display: grid;
    gap: 12px;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    padding: 12px;
    border-radius: var(--viewer-chrome-radius);
    background: var(--viewer-stage-bottom-bg, rgba(12, 16, 22, 0.72));
    border: 1px solid var(--viewer-panel-border);
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
    :global(.viewer--story-builder) .viewer__grid {
      --builder-panel-inline: min(360px, calc(100cqw - 28px));
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-rows: minmax(0, 1fr);
      gap: 0;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
    }
    :global(.viewer--story-builder) .viewer__grid--builder-annotation-editing {
      --builder-panel-inline: min(440px, calc(100% - 28px));
    }
    :global(.viewer--story-builder) .viewer__grid > .stage {
      grid-row: 1;
      grid-column: 1;
      height: 100%;
      overflow-x: hidden;
      overflow-y: hidden;
    }
    /*
       * Chapters and properties become drawers. They no longer take rows away
       * from the output stage, and the paired toggle handlers keep at most one
       * open on a small screen.
       */
    .builder-panel-toggle {
      display: grid;
    }
    .stage--story-builder {
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }
    .viewer__grid {
      position: relative;
    }
    .viewer__grid :global(.panel-stack--left) {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: min(280px, 85%);
      max-width: 85%;
      /* Above the backdrop, which is itself above the floating stage controls. */
      z-index: 14;
      transform: translateX(0);
      animation: viewer-slidein-left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      box-shadow: 10px 0 30px rgba(0, 0, 0, 0.4);
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
  }

  @container mango-viewer (max-width: 700px) {
    .viewer__grid--builder-annotation-editing .builder-panel-toggle--right {
      inline-size: 34px;
      padding-inline: 0;
    }
    .viewer__grid--builder-annotation-editing .builder-panel-toggle__label {
      display: none;
    }
    :global(.viewer--story-builder) .viewer__grid {
      grid-template-columns: 1fr !important;
      grid-template-rows: minmax(0, 1fr);
      height: 100%;
      max-height: 100%;
      overflow: hidden;
    }
    :global(.viewer--story-builder) .viewer__grid > .stage {
      grid-row: 1;
      grid-column: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .viewer__grid {
      transition: none;
    }
  }
</style>
