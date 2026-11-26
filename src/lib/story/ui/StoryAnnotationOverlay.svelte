<script lang="ts">
  import { t } from '../../core/i18n';
  import { readable, type Readable } from 'svelte/store';
  import {
    AnnotationOverlay,
    projectOverlayItems,
    viewBoxProjector,
    type CanvasOverlayItem,
  } from '@mango-iiif/annotation/view';
  import '@mango-iiif/annotation/view.css';
  import { ANNOTATION_STROKE_WIDTH_PX } from '../../core/types/story';
  import type { ChapterDrawingAnnotation, StoryState } from '../../core/types/story';
  import type { ViewBox } from '@mango-iiif/iiif-viewer/core';
  import {
    fitRectangleLabelLayout,
    rectangleLabelOutlineWidth,
    STORY_LABEL_SIZING,
  } from '../annotations/rectangleLabelLayout';
  import { coerceAnnotationPlacement, DEFAULT_ANNOTATION_PLACEMENT } from '../annotationPlacement';
  import { sanitizeCssColor } from '../sanitize';

  interface Props {
    story: Readable<StoryState>;
    viewBox?: Readable<ViewBox | null>;
    chapterId?: string | null;
    language?: string;
    visible?: boolean;
    showDrawings?: boolean;
    editable?: boolean;
    onEditText?: (language: string) => void;
  }

  let {
    story,
    viewBox = readable(null),
    chapterId = null,
    language = 'en',
    visible = true,
    showDrawings = true,
    editable = false,
    onEditText = undefined,
  }: Props = $props();

  let chapter = $derived($story.chapters.find((item) => item.id === chapterId) ?? null);
  let annotation = $derived(chapter?.annotations?.[language] ?? null);
  let text = $derived(annotation?.text ?? '');
  let fallbackPlacement = $derived(
    Object.values(chapter?.annotations ?? {})
      .map((entry) => coerceAnnotationPlacement(entry?.placement))
      .find((entry) => Boolean(entry)),
  );
  let placement = $derived(
    coerceAnnotationPlacement(annotation?.placement) ??
      coerceAnnotationPlacement(chapter?.annotationPlacement) ??
      fallbackPlacement ??
      DEFAULT_ANNOTATION_PLACEMENT,
  );
  let captureViewBox = $derived(chapter?.viewBox ?? null);
  let currentViewBox = $derived($viewBox);
  let isAbsolute = $derived(
    Boolean(
      placement && (placement.x > 1 || placement.y > 1 || placement.w > 1 || placement.h > 1),
    ),
  );
  let canvasBounds = $derived(
    isAbsolute
      ? placement
      : captureViewBox
        ? {
            x: captureViewBox.x + captureViewBox.w * placement.x,
            y: captureViewBox.y + captureViewBox.h * placement.y,
            w: captureViewBox.w * placement.w,
            h: captureViewBox.h * placement.h,
          }
        : null,
  );
  let projectedBounds = $derived(
    canvasBounds && currentViewBox
      ? {
          x: (canvasBounds.x - currentViewBox.x) / currentViewBox.w,
          y: (canvasBounds.y - currentViewBox.y) / currentViewBox.h,
          w: canvasBounds.w / currentViewBox.w,
          h: canvasBounds.h / currentViewBox.h,
        }
      : null,
  );
  let anchored = $derived(
    projectedBounds !== null &&
      Number.isFinite(projectedBounds.x) &&
      Number.isFinite(projectedBounds.y) &&
      Number.isFinite(projectedBounds.w) &&
      Number.isFinite(projectedBounds.h),
  );
  let inView = $derived(
    anchored &&
      projectedBounds !== null &&
      projectedBounds.x + projectedBounds.w >= 0 &&
      projectedBounds.x <= 1 &&
      projectedBounds.y + projectedBounds.h >= 0 &&
      projectedBounds.y <= 1,
  );
  let annotationScale = $derived(
    captureViewBox && currentViewBox && currentViewBox.w > 0
      ? Math.max(0.15, captureViewBox.w / currentViewBox.w)
      : 1,
  );
  let noteStyle = $derived(
    anchored && projectedBounds
      ? `left: ${(projectedBounds.x * 100).toFixed(3)}%; top: ${(projectedBounds.y * 100).toFixed(3)}%; width: ${(projectedBounds.w * 100).toFixed(3)}%; height: ${(projectedBounds.h * 100).toFixed(3)}%; --annotation-scale:${annotationScale};`
      : `left: ${(placement.x * 100).toFixed(3)}%; top: ${(placement.y * 100).toFixed(3)}%; width: ${(placement.w * 100).toFixed(3)}%; height: ${(placement.h * 100).toFixed(3)}%; --annotation-scale:1;`,
  );
  let show = $derived(Boolean(visible && text && chapterId && (!anchored || inView)));

  type DrawingMeta = {
    id: string;
    kind: 'rect' | 'point' | 'polygon' | 'line';
    color: string;
    label: string;
    cx: number;
    cy: number;
    w?: number;
    h?: number;
    pointNumber?: number;
  };

  const labelForDrawing = (item: ChapterDrawingAnnotation): string =>
    item.label?.[language] ?? item.label?.en ?? item.text ?? '';

  let projected = $derived.by(() => {
    const cvb = currentViewBox;
    if (!cvb) return { overlayShapes: [], meta: [] as DrawingMeta[] };

    const items: CanvasOverlayItem[] = [];
    const colorById = new Map<string, string>();
    const labelById = new Map<string, string>();
    let pointCounter = 0;

    for (const item of chapter?.drawingAnnotations ?? []) {
      const color = sanitizeCssColor(item.color, 'var(--accent, #e07a3f)');
      const strokeWidth = ANNOTATION_STROKE_WIDTH_PX[item.strokeWidth ?? 'medium'];
      const fillMode = item.fillMode ?? 'transparent';
      const label = labelForDrawing(item);
      colorById.set(item.id, color);
      labelById.set(item.id, label);

      const fillColor =
        fillMode === 'solid' ? color : `color-mix(in srgb, ${color} 16%, transparent)`;

      if (item.rect) {
        items.push({
          id: item.id,
          rect: item.rect,
          className: 'story-annotation-overlay__shape',
          style: { strokeColor: color, strokeWidth, fillColor },
        });
      } else if (item.point) {
        pointCounter += 1;
        items.push({
          id: item.id,
          point: item.point,
          pointNumber: pointCounter,
          style: { strokeColor: color, strokeWidth, fillColor: color },
        });
      } else if (item.points?.length) {
        const isPolygon = item.type === 'polygon';
        items.push({
          id: item.id,
          polygon: { points: item.points },
          openPath: !isPolygon,
          className: isPolygon ? 'story-annotation-overlay__shape' : 'story-annotation-overlay__line',
          style: isPolygon
            ? { strokeColor: color, strokeWidth, fillColor }
            : { strokeColor: color, strokeWidth },
        });
      }
    }

    const overlayShapes = projectOverlayItems(items, viewBoxProjector(cvb, 100, 100));
    const meta: DrawingMeta[] = overlayShapes.map((shape) => {
      const color = colorById.get(shape.id) ?? 'var(--accent, #e07a3f)';
      const label = labelById.get(shape.id) ?? '';
      if (shape.kind === 'rect' && shape.rect) {
        return {
          id: shape.id,
          kind: 'rect',
          color,
          label,
          cx: shape.rect.x + shape.rect.width / 2,
          cy: shape.rect.y + shape.rect.height / 2,
          w: shape.rect.width,
          h: shape.rect.height,
        };
      }
      if (shape.kind === 'point' && shape.point) {
        return {
          id: shape.id,
          kind: 'point',
          color,
          label,
          cx: shape.point.x,
          cy: shape.point.y,
          pointNumber: shape.pointNumber,
        };
      }
      const pts = shape.points ?? [];
      const cx = pts.length ? pts.reduce((sum, p) => sum + p.x, 0) / pts.length : 0;
      const cy = pts.length ? pts.reduce((sum, p) => sum + p.y, 0) / pts.length : 0;
      return {
        id: shape.id,
        kind: shape.kind === 'polygon' ? 'polygon' : 'line',
        color,
        label,
        cx,
        cy,
      };
    });

    return { overlayShapes, meta };
  });

  let pointMarkers = $derived(projected.meta.filter((shape) => shape.kind === 'point'));
  let shapeLabels = $derived(projected.meta.filter((shape) => shape.label.trim().length > 0));
  let hasDrawings = $derived(visible && showDrawings && projected.overlayShapes.length > 0);

  let overlayWidth = $state(0);
  let overlayHeight = $state(0);
  const drawingLabelStyle = (shape: DrawingMeta): string => {
    if (shape.kind !== 'rect' || shape.w == null || shape.h == null) {
      return `left:${shape.cx}%; top:${shape.cy}%; border-color:${shape.color}; --annotation-scale:${annotationScale};`;
    }
    const width = (overlayWidth * shape.w) / 100;
    const height = (overlayHeight * shape.h) / 100;
    const { fontSize, lineHeight, visibleLines } = fitRectangleLabelLayout(
      width,
      height,
      shape.label,
      { sizing: STORY_LABEL_SIZING },
    );
    const outlineWidth = rectangleLabelOutlineWidth(fontSize);
    const padding = Math.max(2, fontSize * 0.28);
    return `left:${shape.cx}%; top:${shape.cy}%; width:${shape.w}%; height:${shape.h}%; padding:${padding.toFixed(2)}px; font-size:${fontSize.toFixed(2)}px; line-height:${lineHeight.toFixed(2)}px; -webkit-text-stroke-width:${outlineWidth.toFixed(2)}px; --label-lines:${visibleLines};`;
  };

  /**
   * Whether a rectangle's label fits inside it at a readable size.
   */
  const labelOverflows = (shape: DrawingMeta): boolean => {
    if (shape.kind !== 'rect' || shape.w == null || shape.h == null) return false;
    if (!overlayWidth || !overlayHeight) return false;
    return fitRectangleLabelLayout(
      (overlayWidth * shape.w) / 100,
      (overlayHeight * shape.h) / 100,
      shape.label,
      { sizing: STORY_LABEL_SIZING },
    ).overflow;
  };
</script>

<div
  class="story-annotation-overlay"
  data-testid="story-annotation-overlay"
  bind:clientWidth={overlayWidth}
  bind:clientHeight={overlayHeight}
>
  {#if show}
    <button
      type="button"
      class="story-annotation-overlay__note"
      class:story-annotation-overlay__note--editable={editable}
      data-testid="story-annotation-note"
      style={noteStyle}
      disabled={!editable}
      aria-label={`Edit text annotation: ${text}`}
      onclick={() => editable && onEditText?.(language)}
    >
      {text}
    </button>
  {/if}
  {#if hasDrawings}
    <AnnotationOverlay
      shapes={projected.overlayShapes}
      units="percent"
      interactive={false}
      labelMode="none"
      pointMode="none"
      ariaLabel={$t('storyBuilder.annotations.drawing')}
      svgClass="story-annotation-overlay__drawings"
    />

    <!-- Point markers and labels render as HTML so they stay circular / upright
         regardless of the (non-uniform) stage aspect ratio. -->
    <div class="story-annotation-overlay__markers">
      {#each pointMarkers as marker (marker.id)}
        <span
          class="story-annotation-overlay__point"
          style={`left:${marker.cx}%; top:${marker.cy}%; background:${marker.color};`}
        >
          {marker.pointNumber}
        </span>
      {/each}
      {#each shapeLabels as shape (`label-${shape.id}`)}
        <span
          class="story-annotation-overlay__label"
          class:story-annotation-overlay__label--rectangle={shape.kind === 'rect'}
          class:story-annotation-overlay__label--badge={labelOverflows(shape)}
          style={drawingLabelStyle(shape)}
          title={labelOverflows(shape) ? shape.label : undefined}
        >
          {shape.label}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .story-annotation-overlay {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    pointer-events: none;
  }

  .story-annotation-overlay__note {
    position: absolute;
    box-sizing: border-box;
    max-width: 100%;
    max-height: 100%;
    padding: calc(10px * var(--annotation-scale, 1)) calc(12px * var(--annotation-scale, 1));
    border: 0;
    border-radius: calc(12px * var(--annotation-scale, 1));
    background: var(--story-note-bg, rgba(255, 255, 255, 0.92));
    color: var(--ink, var(--story-note-text, #2b2520));
    font: inherit;
    font-size: calc(13px * var(--annotation-scale, 1));
    line-height: 1.4;
    box-shadow: 0 12px 28px rgba(43, 37, 32, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
    pointer-events: none;
  }

  .story-annotation-overlay__note--editable {
    pointer-events: auto;
    cursor: move;
    outline: 1px solid color-mix(in srgb, var(--accent, #e07a3f) 72%, white);
  }

  .story-annotation-overlay__note--editable:hover,
  .story-annotation-overlay__note--editable:focus-visible {
    outline: 2px solid var(--accent, #e07a3f);
    outline-offset: 2px;
  }

  .story-annotation-overlay__markers {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Round marker for point annotations (HTML keeps it circular on any aspect). */
  .story-annotation-overlay__point {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 2px solid white;
    background: var(--accent, #e07a3f);
    color: white;
    font-size: 10px;
    font-weight: 850;
    line-height: 1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }

  .story-annotation-overlay__label {
    position: absolute;
    transform: translate(-50%, 8px);
    max-width: 40%;
    padding: calc(3px * var(--annotation-scale, 1)) calc(7px * var(--annotation-scale, 1));
    border: 1px solid var(--accent, #e07a3f);
    border-radius: calc(7px * var(--annotation-scale, 1));
    background: var(--story-label-bg, rgba(20, 16, 12, 0.82));
    color: var(--story-label-text, #fff);
    font-size: calc(11px * var(--annotation-scale, 1));
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .story-annotation-overlay__label--rectangle {
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #fff;
    font-weight: 700;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
    overflow: hidden;
    text-overflow: clip;
    -webkit-text-stroke-color: rgba(15, 23, 42, 0.9);
    paint-order: stroke fill;
  }

  .story-annotation-overlay__label--badge {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--label-lines, 2);
    line-clamp: var(--label-lines, 2);
  }
</style>
