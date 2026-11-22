import type { Readable, Writable } from "svelte/store";
import type { MediaSource, MediaType, ViewBox } from "@mango-iiif/iiif-viewer/core";
import type { MediaMarksState } from "../mediaMarks";
import type { ExportEnvelope, SaveResult, SaveState } from "../storySerializer";
import type { StageFade } from "../viewer/storyViewerController";
import type {
  AnnotationPlacement,
  Chapter,
  ChapterAdvance,
  ChapterAnnotationStrokeWidth,
  ChapterAnnotationTool,
  ChapterCameraTrack,
  ChapterDrawingAnnotation,
  ChapterTaskId,
  NarrationSegment,
  StoryConfig,
  StoryPluginContext,
  StoryState,
} from "../../core/types/story";

export type UIMode =
  | "idle"
  | "chapterEdit"
  | "narrationPanel"
  | "annotationPositioning";

export type StoryBuilderOptions = {
  language?: string;
  languages?: string[];
  annotationPageId?: string;
  annotationBase?: string;
  identifiersLocked?: boolean;
  initialStory?: StoryState;
  /** Receives the controller used by the first-party builder hosts. */
  onControllerReady?: (controller: StoryBuilderController) => void;
};

export type StoryBuilderController = {
  story: Readable<StoryState>;
  currentManifest: Readable<string | null>;
  viewerCanvasIndex: Readable<number>;
  viewerCanvasCount: Readable<number>;
  selectedChapterId: Writable<string | null>;
  activeChapterTask: Writable<ChapterTaskId | null>;
  selectedDrawingAnnotationId: Writable<string | null>;
  chapterAnnotationTool: Writable<ChapterAnnotationTool>;
  uiMode: Writable<UIMode>;
  drawerOpen: Readable<boolean>;
  viewBox: Readable<ViewBox | null>;
  modelPoseDebug: Readable<string | null>;
  mediaType: Readable<MediaType | null>;
  mediaMarks: Readable<MediaMarksState>;
  transitionDelayDefault: Readable<number>;
  avMarksValid: Readable<boolean>;
  error: Writable<string | null>;
  validationErrors: Readable<string[]>;
  language: string;
  languages: string[];
  annotationLanguage: Writable<string>;
  saveState: Readable<SaveState>;
  saveConfigured: Readable<boolean>;
  dirty: Readable<boolean>;
  canUndo: Readable<boolean>;
  canRedo: Readable<boolean>;
  saveModalOpen: Readable<boolean>;
  saveModalPayload: Readable<ExportEnvelope | null>;
  sourcesModalOpen: Readable<boolean>;
  openSourcesModal: () => void;
  closeSourcesModal: () => void;
  selectSourceCanvas: (
    manifest: string,
    canvasIndex: number,
    mode: "add" | "replace",
  ) => void;
  setSaveConfig: (
    config: StoryConfig["story"] extends infer S
      ? S extends { save?: infer T }
        ? T
        : Record<string, never>
      : Record<string, never>,
  ) => void;
  closeSaveModal: () => void;
  mediaSources: Readable<MediaSource[]>;
  layerOpacities: Readable<Record<string, number>>;
  updateLayerOpacity: (id: string, opacity: number) => void;
  attach: (ctx: StoryPluginContext) => () => void;
  loadStory: (storyToLoad: StoryState) => void;
  setAnnotationLanguage: (lang: string) => void;
  setChapterAnnotationTool: (tool: ChapterAnnotationTool) => void;
  deleteChapterDrawingAnnotation: (annotationId: string) => void;
  deleteChapterTextAnnotation: (lang: string) => void;
  editChapterDrawingAnnotation: (annotationId: string) => void;
  finishChapterDrawingAnnotationEdit: () => void;
  editChapterTextAnnotation: (lang: string) => void;
  setChapterDrawingAnnotationLabel: (
    annotationId: string,
    lang: string,
    value: string,
  ) => void;
  setChapterDrawingAnnotationStyle: (
    annotationId: string,
    style: {
      color?: string | null;
      strokeWidth?: ChapterAnnotationStrokeWidth;
      fillMode?: ChapterDrawingAnnotation["fillMode"];
      /** Null clears it, so the export goes back to inferring from shape. */
      motivation?: ChapterDrawingAnnotation["motivation"] | null;
    },
  ) => void;
  addChapter: () => void;
  updateChapter: () => void;
  setChapterPosition: (viewBox: ViewBox) => void;
  setChapterPositionFromView: () => void;
  resetViewToSaved: () => void;
  clearMotionTrack: () => void;
  deleteChapter: (chapterId: string) => void;
  duplicateChapter: (chapterId: string) => void;
  reorderChapter: (
    chapterId: string,
    targetChapterId: string,
    position?: "before" | "after",
  ) => void;
  selectChapter: (chapterId: string | null) => void;
  openNarration: () => void;
  backFromNarration: () => void;
  closeNarration: () => void;
  openChapter: () => void;
  closeChapter: () => void;
  loadManifestAndAddChapter: (manifest: string) => void;
  markIn: () => void;
  markOut: () => void;
  setMediaMarks: (start: number | null, end: number | null) => void;
  assignMediaSegment: (start: number, end: number) => void;
  previewMediaSegment: () => void;
  stopPreviewMediaSegment: () => void;
  setNarrationTrack: (lang: string, src: string) => void;
  updateStoryTitle: (lang: string, value: string) => void;
  updateStoryIdentifiers: (id: string, annotationBase: string) => void;
  updateStoryAspect: (aspect: number) => void;
  addMotionPoint: (atTimeMs?: number) => void;
  setMotionPointViewBox: (keyframeId: string, viewBox: ViewBox) => void;
  setMotionPointFocus: (keyframeId: string, focus: { x: number; y: number }) => void;
  moveMotionPointTime: (
    keyframeId: string,
    timeMs: number,
    maxDurationMs?: number,
  ) => void;
  reorderMotionPoint: (keyframeId: string, direction: -1 | 1) => void;
  evenSpaceMotionPoints: () => void;
  scrubMotionTo: (timeMs: number) => void;
  selectMotionPoint: (keyframeId: string | null) => void;
  updateMotionPointFromViewport: (keyframeId: string) => void;
  selectedMotionPointId: Writable<string | null>;
  deleteMotionPoint: (keyframeId: string) => void;
  updateMotionDuration: (durationMs: number) => void;
  updateMotionPathType: (pathType: "linear" | "spline") => void;
  updateMotionInitialDwell: (dwellMs: number) => void;
  updateMotionEasing: (
    easing: NonNullable<ChapterCameraTrack["easing"]>,
  ) => void;
  goToMotionPoint: (keyframeId: string) => void;
  applyMotionPreset: (
    preset: NonNullable<Chapter["cameraTrack"]>["preset"],
  ) => void;
  motionPreviewing: Readable<boolean>;
  previewMotion: (options?: { startMs?: number; withAudio?: boolean }) => void;
  stopMotionPreview: () => void;
  updateChapterTitle: (lang: string, value: string) => void;
  updateChapterDescription: (lang: string, value: string) => void;
  assignNarrationSegment: (lang: string, start: number, end: number) => void;
  skipNarration: (lang: string) => void;
  updateAnnotationText: (lang: string, text: string) => void;
  updateAnnotationPlacement: (
    lang: string,
    placement: AnnotationPlacement,
  ) => void;
  updateAdvanceMode: (mode: ChapterAdvance["mode"]) => void;
  updateDelay: (delayMs?: number) => void;
  updateManifest: (manifest: string) => void;
  reloadManifest: (manifest: string, canvasIndex: number) => void;
  selectCanvas: (canvasIndex: number) => void;
  loadManifest: (manifest: string) => void;
  saveChapterSettings: () => void;
  cancelChapterSettings: () => void;
  applyChapterSource: () => void;
  saveExport: () => { ok: boolean; errors: string[] };
  exportStory: () => { ok: boolean; errors: string[] };
  getStory: () => StoryState;
  getExportPayload: () => ExportEnvelope;
  saveStory: () => Promise<SaveResult>;
  undo: () => void;
  redo: () => void;
  handleShortcut: (event: KeyboardEvent) => boolean;
  isPreviewing: Readable<boolean>;
  stageFade: Readable<StageFade>;
  startPreview: () => void;
  stopPreview: () => void;
  previewChapter: (chapterId?: string) => void;
  positioningLanguage: Readable<string | null>;
  startAnnotationPositioning: (lang: string) => void;
  confirmAnnotationPositioning: () => void;
  cancelAnnotationPositioning: () => void;
};

export const DEFAULT_CHAPTER_TRANSITION_DELAY_MS = 2000;

/**
 * How close the viewer has to be to a chapter's stored framing for the builder
 * to treat it as applied.
 */
export const APPLIED_FRAMING_TOLERANCE = 0.5;

export const collectLatestNarrationSegments = (
  story: StoryState,
): Record<string, NarrationSegment> => {
  const latest: Record<string, NarrationSegment> = {};
  for (const chapter of story.chapters) {
    for (const [language, segment] of Object.entries(
      chapter.narrationSegment ?? {},
    )) {
      if (
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start
      ) {
        latest[language] = { start: segment.start, end: segment.end };
      }
    }
  }
  return latest;
};

export const collectLatestTransitionDelay = (story: StoryState): number => {
  let latest = DEFAULT_CHAPTER_TRANSITION_DELAY_MS;
  for (const chapter of story.chapters) {
    const delay = chapter.advance?.delayMs;
    if (
      chapter.advance?.mode === "auto" &&
      Number.isFinite(delay) &&
      (delay as number) >= 0
    ) {
      latest = delay as number;
    }
  }
  return latest;
};
