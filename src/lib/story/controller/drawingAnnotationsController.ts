import { get, type Readable, type Writable } from "svelte/store";
import type { ResolvedAnnotation, ViewBox } from "@mango-iiif/iiif-viewer/core";
import { cloneStoryValue } from "../storyHistory";
import { storyDrawingToResolved } from "../storyDrawingAnnotations";
import type {
  ChapterAnnotationStrokeWidth,
  ChapterAnnotationTool,
  ChapterDrawingAnnotation,
  ChapterTaskId,
  StoryPluginContext,
  StoryState,
} from "../../core/types/story";
import type { UIMode } from "./types";

export const createDrawingAnnotationsController = (deps: {
  language: string;
  languages: string[];
  storyStore: Writable<StoryState>;
  selectedChapterId: Readable<string | null>;
  activeChapterTask: Writable<ChapterTaskId | null>;
  selectedDrawingAnnotationId: Writable<string | null>;
  chapterAnnotationTool: Writable<ChapterAnnotationTool>;
  annotationLanguage: Writable<string>;
  positioningLanguage: Writable<string | null>;
  uiMode: Writable<UIMode>;
  dirty: Writable<boolean>;
  canUndo: Writable<boolean>;
  canRedo: Writable<boolean>;
  exportStory: () => StoryState;
  replaceStory: (next: StoryState) => void;
  pushHistorySnapshot: () => void;
  pushTransactionHistory: (snapshot: StoryState) => void;
  syncHistoryFlags: () => void;
  getViewer: () => StoryPluginContext["viewer"] | null;
}) => {
  let annotationTransactionSnapshot: StoryState | null = null;
  let annotationTransactionWasDirty = false;
  let annotationTransactionChanged = false;

  const syncEditableStoryAnnotations = () => {
    const chapterId = get(deps.selectedChapterId);
    const chapter = get(deps.storyStore).chapters.find(
      (entry) => entry.id === chapterId,
    );
    const canvasId = chapter
      ? chapter.canvasId || `${chapter.manifest}/canvas/${chapter.canvasIndex}`
      : "";
    const preferredLanguages = [
      get(deps.annotationLanguage),
      deps.language,
      ...deps.languages,
    ];
    const annotations: ResolvedAnnotation[] = (
      chapter?.drawingAnnotations ?? []
    ).flatMap((drawing) => {
      const annotation = storyDrawingToResolved(
        drawing,
        canvasId,
        preferredLanguages,
      );
      return annotation ? [annotation] : [];
    });
    deps.getViewer()?.setStoryAnnotations?.(annotations);
  };

  deps.activeChapterTask.subscribe((task) => {
    const viewer = deps.getViewer();
    if (task === "focus") {
      if (!annotationTransactionSnapshot) {
        annotationTransactionSnapshot = cloneStoryValue(deps.exportStory());
        annotationTransactionWasDirty = get(deps.dirty);
        annotationTransactionChanged = false;
        // The open annotation transaction becomes one undo step when saved.
        deps.canUndo.set(false);
        deps.canRedo.set(false);
      }
      viewer?.setStoryAnnotationEditing?.(true);
      syncEditableStoryAnnotations();
      return;
    }
    // Closing the task through a host control is an implicit commit.
    if (annotationTransactionSnapshot) {
      if (annotationTransactionChanged) {
        deps.pushTransactionHistory(annotationTransactionSnapshot);
      }
      annotationTransactionSnapshot = null;
      annotationTransactionChanged = false;
      deps.syncHistoryFlags();
    }
    deps.chapterAnnotationTool.set("select");
    deps.selectedDrawingAnnotationId.set(null);
    viewer?.setAnnotationTool?.("select");
    viewer?.setStoryAnnotationEditing?.(false);
  });

  const setAnnotationLanguage = (lang: string) => {
    deps.annotationLanguage.set(lang);
    if (get(deps.activeChapterTask) === "focus") syncEditableStoryAnnotations();
  };

  const setChapterAnnotationTool = (tool: ChapterAnnotationTool) => {
    if (
      tool !== "select" &&
      (!get(deps.selectedChapterId) || get(deps.activeChapterTask) !== "focus")
    ) {
      return;
    }
    deps.chapterAnnotationTool.set(tool);
    const viewer = deps.getViewer();
    viewer?.setStoryAnnotationEditing?.(get(deps.activeChapterTask) === "focus");
    viewer?.setAnnotationTool?.(tool);
  };

  const mutateChapterDrawingAnnotations = (
    transform: (
      items: ChapterDrawingAnnotation[],
    ) => ChapterDrawingAnnotation[],
  ) => {
    const chapterId = get(deps.selectedChapterId);
    if (!chapterId) return;
    const current = deps.exportStory();
    const chapterIndex = current.chapters.findIndex(
      (entry) => entry.id === chapterId,
    );
    if (chapterIndex < 0) return;
    if (
      get(deps.activeChapterTask) === "focus" &&
      annotationTransactionSnapshot
    ) {
      annotationTransactionChanged = true;
    } else {
      deps.pushHistorySnapshot();
    }
    const next = cloneStoryValue(current);
    const chapter = next.chapters[chapterIndex];
    chapter.drawingAnnotations = transform(chapter.drawingAnnotations ?? []);
    deps.replaceStory(next);
    deps.dirty.set(true);
    syncEditableStoryAnnotations();
  };

  const addChapterDrawingAnnotation = (
    annotation: ResolvedAnnotation,
    createdTool?: ChapterAnnotationTool,
  ) => {
    const tool = createdTool ?? get(deps.chapterAnnotationTool);
    if (tool === "select") return;
    const drawing: ChapterDrawingAnnotation = {
      id: annotation.id,
      type: tool,
      ...(annotation.text ? { text: annotation.text } : {}),
      ...(annotation.rect ? { rect: annotation.rect } : {}),
      ...(annotation.point ? { point: annotation.point } : {}),
      ...(annotation.polygon?.points
        ? { points: annotation.polygon.points }
        : {}),
    };
    if (!drawing.rect && !drawing.point && !drawing.points?.length) return;
    mutateChapterDrawingAnnotations((items) => [
      ...items.filter((entry) => entry.id !== drawing.id),
      drawing,
    ]);
    deps.selectedDrawingAnnotationId.set(drawing.id);
    deps.getViewer()?.setStoryAnnotationSelection?.(drawing.id);
    setChapterAnnotationTool("select");
  };

  const deleteChapterDrawingAnnotation = (annotationId: string) => {
    mutateChapterDrawingAnnotations((items) =>
      items.filter((entry) => entry.id !== annotationId),
    );
    if (get(deps.selectedDrawingAnnotationId) === annotationId) {
      deps.selectedDrawingAnnotationId.set(null);
      deps.getViewer()?.setStoryAnnotationSelection?.(null);
    }
  };

  const deleteChapterTextAnnotation = (lang: string) => {
    const chapterId = get(deps.selectedChapterId);
    if (!chapterId) return;
    const current = deps.exportStory();
    const chapterIndex = current.chapters.findIndex(
      (entry) => entry.id === chapterId,
    );
    if (chapterIndex < 0 || !current.chapters[chapterIndex].annotations?.[lang]) {
      return;
    }
    deps.pushHistorySnapshot();
    const next = cloneStoryValue(current);
    const annotations = { ...(next.chapters[chapterIndex].annotations ?? {}) };
    delete annotations[lang];
    if (Object.keys(annotations).length > 0) {
      next.chapters[chapterIndex].annotations = annotations;
    } else {
      delete next.chapters[chapterIndex].annotations;
    }
    deps.replaceStory(next);
    deps.dirty.set(true);
    if (get(deps.positioningLanguage) === lang) {
      deps.positioningLanguage.set(null);
      deps.uiMode.set("chapterEdit");
    }
  };

  const focusViewerOnBounds = (bounds: ViewBox) => {
    const viewer = deps.getViewer();
    if (!viewer) return;
    const current = viewer.getViewBox?.();
    const currentWidth = Math.max(1, current?.w ?? (bounds.w || 100));
    const currentHeight = Math.max(1, current?.h ?? (bounds.h || 100));
    const aspect = currentWidth / currentHeight;
    let width = Math.max(bounds.w * 1.5, currentWidth * 0.18, 24);
    let height = Math.max(bounds.h * 1.5, currentHeight * 0.18, 24);
    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;
    const centreX = bounds.x + bounds.w / 2;
    const centreY = bounds.y + bounds.h / 2;
    viewer.setViewBox?.({
      x: centreX - width / 2,
      y: centreY - height / 2,
      w: width,
      h: height,
    });
  };

  const editChapterDrawingAnnotation = (annotationId: string) => {
    const chapterId = get(deps.selectedChapterId);
    const drawing = get(deps.storyStore)
      .chapters.find((entry) => entry.id === chapterId)
      ?.drawingAnnotations?.find((entry) => entry.id === annotationId);
    if (!drawing) return;
    if (get(deps.activeChapterTask) !== "focus") {
      deps.activeChapterTask.set("focus");
    }
    setChapterAnnotationTool("select");
    deps.selectedDrawingAnnotationId.set(annotationId);
    syncEditableStoryAnnotations();
    deps.getViewer()?.setStoryAnnotationSelection?.(annotationId);
  };

  const finishChapterDrawingAnnotationEdit = () => {
    deps.selectedDrawingAnnotationId.set(null);
    deps.getViewer()?.setStoryAnnotationSelection?.(null);
    setChapterAnnotationTool("select");
  };

  const editChapterTextAnnotation = (lang: string) => {
    const chapterId = get(deps.selectedChapterId);
    const chapter = get(deps.storyStore).chapters.find(
      (entry) => entry.id === chapterId,
    );
    const annotation = chapter?.annotations?.[lang];
    if (
      !chapter ||
      !annotation?.text?.trim() ||
      get(deps.activeChapterTask) !== "focus"
    ) {
      return;
    }
    setAnnotationLanguage(lang);
    const placement = annotation.placement ?? chapter.annotationPlacement;
    if (placement) {
      const absolute =
        placement.x > 1 || placement.y > 1 || placement.w > 1 || placement.h > 1
          ? placement
          : chapter.viewBox
            ? {
                x: chapter.viewBox.x + placement.x * chapter.viewBox.w,
                y: chapter.viewBox.y + placement.y * chapter.viewBox.h,
                w: placement.w * chapter.viewBox.w,
                h: placement.h * chapter.viewBox.h,
              }
            : null;
      if (absolute) focusViewerOnBounds(absolute);
    }
    deps.getViewer()?.setStoryAnnotationSelection?.(null);
    deps.uiMode.set("annotationPositioning");
    deps.positioningLanguage.set(lang);
  };

  const updateChapterDrawingAnnotation = (
    annotationId: string,
    patch: Partial<ResolvedAnnotation>,
  ) => {
    mutateChapterDrawingAnnotations((items) =>
      items.map((drawing) => {
        if (drawing.id !== annotationId) return drawing;
        if (patch.rect) {
          const next = {
            ...drawing,
            type: "rectangle" as const,
            rect: patch.rect,
          };
          delete next.point;
          delete next.points;
          return next;
        }
        if (patch.point) {
          const next = {
            ...drawing,
            type: "point" as const,
            point: patch.point,
          };
          delete next.rect;
          delete next.points;
          return next;
        }
        if (patch.polygon?.points) {
          const polygonType: ChapterDrawingAnnotation["type"] =
            drawing.type === "line" || drawing.type === "freehand"
              ? drawing.type
              : "polygon";
          const next = {
            ...drawing,
            type: polygonType,
            points: patch.polygon.points,
          };
          delete next.rect;
          delete next.point;
          return next;
        }
        return drawing;
      }),
    );
  };

  const setChapterDrawingAnnotationLabel = (
    annotationId: string,
    lang: string,
    value: string,
  ) => {
    const text = value.trim();
    mutateChapterDrawingAnnotations((items) =>
      items.map((drawing) => {
        if (drawing.id !== annotationId) return drawing;
        const label: Record<string, string> = { ...(drawing.label ?? {}) };
        if (text) label[lang] = text;
        else delete label[lang];
        const next = { ...drawing };
        if (Object.keys(label).length > 0) next.label = label;
        else delete next.label;
        delete next.text;
        return next;
      }),
    );
  };

  const setChapterDrawingAnnotationStyle = (
    annotationId: string,
    style: {
      motivation?: ChapterDrawingAnnotation["motivation"] | null;
      color?: string | null;
      strokeWidth?: ChapterAnnotationStrokeWidth;
      fillMode?: ChapterDrawingAnnotation["fillMode"];
    },
  ) => {
    mutateChapterDrawingAnnotations((items) =>
      items.map((drawing) => {
        if (drawing.id !== annotationId) return drawing;
        const next = { ...drawing };
        if (style.color !== undefined) {
          const color = style.color?.trim();
          if (color) next.color = color;
          else delete next.color;
        }
        if (style.strokeWidth !== undefined) {
          next.strokeWidth = style.strokeWidth;
        }
        if (style.fillMode !== undefined) next.fillMode = style.fillMode;
        if (style.motivation !== undefined) {
          if (style.motivation) next.motivation = style.motivation;
          else delete next.motivation;
        }
        return next;
      }),
    );
  };

  const commitAnnotationTransaction = () => {
    if (annotationTransactionSnapshot && annotationTransactionChanged) {
      deps.pushTransactionHistory(annotationTransactionSnapshot);
    }
    annotationTransactionSnapshot = null;
    annotationTransactionChanged = false;
    deps.selectedDrawingAnnotationId.set(null);
    deps.getViewer()?.setStoryAnnotationSelection?.(null);
    deps.activeChapterTask.set(null);
    deps.uiMode.set(get(deps.selectedChapterId) ? "chapterEdit" : "idle");
    deps.syncHistoryFlags();
  };

  const cancelAnnotationTransaction = (): boolean => {
    if (
      get(deps.activeChapterTask) !== "focus" ||
      !annotationTransactionSnapshot
    ) {
      return false;
    }
    const snapshot = annotationTransactionSnapshot;
    annotationTransactionSnapshot = null;
    annotationTransactionChanged = false;
    deps.replaceStory(snapshot);
    deps.dirty.set(annotationTransactionWasDirty);
    deps.selectedDrawingAnnotationId.set(null);
    deps.getViewer()?.setStoryAnnotationSelection?.(null);
    deps.activeChapterTask.set(null);
    deps.uiMode.set(get(deps.selectedChapterId) ? "chapterEdit" : "idle");
    syncEditableStoryAnnotations();
    deps.syncHistoryFlags();
    return true;
  };

  return {
    syncEditableStoryAnnotations,
    setAnnotationLanguage,
    setChapterAnnotationTool,
    addChapterDrawingAnnotation,
    deleteChapterDrawingAnnotation,
    deleteChapterTextAnnotation,
    editChapterDrawingAnnotation,
    finishChapterDrawingAnnotationEdit,
    editChapterTextAnnotation,
    updateChapterDrawingAnnotation,
    setChapterDrawingAnnotationLabel,
    setChapterDrawingAnnotationStyle,
    commitAnnotationTransaction,
    cancelAnnotationTransaction,
  };
};
