import {
  createEventBus,
  type EventBus,
  type ViewerCoreInstance,
  type ViewerEventMap,
} from '@mango-iiif/iiif-viewer/core';
import type { StoryEventMap, StoryViewerApi } from '../../core/types/story';

/** Story events a host page can listen for on the element itself. */
const DOM_STORY_EVENTS = new Set<keyof StoryEventMap>([
  'storyViewerError',
  'storySaveRequest',
  'storyExport',
  'storyFrameChange',
  'storyFrameSelect',
]);

export type StoryViewerBridge = {
  /**
   * The embedded viewer as story code sees it. Safe to hold before the viewer
   * has mounted: subscriptions are kept until it arrives, but calls made early
   * are no-ops, so anything that drives the viewer waits for `ready` first.
   */
  api: StoryViewerApi;
  /** Settles the first time a viewer is attached. */
  ready: Promise<void>;
  isReady: () => boolean;
  /** Viewer events relayed from the embedded viewer, plus story events. */
  events: EventBus<StoryEventMap>;
  attach: (core: ViewerCoreInstance, eventTarget?: EventTarget | null) => void;
  detach: () => void;
};

/**
 * Joins a headless `ViewerCore` to the story layer.
 *
 * `extensions` are the stage surfaces the host draws over the viewer (frames,
 * drawing, presentation aspect). They are the part of the story viewer API the
 * viewer package no longer knows about.
 */
export const createStoryViewerBridge = (
  extensions: Partial<StoryViewerApi> = {},
): StoryViewerBridge => {
  let core: ViewerCoreInstance | null = null;
  let eventTarget: EventTarget | null = null;
  const local = createEventBus<StoryEventMap>();
  const requested = new Set<keyof ViewerEventMap>();
  const relays = new Map<keyof ViewerEventMap, () => void>();
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const relay = (event: keyof ViewerEventMap) => {
    if (!core || relays.has(event)) return;
    relays.set(
      event,
      core.on(event, (payload) => local.emit(event, payload as never)),
    );
  };

  const events: EventBus<StoryEventMap> = {
    on(event, handler) {
      const off = local.on(event, handler);
      requested.add(event as keyof ViewerEventMap);
      relay(event as keyof ViewerEventMap);
      return off;
    },
    off: local.off,
    emit(event, payload) {
      local.emit(event, payload);
      if (eventTarget && DOM_STORY_EVENTS.has(event)) {
        eventTarget.dispatchEvent(
          new CustomEvent(event, {
            detail: payload,
            bubbles: true,
            composed: true,
          }),
        );
      }
    },
  };

  const api: StoryViewerApi = {
    getViewBox: () => core?.getViewBox() ?? null,
    setViewBox: (box) => core?.setViewBox(box),
    getContentSize: () => core?.getContentSize?.() ?? null,
    getZoom: () => core?.getZoom() ?? 100,
    setZoom: (percent) => core?.setZoom(percent),
    goHome: () => core?.goHome(),
    zoomIn: () => core?.zoomIn(),
    zoomOut: () => core?.zoomOut(),
    panTo: (x, y) => core?.panTo(x, y),
    getMediaType: () => core?.getMediaType() ?? null,
    getState: () => core?.getState() ?? null,
    getCanvasIndex: () => core?.getCanvasIndex() ?? -1,
    getCanvasId: () => core?.getCanvasId() ?? null,
    getCanvasCount: () => core?.getCanvasCount() ?? 0,
    setCanvasByIndex: (index) => core?.setCanvasByIndex(index),
    setCanvasById: (canvasId) => core?.setCanvasById(canvasId),
    setManifest: (id) => core?.setManifest(id),
    getManifestId: () => core?.getManifestId() ?? null,
    start: () => core?.start?.(),
    play: () => core?.play?.(),
    pause: () => core?.pause?.(),
    stop: () => core?.stop?.(),
    seekBy: (delta) => core?.seekBy?.(delta),
    seekTo: (time) => core?.seekTo?.(time),
    setMediaSegment: (start, end) => core?.setMediaSegment(start, end),
    setModelPose: (pose, options) => core?.setModelPose?.(pose, options),
    setModelOrbit: (orbit) => core?.setModelOrbit(orbit),
    setModelTarget: (target) => core?.setModelTarget(target),
    setModelOrientation: (orientation) => core?.setModelOrientation(orientation),
    getModelPose: () => core?.getModelPose?.() ?? null,
    getModelOrbit: () => core?.getModelOrbit?.() ?? null,
    getModelTarget: () => core?.getModelTarget?.() ?? null,
    getModelOrientation: () => core?.getModelOrientation?.() ?? null,
    addAnnotation: (annotation) => core?.addAnnotation(annotation) ?? Promise.resolve(),
    getAnnotations: () => core?.getAnnotations() ?? [],
    setAnnotations: (annotations) => core?.setAnnotations(annotations) ?? Promise.resolve(),
    updateAnnotation: (id, patch) => core?.updateAnnotation(id, patch) ?? Promise.resolve(),
    removeAnnotation: (id) => core?.removeAnnotation(id) ?? Promise.resolve(),
    selectAnnotation: (id, preventZoom) => core?.selectAnnotation(id, preventZoom),
    clearAnnotationSelection: () => core?.clearAnnotationSelection(),
    getSelectedAnnotationId: () => core?.getSelectedAnnotationId() ?? null,
    getRendererExtension: () => core?.getRendererExtension() ?? null,
    getStageSize: () => core?.getStageSize() ?? { width: 0, height: 0 },
    canvasToScreen: (point) => core?.canvasToScreen(point) ?? null,
    screenToCanvas: (point) => core?.screenToCanvas(point) ?? null,
    updateLayerOpacity: (id, opacity) => core?.updateLayerOpacity?.(id, opacity),
    getLayerOpacities: () => core?.getLayerOpacities?.() ?? {},
    getMediaSources: () => core?.getMediaSources?.() ?? [],
    on: (event, handler) => events.on(event, handler as never),
    off: (event, handler) => events.off(event, handler as never),
    ...extensions,
  };

  return {
    api,
    events,
    ready,
    isReady: () => core !== null,
    attach(next, target = null) {
      if (core === next) return;
      relays.forEach((off) => off());
      relays.clear();
      core = next;
      eventTarget = target;
      if (target) core.setEventTarget(target);
      requested.forEach(relay);
      markReady();
    },
    detach() {
      relays.forEach((off) => off());
      relays.clear();
      core = null;
      eventTarget = null;
    },
  };
};
