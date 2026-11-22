<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import {
    ViewerCore,
    normaliseViewerConfig,
    parseViewerConfig,
    resolveAnnotationJson,
    shapeFromResolved,
    shapeTool,
    styleClassForLayer,
    type ImageRendererExtension,
    type MediaSource,
    type MediaType,
    type ResolvedAnnotation,
    type ViewBox,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import AnnotationEditorLayer, {
    type LayerItem,
  } from '../annotations/AnnotationEditorLayer.svelte';
  import { t, translate } from '../../core/i18n';
  import type {
    ChapterAnnotationTool,
    StoryConfig,
    StoryEventMap,
    StoryFrame,
    StoryState,
  } from '../../core/types/story';
  import type { ExportEnvelope } from '../storySerializer';
  import {
    createStoryBuilderController,
    type StoryBuilderController,
  } from '../storyBuilderController';
  import { normaliseStoryInput } from '../viewer/storyLoader';
  import { balanceCameraTrackKeyframes } from '../cameraTrack';
  import {
    containViewBox,
    fitViewBoxToContent,
    framingsWithin,
    resolvePresentationAspect,
  } from '../framing';
  import { STORY_LABEL_SIZING } from '../annotations/rectangleLabelLayout';
  import { renderChapterRichText } from '../richText';
  import { isSafeContentUrl } from '../sanitize';
  import StoryStage from '../ui/StoryStage.svelte';
  import StoryFrameLayer from '../ui/StoryFrameLayer.svelte';
  import StoryAnnotationOverlay from '../ui/StoryAnnotationOverlay.svelte';
  import StorySourcesModal from '../ui/StorySourcesModal.svelte';
  import SaveExportModal from '../ui/SaveExportModal.svelte';
  import StoryShell from './StoryShell.svelte';
  import { createStoryViewerBridge } from './storyViewerBridge';
  import StudioTitleBar from '../studio/StudioTitleBar.svelte';
  import StudioToolbar, { type StudioMode } from '../studio/StudioToolbar.svelte';
  import StudioFilmstrip from '../studio/StudioFilmstrip.svelte';
  import StudioStageHud from '../studio/StudioStageHud.svelte';
  import StudioInspector from '../studio/StudioInspector.svelte';
  import StudioBottomDock from '../studio/StudioBottomDock.svelte';
  import StudioWelcome from '../studio/StudioWelcome.svelte';
  import StudioSettingsModal from '../studio/StudioSettingsModal.svelte';

  interface Props {
    story?: string | Record<string, unknown> | undefined;
    storyUrl?: string | undefined;
    config?: string | StoryConfig | undefined;
    plugins?: ViewerPlugin[];
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
    { id: 'transcription', name: 'Transcription', color: '#60a5fa', visible: true },
    { id: 'highlights', name: 'Highlights', color: '#34d399', visible: true },
    { id: 'mine', name: 'My Annotations', color: '#a78bfa', visible: true },
  ];

  const COMPACT_LAYOUT_WIDTH = 960;

  const matchesInitialCompactLayout = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(max-width: ${COMPACT_LAYOUT_WIDTH}px)`).matches;

  let normalisedConfig: StoryConfig = $derived(
    normaliseViewerConfig(
      parseViewerConfig(config, (error) => {
        console.warn(translate('warnings.invalidConfig'), error);
      }),
    ) as StoryConfig,
  );

  const contentStateUrl = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    const raw = new URLSearchParams(window.location.search).get('iiif-content');
    return raw && isSafeContentUrl(raw) ? raw : undefined;
  };
  let effectiveStoryUrl = $derived(storyUrl ?? contentStateUrl());

  /* Embedded OpenSeadragon + Annotation + Frame state bridged from the controller. */
  let annotationTool = $state<ChapterAnnotationTool>('select');
  let storyAnnotations = $state<ResolvedAnnotation[]>([]);
  let storyAnnotationEditing = $state(false);
  let activeStoryAnnotationId = $state<string | null>(null);
  let storyFrames = $state<StoryFrame[]>([]);
  let storyFrameSelection = $state<string | null>(null);
  let presentationAspect = $state(16 / 9);
  let stageOpacity = $state(1);
  let stageFadeMs = $state(0);
  let liveViewBox = $state<ViewBox | null>(null);
  let userMovedStage = $state(false);

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
  let viewerReady = $state(false);

  $effect(() => {
    if (!core) return;
    bridge.attach(core, eventTarget ?? root);
    viewerReady = true;
  });

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
      const zoom = bridge.api.getZoom?.();
      if (typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0) {
        viewerZoomPercent = Math.round(zoom);
      }
    }),
    bridge.events.on('mediaChange', ({ canvasId: id, mediaType }) => {
      canvasId = id;
      if (mediaType !== 'image') osdViewer = null;
    }),
    bridge.events.on('pageChange', ({ canvasId: id }) => {
      canvasId = id;
    }),
    bridge.events.on('viewBoxChange', ({ viewBox }) => {
      liveViewBox = viewBox ?? null;
      const zoom = bridge.api.getZoom?.();
      if (typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0) {
        viewerZoomPercent = Math.round(zoom);
      }
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

  /* Studio layout state */
  const initialCompact = matchesInitialCompactLayout();
  let isCompact = $state(initialCompact);
  let chaptersOpen = $state(!initialCompact);
  let inspectorOpen = $state(!initialCompact);
  let mode = $state<StudioMode>('frame');
  let audioTrack = $state<'narration' | 'media'>('narration');
  let settingsOpen = $state(false);
  let sourcesInitialUrl = $state<string | null>(null);

  onMount(() => {
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const compact = (root?.clientWidth ?? 0) <= COMPACT_LAYOUT_WIDTH;
      if (compact && !isCompact && chaptersOpen && inspectorOpen) {
        inspectorOpen = false;
      }
      if (!compact && isCompact) {
        chaptersOpen = true;
        inspectorOpen = true;
      }
      isCompact = compact;
    });
    observer.observe(root);
    return () => observer.disconnect();
  });

  /* Controller & reactive store mirrors */
  let controller = $state<StoryBuilderController | null>(null);
  let storyState = $state<StoryState>({ chapters: [] });
  let selectedChapterId = $state<string | null>(null);
  let selectedPointId = $state<string | null>(null);
  let selectedAnnotationId = $state<string | null>(null);
  let activeLanguage = $state('en');
  let dirty = $state(false);
  let canUndo = $state(false);
  let canRedo = $state(false);
  let isPreviewing = $state(false);
  let motionPreviewing = $state(false);
  let mediaType = $state<MediaType | null>(null);
  let layers = $state<MediaSource[]>([]);
  let layerOpacities = $state<Record<string, number>>({});
  let currentManifest = $state<string | null>(null);
  let viewerCanvasIndex = $state(0);
  let viewerCanvasCount = $state(0);
  let viewerZoomPercent = $state(100);
  let sourcesModalOpen = $state(false);
  let saveModalOpen = $state(false);
  let saveModalPayload = $state<ExportEnvelope | null>(null);

  $effect(() => {
    const ctrl = controller;
    if (!ctrl) return;
    const unsubs = [
      ctrl.story.subscribe((v) => {
        storyState = v;
        presentationAspect = resolvePresentationAspect(v);
      }),
      ctrl.selectedChapterId.subscribe((v) => (selectedChapterId = v)),
      ctrl.selectedMotionPointId.subscribe((v) => (selectedPointId = v)),
      ctrl.selectedDrawingAnnotationId.subscribe((v) => (selectedAnnotationId = v)),
      ctrl.annotationLanguage.subscribe((v) => (activeLanguage = v || ctrl.language)),
      ctrl.dirty.subscribe((v) => (dirty = v)),
      ctrl.canUndo.subscribe((v) => (canUndo = v)),
      ctrl.canRedo.subscribe((v) => (canRedo = v)),
      ctrl.isPreviewing.subscribe((v) => (isPreviewing = v)),
      ctrl.motionPreviewing.subscribe((v) => (motionPreviewing = v)),
      ctrl.mediaType.subscribe((v) => (mediaType = v)),
      ctrl.mediaSources.subscribe((v) => (layers = v)),
      ctrl.layerOpacities.subscribe((v) => (layerOpacities = v)),
      ctrl.currentManifest.subscribe((v) => (currentManifest = v)),
      ctrl.viewerCanvasIndex.subscribe((v) => (viewerCanvasIndex = v)),
      ctrl.viewerCanvasCount.subscribe((v) => (viewerCanvasCount = v)),
      ctrl.sourcesModalOpen.subscribe((v) => {
        sourcesModalOpen = v;
        if (!v) sourcesInitialUrl = null;
      }),
      ctrl.saveModalOpen.subscribe((v) => (saveModalOpen = v)),
      ctrl.saveModalPayload.subscribe((v) => (saveModalPayload = v)),
      ctrl.activeChapterTask.subscribe((task) => {
        if (task === 'focus') mode = 'annotate';
        else if (task === 'audio-timing') {
          mode = 'audio';
          audioTrack = 'narration';
        } else if (task === 'media-timing') {
          mode = 'audio';
          audioTrack = 'media';
        } else if (mode === 'annotate') mode = 'frame';
      }),
    ];
    return () => unsubs.forEach((off) => off());
  });

  /* Load initial story into controller whenever story/storyUrl changes */
  let controllerRequest = 0;
  let detachController: (() => void) | null = null;

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
    if (!viewerReady) return;
    const input = story;
    const url = effectiveStoryUrl;
    const cfg = normalisedConfig;
    const request = ++controllerRequest;

    void untrack(async () => {
      const initialStory = await loadStoryForBuilder(input, url);
      if (request !== controllerRequest) return;

      detachController?.();
      const storyOptions = cfg.story;
      const ctrl = createStoryBuilderController({
        initialStory: initialStory ?? undefined,
        languages: storyOptions?.languages,
        annotationPageId: storyOptions?.annotationPageId,
        annotationBase: storyOptions?.annotationBase,
        identifiersLocked: storyOptions?.identifiersLocked,
      });
      ctrl.setSaveConfig(storyOptions?.save ?? {});
      detachController = ctrl.attach({
        viewer: bridge.api,
        events: bridge.events,
        config: cfg,
      });
      // Do not hijack fresh blank stories with the legacy narration modal:
      // StudioWelcome handles first-run right on the canvas.
      ctrl.uiMode.set('idle');
      controller = ctrl;
      mode = 'frame';
    });
  });

  onDestroy(() => {
    detachController?.();
  });

  /* Derived active chapter & WYSIWYG view-change detection */
  let hasChapters = $derived(storyState.chapters.length > 0);
  let activeChapterIndex = $derived(
    storyState.chapters.findIndex((c) => c.id === selectedChapterId),
  );
  let activeChapter = $derived(
    activeChapterIndex >= 0 ? storyState.chapters[activeChapterIndex] : null,
  );
  let storyTitle = $derived(
    storyState.title?.[activeLanguage] ??
      storyState.title?.[controller?.language ?? 'en'] ??
      Object.values(storyState.title ?? {})[0] ??
      '',
  );
  let canAnnotate = $derived(
    Boolean(activeChapter) && mediaType !== 'audio' && mediaType !== 'video' && mediaType !== 'model',
  );
  let activeAnnotationCount = $derived(activeChapter?.drawingAnnotations?.length ?? 0);

  let orderedShots = $derived(
    activeChapter?.cameraTrack ? balanceCameraTrackKeyframes(activeChapter.cameraTrack) : [],
  );
  let selectedShotIndex = $derived(
    selectedPointId ? orderedShots.findIndex((p) => p.id === selectedPointId) : -1,
  );
  let selectedShot = $derived(selectedShotIndex >= 0 ? orderedShots[selectedShotIndex] : null);

  /* Reset the "view moved" flag whenever chapter/shot selection or saved framing changes. */
  $effect(() => {
    void selectedChapterId;
    void selectedPointId;
    void activeChapter?.viewBox;
    void selectedShot?.viewBox;
    void isPreviewing;
    userMovedStage = false;
  });

  let viewModified = $derived.by(() => {
    if (
      !userMovedStage ||
      mode !== 'frame' ||
      isPreviewing ||
      motionPreviewing ||
      !activeChapter ||
      !liveViewBox ||
      canvasSize.width <= 0 ||
      canvasSize.height <= 0
    ) {
      return false;
    }
    const rawTarget = selectedShot?.viewBox ?? activeChapter.viewBox;
    if (!rawTarget) return false;
    const rawLive = containViewBox(liveViewBox, presentationAspect);
    const rawSaved = containViewBox(rawTarget, presentationAspect);
    const fitsCanvas =
      rawSaved.w <= canvasSize.width + 1 && rawSaved.h <= canvasSize.height + 1;
    const comparable = fitsCanvas ? fitViewBoxToContent(rawLive, canvasSize) : rawLive;
    const targetBox = fitsCanvas ? fitViewBoxToContent(rawSaved, canvasSize) : rawSaved;
    const tolerance = Math.max(2, Math.max(targetBox.w, targetBox.h) * 0.025);
    return !framingsWithin(comparable, targetBox, tolerance);
  });

  let chapterCard = $derived.by(() => {
    if (!activeChapter) return null;
    const title =
      activeChapter.title?.[activeLanguage]?.trim() ||
      activeChapter.title?.en?.trim() ||
      Object.values(activeChapter.title ?? {}).find((v) => v?.trim()) ||
      translate('storyBuilder.chapters.number', { number: activeChapterIndex + 1 });
    const rawDescription =
      activeChapter.description?.[activeLanguage]?.trim() ||
      activeChapter.description?.en?.trim() ||
      Object.values(activeChapter.description ?? {}).find((v) => v?.trim()) ||
      '';
    return {
      index: activeChapterIndex,
      total: storyState.chapters.length,
      title,
      descriptionHtml: renderChapterRichText(rawDescription),
    };
  });

  /* Keep audioTrack valid when switching to a non-AV chapter. */
  $effect(() => {
    const isAv = mediaType === 'audio' || mediaType === 'video' || Boolean(activeChapter?.media);
    if (!isAv && audioTrack === 'media') {
      audioTrack = 'narration';
    }
  });

  /* Mode switching */
  const selectMode = (next: StudioMode) => {
    if (!controller) return;
    if (next === 'annotate' && !canAnnotate) return;
    mode = next;
    if (next === 'annotate') {
      controller.activeChapterTask.set('focus');
      // Smart default: if there are no annotations yet, pick Rectangle immediately
      // so the author can drag on the artwork without an extra click.
      if (activeAnnotationCount === 0) {
        controller.setChapterAnnotationTool('rectangle');
      }
    } else if (next === 'audio') {
      controller.activeChapterTask.set(null);
    } else {
      controller.activeChapterTask.set(null);
    }
  };

  const openAudioTrack = (track: 'narration' | 'media') => {
    audioTrack = track;
    selectMode('audio');
  };

  /* Annotation callbacks from AnnotationEditorLayer */
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

  /* Keyboard shortcuts */
  const handleKeydown = (event: KeyboardEvent) => {
    if (!controller || !root) return;
    const path = event.composedPath?.() ?? [];
    const origin = path[0] ?? event.target;
    const inBuilder =
      origin === document.body ||
      origin === document.documentElement ||
      path.includes(root);
    if (!inBuilder) return;

    if (event.key === 'Escape') {
      if (settingsOpen) {
        settingsOpen = false;
        return;
      }
      if (isPreviewing) {
        controller.stopPreview();
        return;
      }
      if (mode === 'annotate') {
        selectMode('frame');
        return;
      }
    }
    controller.handleShortcut(event);
  };

  const handleSaveView = () => {
    if (!controller) return;
    if (selectedPointId) {
      controller.updateMotionPointFromViewport(selectedPointId);
    } else {
      controller.setChapterPositionFromView();
    }
  };

  const openSourcesWithUrl = (url?: string) => {
    sourcesInitialUrl = url ?? null;
    controller?.openSourcesModal();
  };

  /* Public component API (matches StoryBuilderElement expectations) */
  export function getStory(): StoryState | null {
    return controller?.getStory() ?? null;
  }

  export function exportStory(): ExportEnvelope | null {
    if (!controller) return null;
    const validation = controller.saveExport();
    return validation.ok ? controller.getExportPayload() : null;
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

<svelte:window onkeydown={handleKeydown} />

<StoryShell variant="builder" theme={normalisedConfig.theme} bind:root>
  {#snippet actions()}
    <div class="studio-topbar">
      <StudioTitleBar
        title={storyTitle}
        {dirty}
        {hasChapters}
        {chaptersOpen}
        onUpdateTitle={(value) => controller?.updateStoryTitle(activeLanguage, value)}
        onToggleChapters={() => {
          chaptersOpen = !chaptersOpen;
          if (chaptersOpen && isCompact) inspectorOpen = false;
        }}
      />

      <StudioToolbar
        {mode}
        {hasChapters}
        {canAnnotate}
        annotationCount={activeAnnotationCount}
        {canUndo}
        {canRedo}
        {isPreviewing}
        {inspectorOpen}
        onSelectMode={selectMode}
        onUndo={() => controller?.undo()}
        onRedo={() => controller?.redo()}
        onTogglePreview={() => {
          if (!controller) return;
          if (isPreviewing) controller.stopPreview();
          else controller.startPreview();
        }}
        onOpenSettings={() => (settingsOpen = true)}
        onExport={() => controller?.exportStory()}
        onToggleInspector={() => {
          inspectorOpen = !inspectorOpen;
          if (inspectorOpen && isCompact) chaptersOpen = false;
        }}
      />
    </div>
  {/snippet}

  <div
    class="viewer__grid studio-workspace"
    class:studio-workspace--compact={isCompact}
    class:studio-workspace--preview={isPreviewing}
    class:studio-workspace--no-chapters={!hasChapters}
    class:studio-workspace--left-open={hasChapters && !isPreviewing && chaptersOpen}
    class:studio-workspace--right-open={hasChapters && !isPreviewing && inspectorOpen}
  >
    {#if hasChapters && !isPreviewing && chaptersOpen}
      <div class="studio-workspace__left">
        <StudioFilmstrip
          story={storyState}
          {selectedChapterId}
          language={activeLanguage}
          languages={controller?.languages ?? ['en']}
          onSelectChapter={(chapterId) => {
            if (!controller) return;
            if (get(controller.selectedChapterId) !== chapterId) {
              controller.selectChapter(chapterId);
            }
            if (isCompact) chaptersOpen = false;
          }}
          onAddChapter={() => controller?.addChapter()}
          onOpenSources={() => openSourcesWithUrl()}
          onDuplicateChapter={(id) => controller?.duplicateChapter(id)}
          onDeleteChapter={(id) => controller?.deleteChapter(id)}
          onReorderChapter={(id, targetId, pos) =>
            controller?.reorderChapter(id, targetId, pos)}
        />
      </div>
    {/if}

    <div class="studio-workspace__center">
      <main
        class="studio-stage-host stage--story-builder"
        aria-label={$t('viewer.stage.label')}
        onpointerdown={() => {
          if (mode === 'frame' && !isPreviewing) userMovedStage = true;
        }}
        onwheel={() => {
          if (mode === 'frame' && !isPreviewing) userMovedStage = true;
        }}
      >
        <div
          class="studio-stage-host__fade"
          style={`opacity: ${stageOpacity}; transition: opacity ${stageFadeMs}ms ease-in-out;`}
        >
          <StoryStage
            aspect={presentationAspect}
            fluid={!isPreviewing || normalisedConfig.story?.framingMode === 'fill'}
          >
            <div class="studio-stage__media">
              <ViewerCore
                bind:this={core}
                config={normalisedConfig}
                {plugins}
                chrome={false}
                toolbar={false}
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
                onannotationupdate={(payload) =>
                  handleAnnotationUpdate(payload.id, payload.patch)}
                onannotationdelete={(payload) =>
                  bridge.events.emit('annotationDelete', {
                    annotationId: payload.id,
                  })}
                onannotationselect={(payload) => {
                  if (!storyAnnotationEditing) return;
                  activeStoryAnnotationId = payload.id;
                  if (payload.id) controller?.editChapterDrawingAnnotation(payload.id);
                  else controller?.finishChapterDrawingAnnotationEdit();
                }}
                ontoolchange={(payload) => {
                  annotationTool = payload.tool;
                  controller?.setChapterAnnotationTool(payload.tool);
                }}
              />

              {#if storyFrames.length > 0 && !isPreviewing}
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

              {#if controller && !storyAnnotationEditing && hasChapters}
                <div class="studio-stage__readonly-annotations">
                  <StoryAnnotationOverlay
                    story={controller.story}
                    viewBox={controller.viewBox}
                    chapterId={selectedChapterId}
                    language={activeLanguage}
                    showDrawings={true}
                    editable={false}
                  />
                </div>
              {/if}
            </div>
          </StoryStage>
        </div>

        {#if hasChapters}
          <StudioStageHud
            {mode}
            {isPreviewing}
            {viewModified}
            selectedShotNumber={selectedShotIndex >= 0 ? selectedShotIndex + 1 : null}
            canAddShot={canAnnotate}
            {annotationTool}
            {chapterCard}
            onSaveView={handleSaveView}
            onAddShot={() => controller?.addMotionPoint()}
            onResetView={() => {
              userMovedStage = false;
              controller?.resetViewToSaved();
            }}
            onSelectAnnotationTool={(tool) => controller?.setChapterAnnotationTool(tool)}
            onDoneAnnotating={() => selectMode('frame')}
          />
        {:else if controller}
          <StudioWelcome
            onLoadSingleManifest={(url) => controller?.loadManifestAndAddChapter(url)}
            onOpenSourcesWithUrl={openSourcesWithUrl}
          />
        {/if}
      </main>

      {#if controller && hasChapters && !isPreviewing}
        <StudioBottomDock
          {mode}
          {audioTrack}
          storyStore={controller.story}
          story={storyState}
          selectedChapterIdStore={controller.selectedChapterId}
          chapter={activeChapter}
          language={activeLanguage}
          languages={controller.languages}
          mediaTypeStore={controller.mediaType}
          {mediaType}
          mediaSourcesStore={controller.mediaSources}
          mediaMarksStore={controller.mediaMarks}
          avMarksValidStore={controller.avMarksValid}
          {selectedPointId}
          {motionPreviewing}
          onSelectAudioTrack={(track) => (audioTrack = track)}
          onOpenAudioTrack={openAudioTrack}
          onSaveView={handleSaveView}
          onAddShot={(atTimeMs) => controller?.addMotionPoint(atTimeMs)}
          onGoToShot={(id) => controller?.goToMotionPoint(id)}
          onSelectShot={(id) => controller?.selectMotionPoint(id)}
          onMoveShotTime={(id, ms, maxMs) => controller?.moveMotionPointTime(id, ms, maxMs)}
          onEvenSpaceShots={() => controller?.evenSpaceMotionPoints()}
          onScrubTo={(ms) => controller?.scrubMotionTo(ms)}
          onPreviewMotion={(opts) => controller?.previewMotion(opts)}
          onStopMotionPreview={() => controller?.stopMotionPreview()}
          onUpdateMotionDuration={(ms) => controller?.updateMotionDuration(ms)}
          onPreviewChapter={(id) => controller?.previewChapter(id)}
          onSetNarrationTrack={(lang, src) => controller?.setNarrationTrack(lang, src)}
          onAssignNarrationSegment={(lang, start, end) =>
            controller?.assignNarrationSegment(lang, start, end)}
          onSkipNarration={(lang) => controller?.skipNarration(lang)}
          onAssignMediaSegment={(start, end) => controller?.assignMediaSegment(start, end)}
          onPreviewMediaSegment={() => controller?.previewMediaSegment()}
          onStopPreviewMediaSegment={() => controller?.stopPreviewMediaSegment()}
        />
      {/if}
    </div>

    {#if controller && hasChapters && !isPreviewing && inspectorOpen}
      <div class="studio-workspace__right">
        <StudioInspector
          {mode}
          {audioTrack}
          storyStore={controller.story}
          story={storyState}
          chapter={activeChapter}
          chapterIndex={activeChapterIndex}
          language={activeLanguage}
          languages={controller.languages}
          {mediaType}
          {layers}
          {layerOpacities}
          {selectedPointId}
          selectedAnnotationIdStore={controller.selectedDrawingAnnotationId}
          {selectedAnnotationId}
          {viewerCanvasIndex}
          {viewerCanvasCount}
          {viewerZoomPercent}
          onPrevCanvas={() =>
            controller?.selectCanvas(Math.max(0, viewerCanvasIndex - 1))}
          onNextCanvas={() =>
            controller?.selectCanvas(
              Math.min(Math.max(0, viewerCanvasCount - 1), viewerCanvasIndex + 1),
            )}
          onZoomOut={() => {
            userMovedStage = true;
            bridge.api.zoomOut();
          }}
          onZoomIn={() => {
            userMovedStage = true;
            bridge.api.zoomIn();
          }}
          onGoHome={() => {
            userMovedStage = true;
            bridge.api.goHome();
          }}
          onLanguageChange={(lang) => controller?.setAnnotationLanguage(lang)}
          onOpenSources={() => openSourcesWithUrl()}
          onUpdateTitle={(lang, val) => controller?.updateChapterTitle(lang, val)}
          onUpdateDescription={(lang, val) => controller?.updateChapterDescription(lang, val)}
          onApplyPreset={(preset) => controller?.applyMotionPreset(preset)}
          onClearMotion={() => controller?.clearMotionTrack()}
          onAddShot={() => controller?.addMotionPoint()}
          onGoToShot={(id) => controller?.goToMotionPoint(id)}
          onSelectShot={(id) => controller?.selectMotionPoint(id)}
          onUpdateShotFromView={(id) => controller?.updateMotionPointFromViewport(id)}
          onReorderShot={(id, dir) => controller?.reorderMotionPoint(id, dir)}
          onDeleteShot={(id) => controller?.deleteMotionPoint(id)}
          onUpdateMotionDuration={(ms) => controller?.updateMotionDuration(ms)}
          onUpdateMotionPathType={(p) => controller?.updateMotionPathType(p)}
          onUpdateMotionDwell={(ms) => controller?.updateMotionInitialDwell(ms)}
          onUpdateMotionEasing={(e) => controller?.updateMotionEasing(e)}
          onEvenSpaceShots={() => controller?.evenSpaceMotionPoints()}
          onUpdateAdvanceMode={(m) => controller?.updateAdvanceMode(m)}
          onUpdateDelay={(ms) => controller?.updateDelay(ms)}
          onUpdateLayerOpacity={(id, op) => controller?.updateLayerOpacity(id, op)}
          onEditAnnotation={(id) => controller?.editChapterDrawingAnnotation(id)}
          onFinishAnnotationEdit={() => controller?.finishChapterDrawingAnnotationEdit()}
          onDeleteAnnotation={(id) => controller?.deleteChapterDrawingAnnotation(id)}
          onSetAnnotationLabel={(id, lang, val) =>
            controller?.setChapterDrawingAnnotationLabel(id, lang, val)}
          onSetAnnotationStyle={(id, style) =>
            controller?.setChapterDrawingAnnotationStyle(id, style)}
          onSetNarrationTrack={(lang, src) => controller?.setNarrationTrack(lang, src)}
          onSkipNarration={(lang) => controller?.skipNarration(lang)}
          onSelectAudioTrack={(track) => (audioTrack = track)}
        />
      </div>
    {/if}

    {#if isCompact && hasChapters && !isPreviewing && (chaptersOpen || inspectorOpen)}
      <button
        type="button"
        class="studio-workspace__scrim"
        tabindex="-1"
        aria-label={$t('common.close')}
        onclick={() => {
          chaptersOpen = false;
          inspectorOpen = false;
        }}
      ></button>
    {/if}

    {#if controller && sourcesModalOpen}
      <StorySourcesModal
        story={controller.story}
        open={true}
        {currentManifest}
        initialUrl={sourcesInitialUrl}
        hasSelectedChapter={Boolean(selectedChapterId)}
        language={activeLanguage}
        onClose={() => controller?.closeSourcesModal()}
        onSelectSourceCanvas={(manifest, canvasIndex, selectMode) =>
          controller?.selectSourceCanvas(manifest, canvasIndex, selectMode)}
      />
    {/if}

    <StudioSettingsModal
      open={settingsOpen}
      story={storyState}
      onClose={() => (settingsOpen = false)}
      onUpdateAspect={(aspect) => controller?.updateStoryAspect(aspect)}
      onUpdateIdentifiers={(id, base) => controller?.updateStoryIdentifiers(id, base)}
    />

    <SaveExportModal
      open={saveModalOpen}
      payload={saveModalPayload}
      onclose={() => controller?.closeSaveModal()}
    />
  </div>
</StoryShell>

<style>
  .studio-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .studio-workspace {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--viewer-stage-tail, #090d13);
  }

  .studio-workspace--left-open:not(.studio-workspace--compact) {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .studio-workspace--right-open:not(.studio-workspace--compact) {
    grid-template-columns: minmax(0, 1fr) 308px;
  }

  .studio-workspace--left-open.studio-workspace--right-open:not(.studio-workspace--compact) {
    grid-template-columns: 220px minmax(0, 1fr) 308px;
  }

  .studio-workspace__left,
  .studio-workspace__right {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .studio-workspace__center {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .studio-stage-host {
    position: relative;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
    overflow: hidden;
    background: radial-gradient(
      circle at 50% 45%,
      rgba(255, 255, 255, 0.025),
      var(--viewer-stage-tail, #070b11) 75%
    );
  }

  .studio-workspace--preview .studio-stage-host {
    padding: 8px;
  }

  .studio-stage-host__fade {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .studio-stage__media {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .studio-stage__media :global(.viewer-core),
  .studio-stage__media :global(.viewer-core__stage) {
    width: 100%;
    height: 100%;
  }

  .studio-stage__readonly-annotations {
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
  }

  /* Compact / tablet / mobile drawers */
  .studio-workspace--compact .studio-workspace__left,
  .studio-workspace--compact .studio-workspace__right {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 25;
    width: min(300px, 84vw);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  }

  .studio-workspace--compact .studio-workspace__left {
    left: 0;
  }

  .studio-workspace--compact .studio-workspace__right {
    right: 0;
  }

  .studio-workspace__scrim {
    position: absolute;
    inset: 0;
    z-index: 20;
    border: 0;
    padding: 0;
    background: rgba(3, 7, 12, 0.52);
    cursor: pointer;
  }
</style>
