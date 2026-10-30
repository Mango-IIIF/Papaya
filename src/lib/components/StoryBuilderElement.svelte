<svelte:options
  customElement={{
    tag: 'mango-story-builder',
    shadow: 'open',
    props: {
      story: { attribute: 'story', type: 'String', reflect: true },
      storyUrl: { attribute: 'story-url', type: 'String', reflect: true },
      config: { attribute: 'config', type: 'String', reflect: false },
      plugins: { attribute: 'plugins', type: 'Object', reflect: false },
    },
  }}
/>

<script lang="ts">
  import type {
    ContentSize,
    MediaType,
    ViewBox,
    ViewerPlugin,
    ViewerStateSnapshot,
  } from '@mango-iiif/iiif-viewer/core';
  import type { StoryConfig, StoryEventMap, StoryState, StoryViewerApi } from '../core/types/story';
  import type { ExportEnvelope } from '../story/storySerializer';
  import StoryBuilder from '../story/host/StoryBuilder.svelte';

  export let story: string | Record<string, unknown> | undefined = undefined;
  export let storyUrl: string | undefined = undefined;
  export let config: string | StoryConfig | undefined = undefined;
  export let plugins: ViewerPlugin[] = [];

  let builder: StoryBuilder | null = null;

  /** A detached snapshot of the story being edited. */
  export function getStory(): StoryState | null {
    return builder?.getStory() ?? null;
  }

  /** The story as a portable IIIF AnnotationPage, or null while it is invalid. */
  export function exportStory(): ExportEnvelope | null {
    return builder?.exportStory() ?? null;
  }

  /** The embedded viewer's API, for pan, zoom and canvas control. */
  export function getViewer(): StoryViewerApi | null {
    return builder?.getViewer() ?? null;
  }

  /*
   * The embedded viewer's navigation, on the element itself, so a host page
   * can pan, zoom and turn pages exactly as it would with `<mango-viewer>`.
   */
  const viewerApi = () => getViewer();

  export function getViewBox(): ViewBox | null {
    return viewerApi()?.getViewBox() ?? null;
  }

  export function setViewBox(box: ViewBox): void {
    viewerApi()?.setViewBox(box);
  }

  export function getContentSize(): ContentSize | null {
    return viewerApi()?.getContentSize?.() ?? null;
  }

  export function getZoom(): number {
    return viewerApi()?.getZoom?.() ?? 100;
  }

  export function setZoom(percent: number): void {
    viewerApi()?.setZoom?.(percent);
  }

  export function zoomIn(): void {
    viewerApi()?.zoomIn?.();
  }

  export function zoomOut(): void {
    viewerApi()?.zoomOut?.();
  }

  export function goHome(): void {
    viewerApi()?.goHome?.();
  }

  export function panTo(x: number, y: number): void {
    viewerApi()?.panTo?.(x, y);
  }

  export function getState(): ViewerStateSnapshot | null {
    return viewerApi()?.getState() ?? null;
  }

  export function getManifestId(): string | null {
    return viewerApi()?.getManifestId() ?? null;
  }

  export function getMediaType(): MediaType | null {
    return viewerApi()?.getMediaType() ?? null;
  }

  export function getCanvasIndex(): number {
    return viewerApi()?.getCanvasIndex() ?? -1;
  }

  export function getCanvasId(): string | null {
    return viewerApi()?.getCanvasId() ?? null;
  }

  export function getCanvasCount(): number {
    return viewerApi()?.getCanvasCount?.() ?? 0;
  }

  export function setCanvasByIndex(index: number): void {
    viewerApi()?.setCanvasByIndex(index);
  }

  export function setCanvasById(canvasId: string): void {
    viewerApi()?.setCanvasById(canvasId);
  }

  export function addAnnotation(annotation: unknown): Promise<void> {
    return viewerApi()?.addAnnotation(annotation) ?? Promise.resolve();
  }

  export function on<K extends keyof StoryEventMap>(
    event: K,
    handler: (payload: StoryEventMap[K]) => void,
  ): () => void {
    return builder?.on(event, handler) ?? (() => undefined);
  }

  export function off<K extends keyof StoryEventMap>(
    event: K,
    handler: (payload: StoryEventMap[K]) => void,
  ): void {
    builder?.off(event, handler);
  }
</script>

<div class="element-root">
  <StoryBuilder bind:this={builder} {story} {storyUrl} {config} {plugins} />
</div>

<style>
  :host {
    display: block;
    width: 100%;
    /*
     * The element owns one definite block size. Embedders can override this
     * with ordinary site CSS (`mango-story-builder { height: 900px; }`) or with
     * the custom property. A definite host height keeps the shadow layout from
     * alternating between percentage and intrinsic sizing at breakpoints.
     */
    height: var(--mango-viewer-height, min(720px, 100vh));
    height: var(--mango-viewer-height, min(720px, 100svh));
    min-height: 0;
  }

  .element-root {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }
</style>
