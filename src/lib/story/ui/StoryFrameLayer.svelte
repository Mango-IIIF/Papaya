<script lang="ts">
  import type { StoryFrame } from '../../core/types/story';
  import type { ViewBox } from '@mango-iiif/iiif-viewer/core';
  import { lockRectAspect } from '../frameGeometry';
  import { translate } from '../../core/i18n';

  /*
   * The chapter frame, and the camera keyframes while motion is being
   * authored, drawn on the stage as aspect-locked crop boxes in canvas pixels.
   *
   * Self-contained OSD-synced SVG crop overlay: only the outline, tag, and
   * resize handles capture pointer events, so drags inside the frame pan the
   * image and wheels zoom normally.
   */

  interface OSDViewportLike {
    viewportToViewerElementRectangle?: (rect: unknown) => {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    pointFromPixel?: (point: { x: number; y: number }, current?: boolean) => unknown;
    getBounds?: (current?: boolean) => unknown;
  }

  interface OSDTiledImageLike {
    imageToViewportRectangle?: (x: number, y: number, w: number, h: number) => unknown;
    viewportToImageRectangle?: (rect: unknown) => {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    viewportToImageCoordinates?: (point: unknown) => { x: number; y: number };
  }

  interface FrameViewerLike {
    container: HTMLElement;
    viewport?: OSDViewportLike;
    world?: { getItemAt?: (index: number) => OSDTiledImageLike | null | undefined };
    addHandler?: (eventName: string, handler: () => void) => void;
    removeHandler?: (eventName: string, handler: () => void) => void;
  }

  interface Props {
    viewer?: FrameViewerLike | null;
    canvasWidth?: number;
    canvasHeight?: number;
    frames?: StoryFrame[];
    selectedFrameId?: string | null;
    /** A move or resize gesture ended; the box already holds the lock. */
    onframecommit?: ((payload: { frameId: string; viewBox: ViewBox }) => void) | undefined;
    /** The author took hold of a different frame. */
    onframeselect?: ((payload: { frameId: string | null }) => void) | undefined;
  }

  let {
    viewer = null,
    canvasWidth = 0,
    canvasHeight = 0,
    frames = [],
    selectedFrameId = null,
    onframecommit = undefined,
    onframeselect = undefined,
  }: Props = $props();

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const HALO_WIDTH_PX = 12;
  const TAG_FONT_PX = 10;
  const TAG_INSET_PX = 8;
  const HANDLE_SIZE_PX = 8;

  type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

  const HANDLE_CURSORS: Record<HandleName, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
  };

  interface ActiveGesture {
    kind: 'move' | 'resize';
    frameId: string;
    handle?: HandleName;
    startCanvas: { x: number; y: number };
    origin: ViewBox;
    current: ViewBox;
    moved: boolean;
  }

  let rootEl: HTMLDivElement | null = null;
  let svgEl: SVGSVGElement | null = null;
  let gesture: ActiveGesture | null = null;
  let previewBoxes = new Map<string, ViewBox>();
  let rafId: number | null = null;

  const frameById = (id: string): StoryFrame | undefined =>
    frames.find((frame) => frame.id === id);

  const bounds = () =>
    canvasWidth > 0 && canvasHeight > 0 ? { width: canvasWidth, height: canvasHeight } : null;

  const orderedFrames = (): StoryFrame[] => [
    ...frames.filter((frame) => !frame.editable),
    ...frames.filter((frame) => frame.editable),
  ];

  const frameTag = (frame: StoryFrame | undefined): string =>
    frame?.kind === 'keyframe'
      ? translate('storyBuilder.frame.keyframeTag', { number: frame.label ?? '' })
      : translate('storyBuilder.frame.label');

  /** Maps a canvas rectangle into screen pixel coordinates relative to `viewer.container`. */
  const canvasRectToScreen = (
    v: FrameViewerLike,
    box: ViewBox,
  ): { x: number; y: number; width: number; height: number; scale: number } => {
    const tiledImage = v.world?.getItemAt?.(0);
    if (
      tiledImage?.imageToViewportRectangle &&
      v.viewport?.viewportToViewerElementRectangle
    ) {
      const vpRect = tiledImage.imageToViewportRectangle(box.x, box.y, box.w, box.h);
      const pxRect = v.viewport.viewportToViewerElementRectangle(vpRect);
      const scale = box.w > 0 && pxRect.width > 0 ? pxRect.width / box.w : 1;
      return {
        x: pxRect.x,
        y: pxRect.y,
        width: pxRect.width,
        height: pxRect.height,
        scale,
      };
    }
    const rect = v.container.getBoundingClientRect();
    const sx = canvasWidth > 0 && rect.width > 0 ? rect.width / canvasWidth : 1;
    const sy = canvasHeight > 0 && rect.height > 0 ? rect.height / canvasHeight : 1;
    return {
      x: box.x * sx,
      y: box.y * sy,
      width: box.w * sx,
      height: box.h * sy,
      scale: sx,
    };
  };

  /** Maps a client pointer coordinate into canvas pixels. */
  const clientToCanvas = (
    v: FrameViewerLike,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } => {
    const rect = v.container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const tiledImage = v.world?.getItemAt?.(0);
    if (
      tiledImage?.viewportToImageCoordinates &&
      v.viewport?.pointFromPixel
    ) {
      const vpPoint = v.viewport.pointFromPixel({ x: localX, y: localY }, true);
      const imgPoint = tiledImage.viewportToImageCoordinates(vpPoint);
      return { x: imgPoint.x, y: imgPoint.y };
    }
    const sx = rect.width > 0 && canvasWidth > 0 ? canvasWidth / rect.width : 1;
    const sy = rect.height > 0 && canvasHeight > 0 ? canvasHeight / rect.height : 1;
    return { x: localX * sx, y: localY * sy };
  };

  /** Computes the SVG viewBox in canvas units that aligns 1:1 with the visible container. */
  const currentCanvasViewBox = (v: FrameViewerLike): ViewBox => {
    const tiledImage = v.world?.getItemAt?.(0);
    if (tiledImage?.viewportToImageRectangle && v.viewport?.getBounds) {
      const vpBounds = v.viewport.getBounds(true);
      const imgRect = tiledImage.viewportToImageRectangle(vpBounds);
      if (imgRect.width > 0 && imgRect.height > 0) {
        return { x: imgRect.x, y: imgRect.y, w: imgRect.width, h: imgRect.height };
      }
    }
    return { x: 0, y: 0, w: canvasWidth, h: canvasHeight };
  };

  const clampMove = (origin: ViewBox, dx: number, dy: number): ViewBox => {
    let x = origin.x + dx;
    let y = origin.y + dy;
    const b = bounds();
    if (b) {
      x = Math.min(Math.max(0, x), Math.max(0, b.width - origin.w));
      y = Math.min(Math.max(0, y), Math.max(0, b.height - origin.h));
    }
    return { x, y, w: origin.w, h: origin.h };
  };

  const candidateResize = (origin: ViewBox, handle: HandleName, dx: number, dy: number): ViewBox => {
    let left = origin.x;
    let top = origin.y;
    let right = origin.x + origin.w;
    let bottom = origin.y + origin.h;

    if (handle.includes('w')) left += dx;
    if (handle.includes('e')) right += dx;
    if (handle.includes('n')) top += dy;
    if (handle.includes('s')) bottom += dy;

    const minSize = 1;
    if (right - left < minSize) {
      if (handle.includes('w')) left = right - minSize;
      else right = left + minSize;
    }
    if (bottom - top < minSize) {
      if (handle.includes('n')) top = bottom - minSize;
      else bottom = top + minSize;
    }
    return { x: left, y: top, w: right - left, h: bottom - top };
  };

  const renderOverlay = () => {
    const v = viewer;
    const svg = svgEl;
    if (!v || !svg || canvasWidth <= 0 || canvasHeight <= 0) return;

    const vb = currentCanvasViewBox(v);
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.replaceChildren();

    const activeSelection =
      selectedFrameId && frameById(selectedFrameId)?.editable ? selectedFrameId : null;

    for (const frame of orderedFrames()) {
      const box = previewBoxes.get(frame.id) ?? frame.viewBox;
      const { x, y, w, h } = box;
      const screen = canvasRectToScreen(v, box);
      const scale = screen.scale > 0 ? screen.scale : 1;
      const isSelected = frame.editable && frame.id === activeSelection;

      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute(
        'class',
        [
          'story-frame',
          `story-frame--${frame.kind}`,
          isSelected ? 'story-frame--selected' : '',
          frame.editable ? 'story-frame--editable' : 'story-frame--passive',
        ]
          .filter(Boolean)
          .join(' '),
      );
      group.dataset.storyFrame = frame.id;
      group.dataset.storyFrameKind = frame.kind;
      group.setAttribute(
        'aria-label',
        frame.kind === 'keyframe'
          ? translate('storyBuilder.frame.keyframeAria', { number: frame.label ?? '' })
          : translate('storyBuilder.frame.chapterAria'),
      );
      if (!frame.editable) {
        group.style.pointerEvents = 'none';
      }

      const drawRect = (className: string, inset: number, interactiveStroke = false) => {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(x + inset));
        rect.setAttribute('y', String(y + inset));
        rect.setAttribute('width', String(Math.max(0, w - inset * 2)));
        rect.setAttribute('height', String(Math.max(0, h - inset * 2)));
        rect.setAttribute('fill', 'none');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        rect.setAttribute('class', className);
        if (interactiveStroke) {
          rect.style.pointerEvents = 'stroke';
          rect.style.cursor = 'move';
          rect.dataset.frameMove = frame.id;
        } else {
          rect.style.pointerEvents = 'none';
        }
        group.append(rect);
      };

      if (frame.kind === 'chapter' && frame.editable && canvasWidth > 0 && canvasHeight > 0) {
        const mask = document.createElementNS(SVG_NS, 'path');
        mask.setAttribute(
          'd',
          `M0 0H${canvasWidth}V${canvasHeight}H0Z M${x} ${y}h${w}v${h}h${-w}Z`,
        );
        mask.setAttribute('fill-rule', 'evenodd');
        mask.setAttribute('class', 'story-frame__mask');
        mask.style.pointerEvents = 'none';
        group.append(mask);
      }

      if (frame.editable) {
        drawRect('story-frame__halo', HALO_WIDTH_PX / 2 / scale, true);
      }
      drawRect('story-frame__line', 0, false);

      const named = Boolean(frame.editable);
      const numbered = !named && frame.kind === 'keyframe' && Boolean(frame.label);
      if (named || numbered) {
        const tag = document.createElementNS(SVG_NS, 'text');
        tag.textContent = named ? frameTag(frame) : (frame.label ?? '');
        tag.setAttribute('x', String(named ? x + w / 2 : x + TAG_INSET_PX / scale));
        tag.setAttribute('y', String(y + (TAG_INSET_PX + TAG_FONT_PX) / scale));
        tag.setAttribute('text-anchor', named ? 'middle' : 'start');
        tag.setAttribute('font-size', String(TAG_FONT_PX / scale));
        tag.setAttribute('stroke-width', String(3 / scale));
        tag.setAttribute('class', 'story-frame__tag');
        if (named) {
          tag.style.pointerEvents = 'all';
          tag.style.cursor = 'move';
          tag.dataset.frameMove = frame.id;
        } else {
          tag.style.pointerEvents = 'none';
        }
        group.append(tag);
      }

      svg.append(group);

      if (isSelected) {
        const handlesGroup = document.createElementNS(SVG_NS, 'g');
        handlesGroup.setAttribute('class', 'story-frame__handles');
        const hs = HANDLE_SIZE_PX / scale;
        const half = hs / 2;
        const handles: Array<[HandleName, number, number]> = [
          ['nw', x, y],
          ['n', x + w / 2, y],
          ['ne', x + w, y],
          ['e', x + w, y + h / 2],
          ['se', x + w, y + h],
          ['s', x + w / 2, y + h],
          ['sw', x, y + h],
          ['w', x, y + h / 2],
        ];
        for (const [name, hx, hy] of handles) {
          const rect = document.createElementNS(SVG_NS, 'rect');
          rect.setAttribute('x', String(hx - half));
          rect.setAttribute('y', String(hy - half));
          rect.setAttribute('width', String(hs));
          rect.setAttribute('height', String(hs));
          rect.setAttribute('fill', '#ffffff');
          rect.setAttribute('stroke', 'rgba(15, 23, 42, 0.9)');
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('vector-effect', 'non-scaling-stroke');
          rect.setAttribute('class', 'story-frame__handle');
          rect.dataset.handle = name;
          rect.dataset.frameId = frame.id;
          rect.style.pointerEvents = 'all';
          rect.style.cursor = HANDLE_CURSORS[name];
          handlesGroup.append(rect);
        }
        svg.append(handlesGroup);
      }
    }
  };

  const scheduleRender = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      renderOverlay();
    });
  };

  $effect(() => {
    const v = viewer;
    if (!v || canvasWidth <= 0 || canvasHeight <= 0) return;

    const root = document.createElement('div');
    root.className = 'story-frame-layer';
    root.dataset.storyFrameLayer = '';
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '4';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';

    root.append(svg);
    v.container.append(root);
    rootEl = root;
    svgEl = svg;

    const onPointerDown = (event: Event) => {
      const pe = event as PointerEvent;
      const target = pe.target as Element | null;
      if (!target) return;

      const handleEl = target.closest('[data-handle]') as SVGElement | null;
      if (handleEl) {
        const handleName = handleEl.dataset.handle as HandleName;
        const frameId = handleEl.dataset.frameId ?? selectedFrameId ?? '';
        const frame = frameById(frameId);
        if (!frame?.editable) return;
        pe.stopPropagation();
        if (frame.id !== selectedFrameId) onframeselect?.({ frameId: frame.id });
        const origin = { ...(previewBoxes.get(frame.id) ?? frame.viewBox) };
        gesture = {
          kind: 'resize',
          frameId: frame.id,
          handle: handleName,
          startCanvas: clientToCanvas(v, pe.clientX, pe.clientY),
          origin,
          current: origin,
          moved: false,
        };
        return;
      }

      const moveEl = target.closest('[data-frame-move]') as SVGElement | null;
      if (moveEl) {
        const frameId = moveEl.dataset.frameMove ?? '';
        const frame = frameById(frameId);
        if (!frame?.editable) return;
        pe.stopPropagation();
        if (frame.id !== selectedFrameId) onframeselect?.({ frameId: frame.id });
        const origin = { ...(previewBoxes.get(frame.id) ?? frame.viewBox) };
        gesture = {
          kind: 'move',
          frameId: frame.id,
          startCanvas: clientToCanvas(v, pe.clientX, pe.clientY),
          origin,
          current: origin,
          moved: false,
        };
      }
    };

    const onPointerMove = (event: Event) => {
      if (!gesture) return;
      const pe = event as PointerEvent;
      const frame = frameById(gesture.frameId);
      if (!frame) return;
      pe.stopPropagation();
      const pos = clientToCanvas(v, pe.clientX, pe.clientY);
      const dx = pos.x - gesture.startCanvas.x;
      const dy = pos.y - gesture.startCanvas.y;
      const next =
        gesture.kind === 'move'
          ? clampMove(gesture.origin, dx, dy)
          : lockRectAspect(
              gesture.origin,
              candidateResize(gesture.origin, gesture.handle!, dx, dy),
              frame.aspect,
              bounds(),
            );
      gesture.current = next;
      gesture.moved = true;
      previewBoxes.set(gesture.frameId, next);
      renderOverlay();
    };

    const onPointerUp = (event: Event) => {
      if (!gesture) return;
      const pe = event as PointerEvent;
      const finished = gesture;
      gesture = null;
      pe.stopPropagation();
      previewBoxes.delete(finished.frameId);
      if (finished.moved) {
        onframecommit?.({ frameId: finished.frameId, viewBox: finished.current });
      }
      renderOverlay();
    };

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    v.addHandler?.('update-viewport', scheduleRender);
    v.addHandler?.('animation', scheduleRender);
    v.addHandler?.('resize', scheduleRender);

    renderOverlay();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      v.removeHandler?.('update-viewport', scheduleRender);
      v.removeHandler?.('animation', scheduleRender);
      v.removeHandler?.('resize', scheduleRender);
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      root.remove();
      if (rootEl === root) rootEl = null;
      if (svgEl === svg) svgEl = null;
      gesture = null;
      previewBoxes.clear();
    };
  });

  $effect(() => {
    // Re-render whenever frames, selection, or canvas dimensions change.
    void frames;
    void selectedFrameId;
    void canvasWidth;
    void canvasHeight;
    renderOverlay();
  });
</script>

<style>
  :global(.story-frame) {
    cursor: move;
  }

  /* A quiet guide: thin, a little translucent, and not in the pointer's way. */
  :global(.story-frame--passive) {
    pointer-events: none !important;
    cursor: default;
    opacity: 0.7;
  }

  :global(.story-frame__mask) {
    fill: rgba(6, 9, 14, 0.3);
  }

  :global(.story-frame__halo) {
    stroke: rgba(10, 14, 20, 0.35);
    stroke-width: 12;
  }

  :global(.story-frame__line) {
    stroke: var(--story-builder-accent, #2ac7ff);
    stroke-width: 1.5;
  }

  :global(.story-frame--editable .story-frame__line) {
    stroke-width: 2;
  }

  :global(.story-frame--keyframe .story-frame__line) {
    stroke: rgba(255, 255, 255, 0.92);
  }

  :global(.story-frame--chapter.story-frame--passive .story-frame__line) {
    stroke-dasharray: 6 5;
  }

  :global(.story-frame--keyframe.story-frame--selected .story-frame__line) {
    stroke: var(--story-builder-accent, #2ac7ff);
  }

  :global(.story-frame__tag) {
    fill: #fff;
    stroke: rgba(10, 14, 20, 0.85);
    paint-order: stroke;
    stroke-linejoin: round;
    font-family: inherit;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    user-select: none;
  }
</style>
