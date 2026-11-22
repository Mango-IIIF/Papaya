import { get, type Readable } from "svelte/store";
import type { ChapterTaskId, StoryState } from "../../core/types/story";

/** Where a key belongs to the field or control that has focus, not the builder. */
const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const element = target as HTMLElement;
  return (
    element.isContentEditable ||
    Boolean(element.closest("input, textarea, select, [contenteditable='true']"))
  );
};

const activatesOnSpace = (target: EventTarget | null): boolean => {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean(
    (target as Element).closest(
      "button, a[href], summary, [role='button'], [role='tab']",
    ),
  );
};

export const createShortcutHandler = (deps: {
  storyStore: Readable<StoryState>;
  selectedChapterId: Readable<string | null>;
  activeChapterTask: Readable<ChapterTaskId | null>;
  selectedDrawingAnnotationId: Readable<string | null>;
  selectedMotionPointId: Readable<string | null>;
  isPreviewing: Readable<boolean>;
  saveModalOpen: Readable<boolean>;
  motionPreviewing: Readable<boolean>;
  canUndo: Readable<boolean>;
  canRedo: Readable<boolean>;
  undo: () => void;
  redo: () => void;
  previewMotion: () => void;
  stopMotionPreview: () => void;
  deleteChapterDrawingAnnotation: (id: string) => void;
  deleteMotionPoint: (id: string) => void;
}) => {
  return (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing) return false;
    const origin = event.composedPath?.()[0] ?? event.target;
    if (isTypingTarget(origin)) return false;
    if (get(deps.isPreviewing) || get(deps.saveModalOpen)) return false;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const mod = event.metaKey || event.ctrlKey;

    if (mod && !event.altKey && (key === "z" || (key === "y" && event.ctrlKey))) {
      const wantsRedo = key === "y" || event.shiftKey;
      if (wantsRedo ? !get(deps.canRedo) : !get(deps.canUndo)) return false;
      event.preventDefault();
      if (wantsRedo) deps.redo();
      else deps.undo();
      return true;
    }

    if (mod || event.altKey) return false;

    if (key === " ") {
      if (activatesOnSpace(origin)) return false;
      if (get(deps.motionPreviewing)) {
        event.preventDefault();
        deps.stopMotionPreview();
        return true;
      }
      const chapter = get(deps.storyStore).chapters.find(
        (item) => item.id === get(deps.selectedChapterId),
      );
      if ((chapter?.cameraTrack?.keyframes.length ?? 0) < 2) return false;
      event.preventDefault();
      deps.previewMotion();
      return true;
    }

    if (key === "Delete" || key === "Backspace") {
      const annotationId =
        get(deps.activeChapterTask) === "focus"
          ? get(deps.selectedDrawingAnnotationId)
          : null;
      if (annotationId) {
        event.preventDefault();
        deps.deleteChapterDrawingAnnotation(annotationId);
        return true;
      }
      const keyframeId = get(deps.selectedMotionPointId);
      if (keyframeId) {
        event.preventDefault();
        deps.deleteMotionPoint(keyframeId);
        return true;
      }
    }

    return false;
  };
};
