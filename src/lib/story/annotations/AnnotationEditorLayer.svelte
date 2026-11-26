<script lang="ts">
  import type OpenSeadragon from 'openseadragon';
  import {
    ShapeType,
    type DrawingStyle,
    type ImageAnnotation,
  } from '@annotorious/openseadragon';
  import {
    AnnotationCanvasEditor,
    createPointImageAnnotation,
    isPointImageAnnotation,
    pointCenterOf,
    type AnnotationTool,
    type AnnotoriousEditor,
  } from '@mango-iiif/annotation';
  import '@mango-iiif/annotation/annotorious.css';
  import { serializeWebAnnotation, type NeutralShape } from '@mango-iiif/w3c-parser';
  import {
    buildLayerStylesheet,
    createMangoAnnotation,
    hintsFromInlineStyle,
    shapeTool,
    styleClassForLayer,
    type ResolvedAnnotation,
  } from '@mango-iiif/iiif-viewer/core';
  import { EDITOR_LABEL_SIZING, type LabelSizing } from './rectangleLabelLayout';
  import type { ChapterAnnotationTool as Tool } from '../../core/types/story';

  /** A presentation group for drawn shapes: its colour and whether it shows. */
  export type LayerItem = {
    id: string;
    name: string;
    color: string;
    visible: boolean;
    archived?: boolean;
    readOnly?: boolean;
  };

  interface Props {
    enabled?: boolean;
    viewer?: OpenSeadragon.Viewer | null;
    canvasId?: string | null;
    canvasWidth?: number;
    canvasHeight?: number;
    annotations?: ResolvedAnnotation[];
    activeAnnotationId?: string | null;
    activeTool?: Tool;
    layers?: LayerItem[];
    /** Layer new annotations are created in. A presentation and grouping choice. */
    activeLayerId?: string;
    labelSizing?: LabelSizing;
    ontoolchange?: ((payload: { tool: Tool }) => void) | undefined;
    onannotationcreate?:
      ((payload: { annotation: unknown; tool: Exclude<Tool, 'select'> }) => void) | undefined;
    onannotationupdate?:
      ((payload: { id: string; patch: Partial<ResolvedAnnotation> }) => void) | undefined;
    onannotationdelete?: ((payload: { id: string }) => void) | undefined;
    onannotationselect?: ((payload: { id: string }) => void) | undefined;
    /** Hands the live editor out so undo/redo and exact edits can reach it. */
    oneditorready?: ((editor: AnnotoriousEditor | null) => void) | undefined;
    /** A committed geometry change, already one undo step in the editor. */
    ongeometrycommit?: ((payload: { id: string }) => void) | undefined;
  }

  let {
    enabled = false,
    viewer = null,
    canvasId = null,
    canvasWidth = 0,
    canvasHeight = 0,
    annotations = [],
    activeAnnotationId = null,
    activeTool = 'rectangle',
    layers = [],
    activeLayerId = 'mine',
    labelSizing: _labelSizing = EDITOR_LABEL_SIZING,
    ontoolchange = undefined,
    onannotationcreate = undefined,
    onannotationupdate = undefined,
    onannotationdelete = undefined,
    onannotationselect = undefined,
    oneditorready = undefined,
    ongeometrycommit = undefined,
  }: Props = $props();

  const toAnnotoriousTool = (tool: Tool): AnnotationTool =>
    tool === 'freehand' ? 'path' : tool;

  const pointRadius = $derived(
    canvasWidth > 0 && canvasHeight > 0
      ? Math.max(8, Math.min(canvasWidth, canvasHeight) * 0.008)
      : 12,
  );

  const boundsOfCoords = (points: number[][]) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  const toImageAnn = (annotation: ResolvedAnnotation): ImageAnnotation | null => {
    if (annotation.rect) {
      const { x, y, w, h } = annotation.rect;
      return {
        id: annotation.id,
        bodies: [],
        target: {
          annotation: annotation.id,
          selector: {
            type: ShapeType.RECTANGLE,
            geometry: { x, y, w, h, bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h } },
          },
        },
      } as unknown as ImageAnnotation;
    }
    if (annotation.point) {
      return createPointImageAnnotation(
        annotation.id,
        annotation.point.x,
        annotation.point.y,
        pointRadius,
      );
    }
    if (annotation.polygon?.points?.length) {
      const coords = annotation.polygon.points.map((p) => [p.x, p.y]);
      const bounds = boundsOfCoords(coords);
      if (annotation.shapeType === 'line' && coords.length >= 2) {
        const linePts = [coords[0], coords[coords.length - 1]];
        return {
          id: annotation.id,
          bodies: [],
          target: {
            annotation: annotation.id,
            selector: {
              type: ShapeType.LINE,
              geometry: { points: linePts, bounds: boundsOfCoords(linePts) },
            },
          },
        } as unknown as ImageAnnotation;
      }
      const shapeType =
        annotation.shapeType === 'freehand' ? ShapeType.POLYLINE : ShapeType.POLYGON;
      return {
        id: annotation.id,
        bodies: [],
        target: {
          annotation: annotation.id,
          selector: {
            type: shapeType,
            geometry: { points: coords, bounds },
          },
        },
      } as unknown as ImageAnnotation;
    }
    return null;
  };

  type AnyGeometry = {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    cx?: number;
    cy?: number;
    rx?: number;
    ry?: number;
    points?: number[][];
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  };

  const toNeutralShape = (annotation: ImageAnnotation): NeutralShape | null => {
    const center = pointCenterOf(annotation);
    if (center) {
      return { type: 'point', geometry: center };
    }
    const selector = annotation.target?.selector;
    if (!selector) return null;
    const geom = selector.geometry as unknown as AnyGeometry;

    if (selector.type === ShapeType.RECTANGLE && geom.x != null && geom.y != null && geom.w != null && geom.h != null) {
      return {
        type: 'rect',
        geometry: { x: geom.x, y: geom.y, w: geom.w, h: geom.h },
      };
    }
    if (selector.type === ShapeType.LINE && geom.points && geom.points.length >= 2) {
      const first = geom.points[0];
      const last = geom.points[geom.points.length - 1];
      return {
        type: 'line',
        geometry: {
          start: { x: first[0], y: first[1] },
          end: { x: last[0], y: last[1] },
        },
      };
    }
    if (selector.type === ShapeType.POLYLINE && geom.points && geom.points.length >= 2) {
      return {
        type: 'freehand',
        geometry: { points: geom.points.map(([x, y]) => ({ x, y })) },
      };
    }
    if (selector.type === ShapeType.POLYGON && geom.points && geom.points.length >= 3) {
      return {
        type: 'polygon',
        geometry: { points: geom.points.map(([x, y]) => ({ x, y })) },
      };
    }
    if (selector.type === ShapeType.ELLIPSE && geom.bounds) {
      const { minX, minY, maxX, maxY } = geom.bounds;
      return {
        type: 'rect',
        geometry: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      };
    }
    return null;
  };

  const toPatch = (shape: NeutralShape): Partial<ResolvedAnnotation> => {
    if (shape.type === 'rect') {
      return { shapeType: 'rect', rect: shape.geometry, point: undefined, polygon: undefined };
    }
    if (shape.type === 'point') {
      return { shapeType: 'point', rect: undefined, point: shape.geometry, polygon: undefined };
    }
    if (shape.type === 'line') {
      return {
        shapeType: 'line',
        rect: undefined,
        point: undefined,
        polygon: { points: [shape.geometry.start, shape.geometry.end] },
      };
    }
    if (shape.type === 'freehand') {
      return {
        shapeType: 'freehand',
        rect: undefined,
        point: undefined,
        polygon: { points: shape.geometry.points },
      };
    }
    if (shape.type === 'polygon') {
      return {
        shapeType: 'polygon',
        rect: undefined,
        point: undefined,
        polygon: { points: shape.geometry.points },
      };
    }
    return {};
  };

  const styleFor = (annotation: ImageAnnotation): DrawingStyle => {
    const resolved = annotations.find((item) => item.id === annotation.id);
    const hints = resolved
      ? (resolved.styleHints ?? hintsFromInlineStyle(resolved.targetStyle))
      : undefined;
    const layer = layers.find((entry) => entry.id === (resolved?.targetStyleClass ?? activeLayerId));
    const stroke = hints?.strokeColor ?? layer?.color ?? '#e07a3f';
    const isPoint = isPointImageAnnotation(annotation);
    const solidFill = hints?.fillColor && !hints.fillColor.startsWith('rgba');
    return {
      stroke,
      strokeWidth: hints?.strokeWidth ?? 2,
      fill: isPoint ? stroke : (hints?.fillColor ?? stroke),
      fillOpacity: isPoint ? 0.85 : solidFill ? 0.9 : 0.16,
    };
  };

  let imageAnnotations = $derived(
    annotations
      .map(toImageAnn)
      .filter((item): item is ImageAnnotation => item !== null),
  );

  const handleCreate = (annotation: ImageAnnotation) => {
    if (!canvasId) return;
    const shape = toNeutralShape(annotation);
    if (!shape) return;
    const tool = shapeTool(shape);
    if (!tool) return;
    const layer = layers.find((entry) => entry.id === activeLayerId);
    const document = createMangoAnnotation({
      id: annotation.id,
      canvasId,
      shape,
      styleClass: activeLayerId ? styleClassForLayer(activeLayerId) : undefined,
      stylesheet: layer ? buildLayerStylesheet([layer]) : null,
    });
    onannotationcreate?.({
      annotation: serializeWebAnnotation(document, { profile: 'iiif-presentation-3' }).json,
      tool,
    });
    ontoolchange?.({ tool: 'select' });
  };

  const handleUpdate = (annotation: ImageAnnotation) => {
    const shape = toNeutralShape(annotation);
    if (!shape) return;
    onannotationupdate?.({ id: annotation.id, patch: toPatch(shape) });
    ongeometrycommit?.({ id: annotation.id });
  };

  const handleDelete = (id: string) => {
    onannotationdelete?.({ id });
  };

  const handleSelect = (id: string | undefined) => {
    if (id && annotations.some((annotation) => annotation.id === id)) {
      onannotationselect?.({ id });
    }
  };
</script>

<AnnotationCanvasEditor
  {enabled}
  {viewer}
  annotations={imageAnnotations}
  selectedId={activeAnnotationId}
  tool={toAnnotoriousTool(activeTool)}
  style={styleFor}
  {pointRadius}
  oncreate={handleCreate}
  onupdate={handleUpdate}
  ondelete={handleDelete}
  onselect={handleSelect}
  onready={(editor) => oneditorready?.(editor)}
/>
