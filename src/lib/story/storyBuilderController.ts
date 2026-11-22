import { derived, get, writable } from "svelte/store";
import type {
  MediaSource,
  MediaType,
  ResolvedAnnotation,
  ViewBox,
} from "@mango-iiif/iiif-viewer/core";
import { translate } from "../core/i18n";
import { createStoryStore } from "../core/state/story.svelte";
import { createMediaMarks, type MediaMarksState } from "./mediaMarks";
import { createModelPose } from "./modelPose";
import { createNarrationPlayer } from "./narrationPlayer";
import { captureAudioVideo, captureImagePdf, captureModel } from "./capture";
import {
  containViewBox,
  fitViewBoxToContent,
  framingsWithin,
  normaliseStoryFraming,
  normaliseViewBox,
  resolvePresentationAspect,
} from "./framing";
import { createDraftStoryId } from "./publicIdentifiers";
import { resolveManifestForNewChapter } from "./manifestResolver";
import {
  animateViewBoxTransition,
  animateLayerOpacities,
} from "./viewBoxAnimation";
import { cloneStoryValue, createStoryHistory } from "./storyHistory";
import { createChapterActions } from "./chapterActions";
import { createStoryPreviewOrchestrator } from "./previewOrchestrator";
import { STAGE_CROSSFADE_MS } from "./viewer/chapterTransitionOrchestrator";
import type { StageFade } from "./viewer/storyViewerController";
import { configureCameraTrackPreset } from "./cameraTrack";
import {
  buildExportEnvelope,
  loadStoryIntoStore,
  performFetchWithTimeout,
  validateStoryForExport,
  type ExportEnvelope,
  type SaveConfig,
  type SaveResult,
  type SaveState,
} from "./storySerializer";
import type {
  AnnotationPlacement,
  Chapter,
  ChapterAdvance,
  ChapterAnnotationTool,
  ChapterModel,
  ChapterTaskId,
  StoryPluginContext,
  StoryState,
} from "../core/types/story";
import { normalizeStoryAnnotations } from "./normalizeAnnotations";
import { normaliseAuthoringLanguages } from "./annotations/languages";
import {
  APPLIED_FRAMING_TOLERANCE,
  collectLatestNarrationSegments,
  collectLatestTransitionDelay,
  type StoryBuilderController,
  type StoryBuilderOptions,
  type UIMode,
} from "./controller/types";
import {
  CHAPTER_FRAME_ID,
  createStageFramesSync,
  keyframeIdFromFrame,
} from "./controller/stageFrameSync";
import { createDrawingAnnotationsController } from "./controller/drawingAnnotationsController";
import { createMotionController } from "./controller/motionController";
import { createShortcutHandler } from "./controller/shortcuts";

export {
  collectLatestNarrationSegments,
  type StoryBuilderController,
  type StoryBuilderOptions,
  type UIMode,
};

export const createStoryBuilderController = (
  options: StoryBuilderOptions = {},
): StoryBuilderController => {
  const language = options.language ?? "en";
  const languages = normaliseAuthoringLanguages(options.languages, language);
  const initialStoryData: StoryState = normalizeStoryAnnotations(
    options.initialStory
      ? {
          ...options.initialStory,
          id:
            options.annotationPageId ??
            options.initialStory.id ??
            createDraftStoryId(),
          publication: {
            ...options.initialStory.publication,
            ...(options.annotationBase
              ? { annotationBase: options.annotationBase }
              : {}),
            ...(options.identifiersLocked ? { identifiersLocked: true } : {}),
          },
        }
      : {
          id: options.annotationPageId ?? createDraftStoryId(),
          publication:
            options.annotationBase || options.identifiersLocked
              ? {
                  ...(options.annotationBase
                    ? { annotationBase: options.annotationBase }
                    : {}),
                  ...(options.identifiersLocked
                    ? { identifiersLocked: true }
                    : {}),
                }
              : undefined,
          chapters: [],
        },
  );

  const runesStore = createStoryStore(initialStoryData);

  // Create a writable store that wraps the runes store for backward compatibility
  const storyStore = writable(runesStore.story);
  const dirty = writable(false);

  const wrapMutation =
    <Payload>(
      mutation: (payload: Payload) => void,
    ): ((payload: Payload) => void) =>
    (payload) => {
      mutation(payload);
      storyStore.set(runesStore.story);
      dirty.set(true);
    };

  // Wrap the runes store methods to update the writable store
  const storyStoreWrapper = {
    addChapterFromCapture: wrapMutation(runesStore.addChapterFromCapture),
    updateChapterFromCapture: wrapMutation(runesStore.updateChapterFromCapture),
    deleteChapter: wrapMutation(runesStore.deleteChapter),
    reorderChapter: wrapMutation(runesStore.reorderChapter),
    setNarrationTrack: wrapMutation(runesStore.setNarrationTrack),
    setNarrationSegment: wrapMutation(runesStore.setNarrationSegment),
    removeNarrationSegment: wrapMutation(runesStore.removeNarrationSegment),
    setAnnotationText: wrapMutation(runesStore.setAnnotationText),
    setAnnotationPlacement: wrapMutation(runesStore.setAnnotationPlacement),
    setAdvanceMode: wrapMutation(runesStore.setAdvanceMode),
    setDelay: wrapMutation(runesStore.setDelay),
    setChapterManifest: wrapMutation(runesStore.setChapterManifest),
    setChapterTitle: wrapMutation(runesStore.setChapterTitle),
    setStoryTitle: wrapMutation(runesStore.setStoryTitle),
    setStoryIdentifiers: wrapMutation(runesStore.setStoryIdentifiers),
    setStoryPresentationAspect: wrapMutation(runesStore.setStoryPresentationAspect),
    setChapterCameraTrack: wrapMutation(runesStore.setChapterCameraTrack),
    setChapterViewBox: wrapMutation(runesStore.setChapterViewBox),
    setChapterDescription: wrapMutation(runesStore.setChapterDescription),
    setLayerOpacities: wrapMutation(runesStore.setLayerOpacities),
    exportStory: () => runesStore.exportStory(),
    loadStory: (next: StoryState) => {
      runesStore.loadStory(normalizeStoryAnnotations(next));
      storyStore.set(runesStore.story);
      dirty.set(false);
    },
  };

  const selectedChapterId = writable<string | null>(null);
  const activeChapterTask = writable<ChapterTaskId | null>(null);
  const selectedDrawingAnnotationId = writable<string | null>(null);
  const chapterAnnotationTool = writable<ChapterAnnotationTool>("select");
  /* A blank story begins with its source and metadata modal open. There is no
     chapter inspector to show until the first source has been captured. */
  const uiMode = writable<UIMode>(
    initialStoryData.chapters.length === 0 ? "narrationPanel" : "idle",
  );
  const positioningLanguage = writable<string | null>(null);
  const selectedMotionPointId = writable<string | null>(null);
  const motionPreviewing = writable(false);
  const drawerOpen = derived(
    uiMode,
    (mode) => mode !== "idle" && mode !== "annotationPositioning",
  );
  const viewBox = writable<ViewBox | null>(null);
  const mediaType = writable<MediaType | null>(null);
  const avMarksValid = writable(true);
  const transitionDelayDefault = writable(
    collectLatestTransitionDelay(initialStoryData),
  );
  const error = writable<string | null>(null);
  const validationErrors = writable<string[]>([]);
  const currentManifest = writable<string | null>(null);
  const viewerCanvasIndex = writable(0);
  const viewerCanvasCount = writable(0);
  const modelPoseDebug = writable<string | null>(null);
  const annotationLanguage = writable(languages[0]);
  const saveState = writable<SaveState>({ status: "idle" });
  const saveConfigured = writable(false);
  const canUndo = writable(false);
  const canRedo = writable(false);
  const saveModalOpen = writable(false);
  const saveModalPayload = writable<ExportEnvelope | null>(null);
  const sourcesModalOpen = writable(false);
  const mediaSourcesStore = writable<MediaSource[]>([]);
  const layerOpacitiesStore = writable<Record<string, number>>({});
  let saveConfig: SaveConfig | null = null;

  const mediaMarks = createMediaMarks();
  const mediaMarksState = writable<MediaMarksState>(mediaMarks.getState());
  const modelPose = createModelPose();
  const narrationPlayer = createNarrationPlayer();

  const history = createStoryHistory(initialStoryData);
  let latestNarrationSegments =
    collectLatestNarrationSegments(initialStoryData);

  let viewer: StoryPluginContext["viewer"] | null = null;
  let eventBus: StoryPluginContext["events"] | null = null;
  let attachedCount = 0;
  let detachEvents: (() => void) | null = null;
  let lastManifest: string | null = null;
  let pendingChapterApply: Chapter | null = null;
  let pendingApplyToken = 0;
  let pendingApplyRetries = 0;
  const maxPendingApplyRetries = 8;
  let pendingAddChapter = false;
  let pendingUpdateChapter = false;
  let sourceRetargetTimer: ReturnType<typeof setTimeout> | null = null;
  let sourceRetargetForceCapture = false;
  let activePlaybackToken = 0;
  let activePlaybackChapterId: string | null = null;
  let activeMediaEnd: number | null = null;
  let pendingMediaSyncToken = 0; // Token for media type sync (safety timeout only)

  const {
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
  } = createDrawingAnnotationsController({
    language,
    languages,
    storyStore,
    selectedChapterId,
    activeChapterTask,
    selectedDrawingAnnotationId,
    chapterAnnotationTool,
    annotationLanguage,
    positioningLanguage,
    uiMode,
    dirty,
    canUndo,
    canRedo,
    exportStory: () => storyStoreWrapper.exportStory(),
    replaceStory: (next) => {
      runesStore.loadStory(next);
      storyStore.set(runesStore.story);
    },
    pushHistorySnapshot: () => pushHistorySnapshot(),
    pushTransactionHistory: (snapshot) => {
      history.push(snapshot);
      historyRun = null;
    },
    syncHistoryFlags: () => {
      canUndo.set(history.canUndo());
      canRedo.set(history.canRedo());
    },
    getViewer: () => viewer,
  });

  const preview = createStoryPreviewOrchestrator({
    getStory: () => get(storyStore),
    getSelectedChapterId: () => get(selectedChapterId),
    selectChapter: (chapterId) => selectedChapterId.set(chapterId),
    applyChapter: (chapter) => applyChapter(chapter),
    getNarrationSegment: (chapter) => getNarrationSegment(chapter),
    closeEditors: () => {
      activeChapterTask.set(null);
      uiMode.set("idle");
    },
    stopPlayback: () => stopChapterPlayback(),
  });
  const isPreviewing = preview.isPreviewing;

  const setError = (message: string | null) => {
    error.set(message);
  };

  const saveStory = async (): Promise<SaveResult> => {
    const validation = saveExport();
    if (!validation.ok) {
      saveState.set({
        status: "error",
        message: validation.errors.join(" · "),
      });
      return { ok: false, message: validation.errors.join(" · ") };
    }
    const payload = buildExportEnvelope(storyStoreWrapper.exportStory());
    const saveHandler = saveConfig?.handler;
    const hasHandler =
      typeof saveHandler === "function" && (saveConfig?.enabled ?? true);
    const hasEndpoint =
      saveConfig?.endpoint && (saveConfig.enabled ?? true) ? true : false;
    if (hasEndpoint && !hasHandler && !get(storyStore).id) {
      const message = translate('storyBuilder.errors.missingPublicId');
      saveState.set({ status: "error", message, code: "missing_public_id" });
      return { ok: false, message, code: "missing_public_id" };
    }
    if (!hasEndpoint && !hasHandler) {
      saveModalPayload.set(payload);
      saveModalOpen.set(true);
      saveState.set({ status: "idle" });
      return { ok: true };
    }
    saveState.set({ status: "saving" });
    let result: SaveResult;
    if (hasHandler) {
      try {
        result = (await saveHandler!(payload)) ?? { ok: true };
      } catch (error) {
        result = {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          code: "handler",
        };
      }
    } else {
      result = await performFetchWithTimeout(saveConfig as SaveConfig, payload);
    }
    if (result.ok) {
      saveState.set({ status: "success", message: result.message });
      dirty.set(false);
    } else {
      saveState.set({
        status: "error",
        message: result.message,
        code: result.code,
      });
    }
    return result;
  };

  const setSaveConfig = (config: SaveConfig) => {
    saveConfig = config;
    saveConfigured.set(
      (typeof config?.handler === "function" && (config.enabled ?? true)) ||
        Boolean(config?.endpoint && (config.enabled ?? true)),
    );
  };

  const closeSaveModal = () => {
    saveModalOpen.set(false);
  };

  /*
   * Typing is one edit, not one per keystroke. Changes to the same field that
   * each follow the last within HISTORY_COALESCE_MS share the snapshot taken
   * before the run began, so one undo takes back the whole run. Any other edit
   * — or an undo or redo — ends the run.
   */
  const HISTORY_COALESCE_MS = 1000;
  let historyRun: { key: string; at: number } | null = null;

  const pushHistorySnapshot = (coalesceKey?: string) => {
    const now = Date.now();
    if (
      coalesceKey &&
      historyRun?.key === coalesceKey &&
      now - historyRun.at < HISTORY_COALESCE_MS
    ) {
      historyRun.at = now;
      return;
    }
    historyRun = coalesceKey ? { key: coalesceKey, at: now } : null;
    history.push(storyStoreWrapper.exportStory());
    canUndo.set(history.canUndo());
    canRedo.set(history.canRedo());
  };

  /** The run key for a typed field of the selected chapter. */
  const chapterFieldKey = (field: string, lang = ""): string =>
    `${field}:${get(selectedChapterId) ?? ""}:${lang}`;

  const restoreHistoryStory = (next: StoryState | null) => {
    historyRun = null;
    if (!next) return;
    activeChapterTask.set(null);
    runesStore.loadStory(next);
    storyStore.set(runesStore.story);
    dirty.set(true);
    const selectedId = get(selectedChapterId);
    const selectedStillExists = next.chapters.some(
      (chapter) => chapter.id === selectedId,
    );
    const nextSelection = selectedStillExists
      ? selectedId
      : (next.chapters[0]?.id ?? null);
    selectedChapterId.set(nextSelection);
    if (nextSelection) {
      const chapter = next.chapters.find((entry) => entry.id === nextSelection);
      if (chapter) applyChapter(chapter);
    }
    canUndo.set(history.canUndo());
    canRedo.set(history.canRedo());
  };

  const undo = () =>
    restoreHistoryStory(history.undo(storyStoreWrapper.exportStory()));
  const redo = () =>
    restoreHistoryStory(history.redo(storyStoreWrapper.exportStory()));

  const chapterActions = createChapterActions({
    getSelectedChapterId: () => get(selectedChapterId),
    storyStoreWrapper,
  });

  const syncMediaMarks = () => {
    mediaMarksState.set(mediaMarks.getState());
    avMarksValid.set(mediaMarks.hasValidMarks());
  };

  const isValidSegment = (start?: number, end?: number) =>
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    (end as number) > (start as number);

  const getNarrationSegment = (chapter: Chapter) => {
    const lang = get(annotationLanguage);
    const segment = chapter.narrationSegment?.[lang];
    const src = get(storyStore).narration?.tracks?.[lang]?.src ?? "";
    if (!src || !segment || !isValidSegment(segment.start, segment.end))
      return null;
    return { src, start: segment.start, end: segment.end };
  };

  const stopChapterPlayback = () => {
    activePlaybackToken += 1;
    activePlaybackChapterId = null;
    activeMediaEnd = null;
    narrationPlayer.stop();
    viewer?.pause?.();
    stopMotionPreview();
    // Leaving a preview part-way through a swap must not strand a blank stage.
    revealStage(0);
  };

  const startMediaSegment = (chapter: Chapter) => {
    if (!viewer || !chapter.media) return;
    const currentType = viewer.getMediaType?.() ?? null;
    if (currentType && currentType !== "audio" && currentType !== "video")
      return;
    if (!isValidSegment(chapter.media.start, chapter.media.end)) return;
    activeMediaEnd = chapter.media.end;
    activePlaybackChapterId = chapter.id;
    viewer.seekTo?.(chapter.media.start);
    viewer.play?.();
  };

  const startPlaybackForChapter = (chapter: Chapter) => {
    if (activePlaybackChapterId === chapter.id) return;
    stopChapterPlayback();
    activePlaybackChapterId = chapter.id;
    // Update selected chapter so UI shows which chapter is playing and annotations appear
    selectedChapterId.set(chapter.id);
    const token = ++activePlaybackToken;
    const narration = getNarrationSegment(chapter);
    startMotionTrackPlayback(chapter, { withAudio: false });
    const run = async () => {
      if (narration) {
        await narrationPlayer.playSegment(narration);
        if (token !== activePlaybackToken) return;
      }
      if (chapter.media) {
        startMediaSegment(chapter);
      }
    };
    void run();
  };

  const maybeStartPlayback = (chapter: Chapter) => {
    // In preview mode, we want audio/narration to play
    if (get(isPreviewing)) {
      startPlaybackForChapter(chapter);
      return;
    }

    // Outside preview mode, story builder should not auto-play audio/narration
    // Audio playback is only for story viewer mode and preview mode
    return;
  };

  const updateMediaType = (next: MediaType | null) => {
    mediaType.set(next);
    if (next !== "audio" && next !== "video") {
      mediaMarks.clear();
    } else {
      // When media type is audio/video, restore marks from the selected chapter if available
      const id = get(selectedChapterId);
      const storyValue = get(storyStore);
      const chapter = id
        ? storyValue.chapters.find((item) => item.id === id)
        : null;
      if (chapter?.media) {
        mediaMarks.setSegment(chapter.media.start, chapter.media.end);
      }
    }
    if (next !== "model") {
      modelPose.clear();
    }
    syncMediaMarks();
  };

  /**
   * Wait for media type to become available via state change events.
   * No polling - uses event-driven approach with safety timeout.
   */
  const scheduleMediaTypeSync = (attempts = 12, delayMs = 200) => {
    if (!viewer) return;
    const token = ++pendingMediaSyncToken;
    let count = 0;
    let lastSeenType: MediaType | null = null;

    // Safety timeout-based bounded wait (not for readiness detection)
    const tick = () => {
      if (token !== pendingMediaSyncToken) return;
      const next = viewer?.getMediaType?.() ?? null;

      // Update if media type changed or if this is the first check
      if (next !== lastSeenType) {
        lastSeenType = next;
        updateMediaType(next);
      }

      // Keep checking until we reach max attempts
      if (count < attempts) {
        count += 1;
        setTimeout(tick, delayMs);
      }
    };
    tick();
  };

  // Event-driven media type updates (no polling interval)
  // Media type changes are detected via stateChange and mediaChange events

  const formatModelPose = (pose: ChapterModel | null) => {
    if (!pose) return null;
    const payload = {
      cameraOrbit: pose.cameraOrbit ?? null,
      cameraTarget: pose.cameraTarget ?? null,
      fieldOfView: pose.fieldOfView ?? null,
      orientation: pose.orientation ?? null,
    };
    return JSON.stringify(payload);
  };

  const updateModelPoseDebug = (pose: ChapterModel | null) => {
    modelPoseDebug.set(formatModelPose(pose));
  };

  const syncManifestFromViewer = () => {
    if (!viewer) return;
    const manifest =
      viewer.getManifestId?.() ?? viewer.getState?.()?.manifestId ?? null;
    if (manifest) {
      lastManifest = manifest;
      currentManifest.set(manifest);
    }
  };

  const applyChapterView = (chapter: Chapter) => {
    if (!viewer) return;
    if (chapter.viewBox) {
      viewer.setViewBox(chapter.viewBox);
    }
    if (chapter.model) {
      if (viewer.setModelPose) {
        viewer.setModelPose(chapter.model, { transition: "interpolate" });
      } else {
        if (chapter.model.cameraOrbit) {
          viewer.setModelOrbit(chapter.model.cameraOrbit);
        }
        if (chapter.model.cameraTarget) {
          viewer.setModelTarget(chapter.model.cameraTarget);
        }
        if (chapter.model.orientation) {
          viewer.setModelOrientation(chapter.model.orientation);
        }
      }
    }
    if (chapter.layerOpacities) {
      for (const [id, opacity] of Object.entries(chapter.layerOpacities)) {
        viewer.updateLayerOpacity?.(id, opacity);
      }
    }
  };

  const viewBoxMatches = (a: ViewBox | null, b: ViewBox | undefined) =>
    a && b ? framingsWithin(a, b, APPLIED_FRAMING_TOLERANCE) : false;

  const getCurrentModelPose = (): ChapterModel | null => {
    if (!viewer) return null;
    const pose = viewer.getModelPose?.() ?? null;
    const cameraOrbit =
      pose?.cameraOrbit ?? viewer.getModelOrbit?.() ?? undefined;
    const cameraTarget =
      pose?.cameraTarget ?? viewer.getModelTarget?.() ?? undefined;
    const fieldOfView = pose?.fieldOfView ?? undefined;
    const orientation =
      pose?.orientation ?? viewer.getModelOrientation?.() ?? undefined;
    if (!cameraOrbit && !cameraTarget && !orientation && !fieldOfView)
      return null;
    return { cameraOrbit, cameraTarget, fieldOfView, orientation };
  };

  const beginPendingModelApply = (chapter: Chapter) => {
    if (!viewer || !chapter.model) return;
    applyChapterView({ ...chapter, viewBox: undefined });
    pendingChapterApply = null;
    revealStageWhenPainted();
  };

  let cancelAnimation: (() => void) | null = null;
  let cancelLayersAnimation: (() => void) | null = null;

  const animateViewBox = (to: ViewBox, durationMs = 320) => {
    if (!viewer) return;
    pendingApplyToken += 1;

    // Cancel any previous animation
    if (cancelAnimation) {
      cancelAnimation();
    }

    // Start new animation with cancel function
    cancelAnimation = animateViewBoxTransition(viewer, to, durationMs);
  };

  const beginPendingApply = (chapter: Chapter) => {
    if (!viewer) return;
    if (chapter.model && !chapter.viewBox) {
      beginPendingModelApply(chapter);
      maybeStartPlayback(chapter);
      return;
    }
    pendingApplyToken += 1;
    pendingApplyRetries = 0;
    const token = pendingApplyToken;

    const attempt = () => {
      if (!viewer || token !== pendingApplyToken) return;
      applyChapterView(chapter);
      maybeStartPlayback(chapter);
      // Every terminal branch reveals: this is the one place the incoming
      // framing is known to have landed, which is what a hidden stage is
      // waiting for. Both source-swap resume paths end up here.
      if (!chapter.viewBox) {
        pendingChapterApply = null;
        revealStageWhenPainted();
        return;
      }
      const current = viewer.getViewBox?.() ?? null;
      if (viewBoxMatches(current, chapter.viewBox)) {
        pendingChapterApply = null;
        revealStageWhenPainted();
        return;
      }
      if (pendingApplyRetries >= maxPendingApplyRetries) {
        pendingChapterApply = null;
        revealStageWhenPainted();
        return;
      }
      pendingApplyRetries += 1;
      setTimeout(attempt, 80);
    };

    // A frame is the natural moment to read the viewer back, but frame
    // callbacks stop arriving in a background tab. Racing a short timer keeps
    // the apply — and the stage reveal that follows it — from stalling there.
    let started = false;
    const startAttempt = () => {
      if (started || token !== pendingApplyToken) return;
      started = true;
      attempt();
    };
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(startAttempt);
    }
    setTimeout(startAttempt, 32);
  };

  /**
   * Stage crossfade, matching the story viewer.
   *
   * The editor swaps its source through the same viewer the reader sees, so a
   * chapter that changes Manifest or Canvas cuts between two unrelated images
   * mid-preview. Fading the stage down for the swap and back up once the new
   * framing is set makes the editor show what a reader will get.
   */
  const stageFade = writable<StageFade>({ opacity: 1, durationMs: 0 });
  let stageHidden = false;
  let stageRevealTimer: ReturnType<typeof setTimeout> | null = null;
  let stageSwapTimer: ReturnType<typeof setTimeout> | null = null;

  const crossfadeMs = () => {
    const reduceMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    return reduceMotion ? 0 : STAGE_CROSSFADE_MS;
  };

  // The stage belongs to the viewer layout, not to any builder panel, so the
  // request travels on the viewer's own event bus.
  const setStageFade = (opacity: number, durationMs: number) => {
    stageFade.set({ opacity, durationMs });
    eventBus?.emit("stageFade", { opacity, durationMs });
  };

  const revealStage = (durationMs = crossfadeMs()) => {
    if (stageRevealTimer) {
      clearTimeout(stageRevealTimer);
      stageRevealTimer = null;
    }
    // Revealing abandons the swap this fade was covering — stopping a preview
    // must not have the source change land afterwards.
    if (stageSwapTimer) {
      clearTimeout(stageSwapTimer);
      stageSwapTimer = null;
    }
    if (!stageHidden) return;
    stageHidden = false;
    setStageFade(1, durationMs);
  };

  /**
   * Hides the stage, then runs the swap once it is actually hidden. A source
   * that never arrives must not stall the editor behind a blank stage, so the
   * hide carries its own deadline.
   */
  const afterStageHidden = (swap: () => void) => {
    const ms = crossfadeMs();
    // A swap still waiting on the fade belongs to a chapter that has since been
    // superseded. Letting it land would move the viewer back to the old source
    // after the new one had already arrived.
    if (stageSwapTimer) {
      clearTimeout(stageSwapTimer);
      stageSwapTimer = null;
    }
    if (stageHidden) {
      swap();
      return;
    }
    stageHidden = true;
    setStageFade(0, ms);
    if (stageRevealTimer) clearTimeout(stageRevealTimer);
    stageRevealTimer = setTimeout(() => {
      stageRevealTimer = null;
      revealStage(0);
    }, ms + 4000);
    if (ms <= 0) {
      swap();
      return;
    }
    stageSwapTimer = setTimeout(() => {
      stageSwapTimer = null;
      swap();
    }, ms);
  };

  const revealStageWhenPainted = () => {
    if (!stageHidden) return;
    // A frame after the framing call, so what fades up is the new canvas in
    // position rather than the tail of the viewer settling onto it. Frame
    // callbacks stop arriving in a background tab, so a short timer races them
    // — otherwise the stage waits on the deadline below to be released.
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      revealStage();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    }
    setTimeout(reveal, 120);
  };

  const applyChapter = (chapter: Chapter) => {
    if (!viewer) return;
    if (cancelLayersAnimation) {
      cancelLayersAnimation();
      cancelLayersAnimation = null;
    }

    // A source swap is a two-phase affair here: the branches below hand off to
    // the viewer and return, and a manifest or page event resumes the apply
    // through `beginPendingApply`, which is where the stage is revealed.
    const viewerManifest =
      viewer.getManifestId?.() ?? viewer.getState?.()?.manifestId ?? null;
    if (chapter.manifest && chapter.manifest !== viewerManifest) {
      pendingChapterApply = chapter;
      // Abandon any apply still retrying for the outgoing chapter. Its framing
      // belongs to the source being replaced, and letting it finish would also
      // reveal the stage this swap has just hidden.
      pendingApplyToken += 1;
      afterStageHidden(() => {
        viewer?.setManifest(chapter.manifest);
        currentManifest.set(chapter.manifest);
      });
      return;
    }
    const currentIndex = viewer.getCanvasIndex?.() ?? -1;
    if (
      typeof chapter.canvasIndex === "number" &&
      chapter.canvasIndex !== currentIndex
    ) {
      pendingChapterApply = chapter;
      pendingApplyToken += 1;
      afterStageHidden(() => {
        viewer?.setCanvasByIndex(chapter.canvasIndex);
      });
      return;
    }
    pendingChapterApply = null;

    // Published playback enters a chapter at its first camera point. Use the
    // same source of truth in builder preview; the chapter selector can be a
    // larger union box after import and is not necessarily Motion Point 1.
    const previewEntryViewBox = get(isPreviewing)
      ? [...(chapter.cameraTrack?.keyframes ?? [])]
          .sort((a, b) => a.timeMs - b.timeMs)
          .find((point) => point.viewBox)?.viewBox
      : undefined;
    const entryChapter = previewEntryViewBox
      ? { ...chapter, viewBox: previewEntryViewBox }
      : chapter;

    if (entryChapter.layerOpacities) {
      const fromOpacities = viewer.getLayerOpacities?.() ?? {};
      cancelLayersAnimation = animateLayerOpacities(
        viewer,
        fromOpacities,
        entryChapter.layerOpacities,
      );
    }

    if (entryChapter.viewBox) {
      const currentViewBox = viewer.getViewBox?.() ?? null;
      if (
        currentViewBox &&
        !viewBoxMatches(currentViewBox, entryChapter.viewBox)
      ) {
        animateViewBox(entryChapter.viewBox);
        if (entryChapter.model) {
          applyChapterView({ ...entryChapter, viewBox: undefined });
        }
        maybeStartPlayback(entryChapter);
        return;
      }
    }
    if (entryChapter.model) {
      beginPendingModelApply(entryChapter);
      maybeStartPlayback(entryChapter);
      return;
    }
    beginPendingApply(entryChapter);
    maybeStartPlayback(entryChapter);
  };

  const waitForManifest = (timeoutMs = 2000): Promise<boolean> => {
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      unsubscribe = currentManifest.subscribe((value) => {
        if (settled) return;
        if (value) {
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          resolve(true);
        }
      });
    });
  };

  const handleCaptureResult = (result: ReturnType<typeof capture>) => {
    if (!result.ok) {
      if (result.reason === "missing-manifest") {
        setError(null);
        selectedChapterId.set(null);
        uiMode.set("narrationPanel");
      } else {
        setError(translate('storyBuilder.errors.captureBlocked', {
          reason: translate(`storyBuilder.errors.capture.${result.reason}`),
        }));
      }
      return false;
    }
    setError(null);
    const activeLanguage = get(annotationLanguage);
    const latestNarrationSegment = latestNarrationSegments[activeLanguage];
    const transitionDelay = get(transitionDelayDefault);
    const currentStory = storyStoreWrapper.exportStory();
    if (
      !(Number.isFinite(currentStory.presentationAspect) &&
        (currentStory.presentationAspect ?? 0) > 0)
    ) {
      // Establish the output contract once, when the first chapter is
      // created. The source canvas is content inside that frame; loading it
      // must never redefine the editor's perspective.
      runesStore.loadStory({
        ...currentStory,
        presentationAspect: presentationAspectFor(),
      });
      storyStore.set(runesStore.story);
    }
    storyStoreWrapper.addChapterFromCapture({ capture: result.capture });
    const storyValue = get(storyStore);
    const lastId = storyValue.chapters[storyValue.chapters.length - 1]?.id;
    if (lastId) {
      storyStoreWrapper.setAdvanceMode({ chapterId: lastId, mode: "auto" });
      storyStoreWrapper.setDelay({
        chapterId: lastId,
        delayMs: transitionDelay,
      });
      if (latestNarrationSegment) {
        storyStoreWrapper.setNarrationSegment({
          chapterId: lastId,
          language: activeLanguage,
          start: latestNarrationSegment.start,
          end: latestNarrationSegment.end,
        });
      }
      selectedChapterId.set(lastId);
    }
    setTimeout(() => {
      if (get(selectedChapterId) === lastId) {
        uiMode.set("chapterEdit");
      }
    }, 0);
    return true;
  };

  const handleUpdateResult = (
    result: ReturnType<typeof capture>,
    chapterId: string,
  ) => {
    if (!result.ok) {
      if (result.reason === "missing-manifest") {
        setError(null);
        uiMode.set("chapterEdit");
      } else {
        setError(translate('storyBuilder.errors.captureBlocked', {
          reason: translate(`storyBuilder.errors.capture.${result.reason}`),
        }));
      }
      return false;
    }
    setError(null);
    storyStoreWrapper.updateChapterFromCapture({
      chapterId,
      capture: result.capture,
    });
    const updatedChapter = get(storyStore).chapters.find(
      (chapter) => chapter.id === chapterId,
    );
    const track = updatedChapter?.cameraTrack;
    const stableViewBox = result.capture.viewBox;
    if (track?.preset && track.preset !== "custom" && stableViewBox) {
      storyStoreWrapper.setChapterCameraTrack({
        chapterId,
        cameraTrack: configureCameraTrackPreset(
          track,
          track.preset,
          stableViewBox,
          track.durationMs,
          { preservePoints: true },
        ),
      });
    }
    return true;
  };

  const resolveManifest = () => {
    if (!viewer) {
      return { ok: false as const, reason: "missing-manifest" as const };
    }
    const storyValue = get(storyStore);
    const previousChapterManifest =
      storyValue.chapters[storyValue.chapters.length - 1]?.manifest ?? null;
    const viewerManifest = viewer.getManifestId?.() ?? null;
    const stateManifest = viewer.getState?.()?.manifestId ?? null;
    const effectiveManifest =
      viewerManifest ||
      stateManifest ||
      lastManifest ||
      get(currentManifest) ||
      null;
    return resolveManifestForNewChapter(
      effectiveManifest,
      previousChapterManifest,
    );
  };

  /**
   * Brings a capture's framing to the story's canonical aspect. Captures read
   * the live viewport, so without this a chapter created with the inspector or
   * the motion timeline open is stored at a different shape from its
   * neighbours and reframes differently for a reader.
   */
  const withNormalisedFraming = <T extends { ok: boolean }>(result: T): T => {
    if (!result.ok) return result;
    const captured = (result as { capture?: { viewBox?: ViewBox } }).capture;
    if (!captured?.viewBox) return result;
    const normalised = containViewBox(
      captured.viewBox,
      presentationAspectFor(),
    );
    // A stage wider than the image letterboxes, so the box can still hang
    // over the edge of the picture; the
    // default frame should start where every later edit will keep it.
    const contentSize = viewer?.getContentSize?.() ?? null;
    return {
      ...result,
      capture: {
        ...captured,
        viewBox: contentSize ? fitViewBoxToContent(normalised, contentSize) : normalised,
      },
    };
  };

  const capture = () => {
    if (!viewer)
      return { ok: false as const, reason: "missing-manifest" as const };
    const manifestResolution = resolveManifest();
    if (!manifestResolution.ok) {
      return { ok: false as const, reason: "missing-manifest" as const };
    }
    const manifestOverride = viewer.getManifestId()
      ? undefined
      : manifestResolution.manifest;

    const type = viewer.getMediaType();
    if (type === "audio" || type === "video") {
      const markedSegment = mediaMarks.getSegment();
      const availableSources =
        viewer.getMediaSources?.() ?? get(mediaSourcesStore);
      mediaSourcesStore.set(availableSources);
      const sourceDuration = availableSources.find(
        (source) => source.type === type && Number.isFinite(source.duration),
      )?.duration;
      const segment =
        markedSegment ??
        (sourceDuration != null && sourceDuration > 0
          ? { start: 0, end: sourceDuration }
          : null);
      return captureAudioVideo(viewer, segment, manifestOverride);
    }
    if (type === "model") {
      return captureModel(viewer, modelPose.getPose(), manifestOverride);
    }
    return withNormalisedFraming(captureImagePdf(viewer, manifestOverride));
  };

  /*
   * What the author is editing is drawn on the image: the chapter frame, and
   * the chapter's camera keyframes as numbered outlines. The stage is whatever
   * shape the window leaves it, so these outlines — not the stage edge — are
   * what say which part of the picture a reader gets.
   *
   * One frame carries the handles at a time. With no keyframe selected that is
   * the chapter frame; selecting a keyframe hands them to its outline, and the
   * chapter frame stays as a quiet guide underneath.
   */
  const {
    stageFrames,
    pushStageFrames,
    resetLastPushed: resetLastPushedFrames,
  } = createStageFramesSync({
    storyStore,
    selectedChapterId,
    activeChapterTask,
    isPreviewing,
    uiMode,
    mediaType,
    selectedMotionPointId,
    motionPreviewing,
    frameAspect: () => frameAspect(),
    getViewer: () => viewer,
  });

  const attach = (ctx: StoryPluginContext) => {
    if (!ctx?.viewer) {
      return () => undefined;
    }
    viewer = ctx.viewer;
    eventBus = ctx.events;
    viewer.setStoryAnnotationEditing?.(get(activeChapterTask) === "focus");
    syncEditableStoryAnnotations();
    lastManifest =
      ctx.viewer.getManifestId?.() ??
      ctx.viewer.getState?.()?.manifestId ??
      null;
    currentManifest.set(lastManifest);
    viewerCanvasIndex.set(ctx.viewer.getCanvasIndex?.() ?? 0);
    viewerCanvasCount.set(ctx.viewer.getCanvasCount?.() ?? 0);
    viewBox.set(
      ctx.viewer.getViewBox?.() ?? ctx.viewer.getState?.()?.viewBox ?? null,
    );
    mediaSourcesStore.set(ctx.viewer.getMediaSources?.() ?? []);
    layerOpacitiesStore.set(ctx.viewer.getLayerOpacities?.() ?? {});
    const initialMediaType = ctx.viewer.getMediaType?.() ?? null;
    updateMediaType(initialMediaType);
    if (!initialMediaType) {
      scheduleMediaTypeSync();
    }
    // No mediaTypePolling interval - use event-driven updates via stateChange/mediaChange
    attachedCount += 1;
    if (attachedCount === 1) {
      const offState = ctx.events.on("stateChange", ({ snapshot }) => {
        updateMediaType(snapshot.mediaType);
        lastManifest = snapshot.manifestId || null;
        currentManifest.set(lastManifest);
        viewerCanvasIndex.set(
          snapshot.canvasIndex ?? ctx.viewer.getCanvasIndex?.() ?? 0,
        );
        viewerCanvasCount.set(ctx.viewer.getCanvasCount?.() ?? 0);
        viewBox.set(
          snapshot.viewBox ?? ctx.viewer.getViewBox?.() ?? get(viewBox),
        );
        mediaSourcesStore.set(ctx.viewer.getMediaSources?.() ?? []);
        layerOpacitiesStore.set(ctx.viewer.getLayerOpacities?.() ?? {});
        if (snapshot.mediaType === "model") {
          updateModelPoseDebug(getCurrentModelPose() ?? modelPose.getPose());
        }
        if (pendingChapterApply && snapshot.manifestId) {
          if (snapshot.manifestId === pendingChapterApply.manifest) {
            if (snapshot.canvasIndex !== pendingChapterApply.canvasIndex) {
              viewer?.setCanvasByIndex(pendingChapterApply.canvasIndex);
            } else {
              const pending = pendingChapterApply;
              pendingChapterApply = null;
              beginPendingApply(pending);
            }
          }
        }
        setError(null);
      });
      const offManifest = ctx.events.on("manifestChange", ({ manifestId }) => {
        lastManifest = manifestId || null;
        currentManifest.set(lastManifest);
        viewerCanvasCount.set(ctx.viewer.getCanvasCount?.() ?? 0);
        updateMediaType(null);
        scheduleMediaTypeSync();
        if (
          pendingChapterApply &&
          pendingChapterApply.manifest === manifestId
        ) {
          viewer?.setCanvasByIndex(pendingChapterApply.canvasIndex);
        }
        scheduleSourceRetargetCapture(true);
        setError(null);
      });
      const offPage = ctx.events.on("pageChange", ({ index }) => {
        viewerCanvasIndex.set(index);
        viewerCanvasCount.set(ctx.viewer.getCanvasCount?.() ?? 0);
        // Update media type when navigating to different canvas
        // The media type might not be immediately available, so poll for it
        scheduleMediaTypeSync(12, 100); // Check more frequently (100ms intervals)
        if (pendingChapterApply && pendingChapterApply.canvasIndex === index) {
          const pending = pendingChapterApply;
          pendingChapterApply = null;
          beginPendingApply(pending);
        }
        scheduleSourceRetargetCapture();
      });
      const offViewBox = ctx.events.on(
        "viewBoxChange",
        ({ viewBox: nextViewBox }) => {
          viewBox.set(nextViewBox ?? null);
        },
      );
      const offZoom = ctx.events.on(
        "zoomChange",
        ({ viewBox: nextViewBox }) => {
          viewBox.set(nextViewBox ?? null);
        },
      );
      const offTime = ctx.events.on("mediaTimeUpdate", ({ time }) => {
        mediaMarks.updateTime(time);
        syncMediaMarks();
        if (
          activeMediaEnd != null &&
          activePlaybackChapterId === get(selectedChapterId) &&
          time >= activeMediaEnd - 0.05
        ) {
          activeMediaEnd = null;
          viewer?.pause?.();
        }
      });
      const offModel = ctx.events.on(
        "modelChange",
        ({ cameraOrbit, cameraTarget, fieldOfView, orientation }) => {
          modelPose.updateFromEvent({
            cameraOrbit,
            cameraTarget,
            fieldOfView,
            orientation,
          });
          updateModelPoseDebug(modelPose.getPose());
        },
      );
      const offMedia = ctx.events.on("mediaChange", ({ mediaType }) => {
        mediaSourcesStore.set(ctx.viewer.getMediaSources?.() ?? []);
        updateMediaType(mediaType);
      });

      const offMediaPlay = ctx.events.on("mediaPlay", ({ time }) => {
        // When user manually starts audio/video playback, seek to Mark In if set
        const id = get(selectedChapterId);
        const storyValue = get(storyStore);
        const chapter = id
          ? storyValue.chapters.find((item) => item.id === id)
          : null;

        if (chapter?.media && time < chapter.media.start) {
          // If playback started before Mark In, seek to Mark In
          viewer?.seekTo?.(chapter.media.start);
        }

        // Set up auto-stop at Mark Out
        if (chapter?.media) {
          activeMediaEnd = chapter.media.end;
          activePlaybackChapterId = chapter.id;
        }
      });
      const offAnnotationCreate = ctx.events.on(
        "annotationCreate",
        ({ annotation, tool }) => {
          if (
            get(activeChapterTask) !== "focus" ||
            !annotation ||
            typeof annotation !== "object"
          ) {
            return;
          }
          addChapterDrawingAnnotation(annotation as ResolvedAnnotation, tool);
        },
      );
      const offAnnotationUpdate = ctx.events.on(
        "annotationUpdate",
        ({ annotationId, patch }) => {
          if (get(activeChapterTask) === "focus") {
            updateChapterDrawingAnnotation(annotationId, patch);
          }
        },
      );
      const offAnnotationDelete = ctx.events.on(
        "annotationDelete",
        ({ annotationId }) => {
          if (get(activeChapterTask) === "focus")
            deleteChapterDrawingAnnotation(annotationId);
        },
      );
      const offFrameChange = ctx.events.on(
        "storyFrameChange",
        ({ frameId, viewBox: nextViewBox }) => {
          if (frameId === CHAPTER_FRAME_ID) {
            setChapterPosition(nextViewBox);
            return;
          }
          const keyframeId = keyframeIdFromFrame(frameId);
          if (keyframeId) setMotionPointViewBox(keyframeId, nextViewBox);
        },
      );
      const offFrameSelect = ctx.events.on("storyFrameSelect", ({ frameId }) => {
        const keyframeId = frameId ? keyframeIdFromFrame(frameId) : null;
        if (keyframeId) selectedMotionPointId.set(keyframeId);
      });
      const offFrames = stageFrames.subscribe(pushStageFrames);

      detachEvents = () => {
        offState();
        offManifest();
        offPage();
        offViewBox();
        offZoom();
        offTime();
        offModel();
        offMedia();
        offMediaPlay();
        offAnnotationCreate();
        offAnnotationUpdate();
        offAnnotationDelete();
        offFrameChange();
        offFrameSelect();
        offFrames();
        if (sourceRetargetTimer) clearTimeout(sourceRetargetTimer);
        sourceRetargetTimer = null;
        sourceRetargetForceCapture = false;
        resetLastPushedFrames();
      };

      // Auto-select the first chapter on initial attach so editor shows content
      autoSelectFirstChapterIfNeeded();
    }

    return () => {
      attachedCount = Math.max(0, attachedCount - 1);
      if (attachedCount === 0) {
        // No polling to stop - cleanup handled by event unsubscribes
        detachEvents?.();
        detachEvents = null;
        // Detaching mid-fade must not leave a swap or a reveal queued against a
        // viewer that is going away.
        revealStage(0);
        eventBus = null;
      }
    };
  };

  const addChapter = () => {
    if (pendingAddChapter) return;
    activeChapterTask.set(null);
    pushHistorySnapshot();
    let result = capture();
    if (result.ok) {
      handleCaptureResult(result);
      return;
    }
    if (result.reason !== "missing-manifest") {
      handleCaptureResult(result);
      return;
    }
    pendingAddChapter = true;
    syncManifestFromViewer();
    void waitForManifest().then(() => {
      pendingAddChapter = false;
      result = capture();
      handleCaptureResult(result);
    });
  };

  const updateChapter = () => {
    const id = get(selectedChapterId);
    if (!id) return;
    if (pendingUpdateChapter) return;
    pushHistorySnapshot();
    let result = capture();
    if (result.ok) {
      handleUpdateResult(result, id);
      return;
    }
    if (result.reason !== "missing-manifest") {
      handleUpdateResult(result, id);
      return;
    }
    pendingUpdateChapter = true;
    syncManifestFromViewer();
    void waitForManifest().then(() => {
      pendingUpdateChapter = false;
      result = capture();
      handleUpdateResult(result, id);
    });
  };

  /**
   * The source task can retarget a chapter at a different Manifest or Canvas,
   * but the canvas the chapter stores is only ever written by a capture. Moving
   * with the viewer controls changes the viewer alone, so without this the
   * chapter keeps the canvas it was created on and silently replays the wrong
   * image. A full re-capture is the right tool because the stored framing
   * belongs to the old canvas too, and only re-reading the viewer brings both
   * back into agreement.
   */
  const captureSourceRetarget = (force = false): boolean => {
    const chapterId = get(selectedChapterId);
    if (!chapterId || !viewer) return false;
    const chapter = get(storyStore).chapters.find(
      (entry) => entry.id === chapterId,
    );
    if (!chapter) return false;

    const manifest = viewer.getManifestId?.() ?? null;
    const canvasId = viewer.getCanvasId?.() ?? null;
    const canvasIndex = viewer.getCanvasIndex?.() ?? -1;
    // A viewer that has not settled on a canvas has nothing to capture from.
    if (!manifest || (!canvasId && canvasIndex < 0)) return false;

    const mediaType = viewer.getMediaType?.();
    if (
      mediaType !== "audio" &&
      mediaType !== "video" &&
      mediaType !== "model" &&
      !viewer.getViewBox?.()
    ) {
      return false;
    }

    const unchangedCanvas =
      chapter.canvasId && canvasId
        ? chapter.canvasId === canvasId
        : chapter.canvasIndex === canvasIndex;
    if (!force && chapter.manifest === manifest && unchangedCanvas) return true;

    updateChapter();
    return true;
  };

  const scheduleSourceRetargetCapture = (
    force = false,
    remainingAttempts = 30,
  ) => {
    if (get(activeChapterTask) !== "source") return;
    sourceRetargetForceCapture ||= force;
    if (sourceRetargetTimer) clearTimeout(sourceRetargetTimer);
    sourceRetargetTimer = setTimeout(() => {
      sourceRetargetTimer = null;
      if (get(activeChapterTask) !== "source") return;
      if (captureSourceRetarget(sourceRetargetForceCapture)) {
        sourceRetargetForceCapture = false;
        return;
      }
      if (remainingAttempts <= 0) {
        sourceRetargetForceCapture = false;
        return;
      }
      scheduleSourceRetargetCapture(
        sourceRetargetForceCapture,
        remainingAttempts - 1,
      );
    }, 100);
  };

  /** The source sits inside the authored frame; it never chooses its aspect. */
  const presentationAspectFor = (): number =>
    resolvePresentationAspect(get(storyStore));

  const commitChapterViewBox = (chapterId: string, requested: ViewBox) => {
    // Stored at the story's canonical aspect so every chapter responds to a
    // reader's window the same way. A capture carries the editor stage's shape
    // and manual entry carries whatever was typed; neither should decide how
    // this chapter is framed relative to the others.
    /*
     * Normalise first so the chapter is comparable with its siblings, then
     * bring it inside the canvas: a framing is a region of the image, and one
     * that hangs outside it cannot be written as a Media Fragment without
     * being silently truncated on the way out. Fitted, not clamped, so the
     * shape the frame was drawn at survives meeting the edge of the picture.
     */
    const contentSize = viewer?.getContentSize?.() ?? null;
    const normalised = normaliseViewBox(requested, presentationAspectFor());
    const viewBox = contentSize
      ? fitViewBoxToContent(normalised, contentSize)
      : normalised;
    pushHistorySnapshot();
    storyStoreWrapper.setChapterViewBox({ chapterId, viewBox });
    const chapter = get(storyStore).chapters.find(
      (entry) => entry.id === chapterId,
    );
    const track = chapter?.cameraTrack;
    if (track?.preset && track.preset !== "custom") {
      storyStoreWrapper.setChapterCameraTrack({
        chapterId,
        cameraTrack: configureCameraTrackPreset(
          track,
          track.preset,
          viewBox,
          track.durationMs,
          {
            preservePoints: true,
          },
        ),
      });
    }
    setError(null);
  };

  /*
   * The camera is deliberately left where it is. The frame is an object on
   * the canvas the author has just placed by looking at it; flying the view to
   * it would move the very thing they are judging it against. "Go to frame"
   * in the inspector is the camera convenience, not this.
   */
  const setChapterPosition = (nextViewBox: ViewBox) => {
    const chapterId = get(selectedChapterId);
    if (!chapterId) return;
    const viewBox = { ...nextViewBox };
    if (
      ![viewBox.x, viewBox.y, viewBox.w, viewBox.h].every(Number.isFinite) ||
      viewBox.w <= 0 ||
      viewBox.h <= 0
    )
      return;
    commitChapterViewBox(chapterId, viewBox);
  };

  /**
   * The story-shaped box inside what the author is looking at, kept on the
   * picture. This is the one reading of "the current view" every capture uses,
   * so a frame or keyframe taken from the view never reaches past its edges.
   */
  const currentViewFrame = (): ViewBox | null => {
    const view = viewer?.getViewBox?.() ?? get(viewBox);
    if (
      !view ||
      ![view.x, view.y, view.w, view.h].every(Number.isFinite) ||
      view.w <= 0 ||
      view.h <= 0
    )
      return null;
    const contained = containViewBox(view, presentationAspectFor());
    const contentSize = viewer?.getContentSize?.() ?? null;
    return contentSize ? fitViewBoxToContent(contained, contentSize) : contained;
  };

  const setChapterPositionFromView = () => {
    const frame = currentViewFrame();
    if (!frame) return;
    selectedMotionPointId.set(null);
    setChapterPosition(frame);
  };

  const resetViewToSaved = () => {
    const chapterId = get(selectedChapterId);
    const chapter = get(storyStore).chapters.find((item) => item.id === chapterId);
    if (!chapter || !viewer) return;
    const selectedPointId = get(selectedMotionPointId);
    const selectedPoint = selectedPointId
      ? chapter.cameraTrack?.keyframes?.find((point) => point.id === selectedPointId)
      : null;
    const targetBox = selectedPoint?.viewBox ?? chapter.viewBox;
    if (targetBox) {
      viewer.setViewBox?.(targetBox);
      viewBox.set(targetBox);
    }
    const targetModel = selectedPoint?.model ?? chapter.model;
    if (targetModel) {
      viewer.setModelPose?.(targetModel);
    }
  };

  const deleteChapter = (chapterId: string) => {
    activeChapterTask.set(null);
    pushHistorySnapshot();
    const chapters = get(storyStore).chapters;
    const deletedIndex = chapters.findIndex(
      (chapter) => chapter.id === chapterId,
    );
    const fallbackId =
      chapters[deletedIndex + 1]?.id ?? chapters[deletedIndex - 1]?.id ?? null;
    chapterActions.deleteChapter(chapterId, () => {
      selectedChapterId.set(fallbackId);
      if (fallbackId) selectChapter(fallbackId);
    });
  };

  const duplicateChapter = (chapterId: string) => {
    const current = storyStoreWrapper.exportStory();
    const sourceIndex = current.chapters.findIndex(
      (chapter) => chapter.id === chapterId,
    );
    const source = current.chapters[sourceIndex];
    if (!source) return;
    activeChapterTask.set(null);
    pushHistorySnapshot();
    const duplicateId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `chapter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const duplicate: Chapter = {
      ...cloneStoryValue(source),
      id: duplicateId,
      title: source.title
        ? Object.fromEntries(
            Object.entries(source.title).map(([lang, value]) => [
              lang,
              `${value} copy`,
            ]),
          )
        : undefined,
    };
    const next = cloneStoryValue(current);
    next.chapters.splice(sourceIndex + 1, 0, duplicate);
    runesStore.loadStory(next);
    storyStore.set(runesStore.story);
    dirty.set(true);
    selectedChapterId.set(duplicateId);
    applyChapter(duplicate);
    uiMode.set("chapterEdit");
  };

  const reorderChapter = (
    chapterId: string,
    targetChapterId: string,
    position: "before" | "after" = "before",
  ) => {
    pushHistorySnapshot();
    chapterActions.reorderChapter(chapterId, targetChapterId, position);
  };

  /**
   * Auto-select the first chapter if available and no chapter is currently selected.
   * This ensures the editor shows content on load instead of placeholder messages.
   */
  const autoSelectFirstChapterIfNeeded = () => {
    // Deferred so the viewer is fully initialised after attach. The guard is
    // re-checked on arrival rather than when scheduling, so a selection made in
    // the meantime is not overridden by the chapter that was first at load.
    setTimeout(() => {
      const firstChapter = get(storyStore).chapters?.[0];
      if (firstChapter?.id && get(selectedChapterId) === null) {
        selectChapter(firstChapter.id);
      }
    }, 0);
  };

  const selectChapter = (chapterId: string | null) => {
    stopMotionPreview();
    selectedMotionPointId.set(null);
    activeChapterTask.set(null);
    setChapterAnnotationTool("select");
    selectedChapterId.set(chapterId);
    syncEditableStoryAnnotations();
    if (!chapterId) {
      stopChapterPlayback();
      mediaMarks.clear();
      syncMediaMarks();
      return;
    }
    const storyValue = get(storyStore);
    const chapter = storyValue.chapters.find((item) => item.id === chapterId);
    stopChapterPlayback();
    if (chapter?.media) {
      mediaMarks.setSegment(chapter.media.start, chapter.media.end);
    } else {
      mediaMarks.clear();
    }
    syncMediaMarks();
    if (chapter) {
      applyChapter(chapter);
    }
  };

  const openNarration = () => {
    activeChapterTask.set(null);
    uiMode.update((mode) =>
      mode === "narrationPanel" ? "idle" : "narrationPanel",
    );
  };
  const backFromNarration = () =>
    uiMode.set(get(selectedChapterId) ? "chapterEdit" : "idle");
  const closeNarration = () => uiMode.set("idle");
  const openChapter = () => {
    setTimeout(() => {
      if (get(selectedChapterId)) {
        uiMode.set("chapterEdit");
      }
    }, 0);
  };
  const closeChapter = () => {
    stopMotionPreview();
    selectedMotionPointId.set(null);
    activeChapterTask.set(null);
    uiMode.set("idle");
  };

  const startPreview = () => {
    void preview.start();
  };
  const stopPreview = preview.stop;

  /** Plays a single chapter exactly as the story viewer would present it. */
  const previewChapter = (chapterId?: string) => {
    const targetId = chapterId ?? get(selectedChapterId);
    if (!targetId) return;
    void preview.start({ chapterId: targetId, singleChapter: true });
  };

  const markIn = () => {
    mediaMarks.markIn();
    syncMediaMarks();
  };

  const markOut = () => {
    mediaMarks.markOut();
    syncMediaMarks();
  };

  const setMediaMarks = (start: number | null, end: number | null) => {
    mediaMarks.setSegment(start, end);
    syncMediaMarks();
  };

  const assignMediaSegment = (start: number, end: number) => {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start
    )
      return;
    setMediaMarks(start, end);
    viewer?.setMediaSegment?.(start, end);
    const chapterId = get(selectedChapterId);
    if (!chapterId) return;
    const current = storyStoreWrapper.exportStory();
    const chapterIndex = current.chapters.findIndex(
      (entry) => entry.id === chapterId,
    );
    if (chapterIndex < 0) return;
    pushHistorySnapshot();
    const next = cloneStoryValue(current);
    next.chapters[chapterIndex].media = { start, end };
    runesStore.loadStory(next);
    storyStore.set(runesStore.story);
    dirty.set(true);
  };

  const previewMediaSegment = () => {
    if (!viewer) return;
    const state = mediaMarks.getState();
    const start = state.markIn;
    const end = state.markOut;
    if (start == null || end == null || end <= start) return;
    const currentType = viewer.getMediaType?.() ?? null;
    if (currentType !== "audio" && currentType !== "video") return;

    // Set the active playback chapter ID so the time update handler works
    const currentChapterId = get(selectedChapterId);
    if (currentChapterId) {
      activePlaybackChapterId = currentChapterId;
    }

    activeMediaEnd = end;
    viewer.seekTo?.(start);
    viewer.play?.();
  };

  const stopPreviewMediaSegment = () => {
    if (!viewer) return;
    viewer.pause?.();
    activeMediaEnd = null;
    activePlaybackChapterId = null;

    // Reset to start position
    const state = mediaMarks.getState();
    const start = state.markIn;
    if (start != null) {
      viewer.seekTo?.(start);
    }
  };

  const setNarrationTrack = (lang: string, src: string) => {
    pushHistorySnapshot(`narration-track::${lang}`);
    chapterActions.setNarrationTrack(lang, src);
  };

  const updateStoryTitle = (lang: string, value: string) => {
    pushHistorySnapshot(`story-title::${lang}`);
    storyStoreWrapper.setStoryTitle({ language: lang, value });
  };

  const updateStoryIdentifiers = (id: string, annotationBase: string) => {
    if (get(storyStore).publication?.identifiersLocked) return;
    pushHistorySnapshot("story-identifiers");
    storyStoreWrapper.setStoryIdentifiers({ id, annotationBase });
  };

  const updateStoryAspect = (aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    pushHistorySnapshot("story-aspect");
    storyStoreWrapper.setStoryPresentationAspect(aspect);
    viewer?.setStoryPresentationAspect?.(aspect);
  };

  const openSourcesModal = () => {
    stopMotionPreview();
    sourcesModalOpen.set(true);
  };

  const closeSourcesModal = () => {
    sourcesModalOpen.set(false);
  };

  const selectSourceCanvas = (
    manifest: string,
    canvasIndex: number,
    mode: "add" | "replace",
  ) => {
    const trimmed = manifest.trim();
    if (!trimmed || !viewer) return;
    sourcesModalOpen.set(false);
    const safeIndex = Math.max(0, Math.floor(canvasIndex));

    if (mode === "replace" && get(selectedChapterId)) {
      const currentChapterId = get(selectedChapterId);
      if (currentChapterId) {
        updateManifest(trimmed);
      }
      viewer.setManifest(trimmed);
      viewer.setCanvasByIndex(safeIndex);
      lastManifest = trimmed;
      currentManifest.set(trimmed);
      scheduleSourceRetargetCapture(true);
      return;
    }

    if (pendingAddChapter) return;
    loadManifest(trimmed);
    viewer.setCanvasByIndex(safeIndex);
    pendingAddChapter = true;
    pushHistorySnapshot();
    const attemptCapture = (remainingAttempts: number) => {
      if (viewer?.getCanvasIndex?.() !== safeIndex) {
        viewer?.setCanvasByIndex?.(safeIndex);
      }
      const result = capture();
      if (
        (result.ok &&
          result.capture.manifest === trimmed &&
          result.capture.canvasIndex === safeIndex) ||
        remainingAttempts <= 0
      ) {
        pendingAddChapter = false;
        handleCaptureResult(result);
        return;
      }
      setTimeout(() => attemptCapture(remainingAttempts - 1), 100);
    };
    setTimeout(() => attemptCapture(40), 120);
  };

  /** The aspect every frame on the stage is held to. */
  const frameAspect = (): number => presentationAspectFor();

  const {
    clearMotionTrack,
    addMotionPoint,
    setMotionPointViewBox,
    setMotionPointFocus,
    selectMotionPoint,
    updateMotionPointFromViewport,
    moveMotionPointTime,
    reorderMotionPoint,
    evenSpaceMotionPoints,
    scrubMotionTo,
    deleteMotionPoint,
    updateMotionDuration,
    updateMotionPathType,
    updateMotionInitialDwell,
    updateMotionEasing,
    goToMotionPoint,
    applyMotionPreset,
    stopMotionPreview,
    previewMotion,
    startMotionTrackPlayback,
  } = createMotionController({
    language,
    storyStore,
    selectedChapterId,
    selectedMotionPointId,
    motionPreviewing,
    getViewer: () => viewer,
    frameAspect,
    currentViewFrame,
    pushHistorySnapshot,
    setChapterCameraTrack: (payload) =>
      storyStoreWrapper.setChapterCameraTrack(payload),
    getNarrationSegment,
    playNarrationSegment: (segment) => {
      void narrationPlayer.playSegment(segment);
    },
    stopNarration: () => narrationPlayer.stop(),
    cancelActiveAnimations: () => {
      pendingApplyToken += 1;
      if (cancelAnimation) {
        cancelAnimation();
        cancelAnimation = null;
      }
    },
  });

  const updateChapterTitle = (lang: string, value: string) => {
    pushHistorySnapshot(chapterFieldKey("title", lang));
    chapterActions.updateChapterTitle(lang, value);
  };

  const updateChapterDescription = (lang: string, value: string) => {
    pushHistorySnapshot(chapterFieldKey("description", lang));
    chapterActions.updateChapterDescription(lang, value);
  };

  const assignNarrationSegment = (lang: string, start: number, end: number) => {
    pushHistorySnapshot();
    chapterActions.assignNarrationSegment(lang, start, end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      latestNarrationSegments = {
        ...latestNarrationSegments,
        [lang]: { start, end },
      };
    }
  };

  const skipNarration = (lang: string) => {
    pushHistorySnapshot();
    chapterActions.skipNarration(lang);
  };

  const updateAnnotationText = (lang: string, text: string) => {
    pushHistorySnapshot();
    chapterActions.updateAnnotationText(lang, text);
  };

  const updateAnnotationPlacement = (
    lang: string,
    placement: AnnotationPlacement,
  ) => {
    pushHistorySnapshot();
    chapterActions.updateAnnotationPlacement(lang, placement);
  };

  const updateAdvanceMode = (mode: ChapterAdvance["mode"]) => {
    pushHistorySnapshot(chapterFieldKey("transition"));
    chapterActions.updateAdvanceMode(mode);
  };

  const updateDelay = (delayMs?: number) => {
    pushHistorySnapshot(chapterFieldKey("transition"));
    chapterActions.updateDelay(delayMs);
    if (Number.isFinite(delayMs) && (delayMs as number) >= 0) {
      transitionDelayDefault.set(delayMs as number);
    }
  };

  const startAnnotationPositioning = (lang: string) => {
    uiMode.set("annotationPositioning");
    positioningLanguage.set(lang);
  };

  const confirmAnnotationPositioning = () => {
    uiMode.set("chapterEdit");
    positioningLanguage.set(null);
  };

  const cancelAnnotationPositioning = () => {
    uiMode.set("chapterEdit");
    positioningLanguage.set(null);
  };

  const updateManifest = (manifest: string) => {
    pushHistorySnapshot(chapterFieldKey("manifest"));
    chapterActions.updateManifest(manifest);
  };

  const updateLayerOpacity = (id: string, opacity: number) => {
    const chapterId = get(selectedChapterId);
    if (!chapterId) return;
    const normalizedOpacity = Math.max(0, Math.min(1, opacity));
    const nextLayerOpacities = {
      ...get(layerOpacitiesStore),
      [id]: normalizedOpacity,
    };
    viewer?.updateLayerOpacity?.(id, normalizedOpacity);
    layerOpacitiesStore.set(nextLayerOpacities);
    storyStoreWrapper.setLayerOpacities({
      chapterId,
      layerOpacities: nextLayerOpacities,
    });
  };

  const reloadManifest = (manifest: string, canvasIndex: number) => {
    if (!viewer) {
      setError(translate('storyBuilder.errors.viewerNotReady'));
      return;
    }
    if (!manifest.trim()) {
      setError(translate('storyBuilder.errors.manifestRequired'));
      return;
    }
    viewer.setManifest(manifest);
    viewer.setCanvasByIndex(canvasIndex);
  };

  const selectCanvas = (canvasIndex: number) => {
    if (!viewer) return;
    const count = viewer.getCanvasCount?.() ?? 0;
    if (
      !Number.isInteger(canvasIndex) ||
      canvasIndex < 0 ||
      (count > 0 && canvasIndex >= count)
    ) {
      return;
    }
    viewerCanvasIndex.set(canvasIndex);
    viewer.setCanvasByIndex(canvasIndex);
    // Canvas navigation settles asynchronously in the real viewer. Capturing
    // on the next settled turn avoids pairing the new canvas with the old
    // canvas's viewport while still removing the need for a second Save action.
    scheduleSourceRetargetCapture();
  };

  const loadManifest = (manifest: string) => {
    if (!viewer) {
      setError(translate('storyBuilder.errors.viewerNotReady'));
      return;
    }
    const trimmed = manifest.trim();
    if (!trimmed) {
      setError(translate('storyBuilder.errors.manifestRequired'));
      return;
    }
    viewer.setManifest(trimmed);
    lastManifest = trimmed;
    currentManifest.set(trimmed);
    setError(null);
  };

  /**
   * First-source onboarding is a single action. Loading a Manifest is async,
   * so retry capture briefly until the viewer has resolved its active canvas
   * rather than asking the author to confirm that canvas in a second form.
   */
  const loadManifestAndAddChapter = (manifest: string) => {
    if (pendingAddChapter) return;
    loadManifest(manifest);
    if (!viewer || !manifest.trim()) return;

    pendingAddChapter = true;
    pushHistorySnapshot();
    const attemptCapture = (remainingAttempts: number) => {
      const result = capture();
      if (result.ok || remainingAttempts <= 0) {
        pendingAddChapter = false;
        handleCaptureResult(result);
        return;
      }
      setTimeout(() => attemptCapture(remainingAttempts - 1), 100);
    };
    setTimeout(() => attemptCapture(40), 0);
  };

  const saveChapterSettings = () => {
    setError(null);
    if (get(activeChapterTask) === "focus") {
      commitAnnotationTransaction();
      return;
    }
    if (get(activeChapterTask) === "source") {
      captureSourceRetarget();
    }
    activeChapterTask.set(null);
    uiMode.set(get(selectedChapterId) ? "chapterEdit" : "idle");
  };

  const cancelChapterSettings = () => {
    if (cancelAnnotationTransaction()) return;
    activeChapterTask.set(null);
    uiMode.set(get(selectedChapterId) ? "chapterEdit" : "idle");
  };

  const saveExport = () => {
    const storyValue = storyStoreWrapper.exportStory();
    const validation = validateStoryForExport(storyValue);
    if (!validation.ok) {
      setError(null);
      validationErrors.set(validation.errors);
    } else {
      setError(null);
      validationErrors.set([]);
    }
    return validation;
  };

  const exportStory = () => {
    const validation = saveExport();
    if (!validation.ok) return validation;
    saveModalPayload.set(buildExportEnvelope(storyStoreWrapper.exportStory()));
    saveModalOpen.set(true);
    return validation;
  };

  const getStory = (): StoryState =>
    cloneStoryValue(storyStoreWrapper.exportStory());

  const getExportPayload = (): ExportEnvelope =>
    buildExportEnvelope(storyStoreWrapper.exportStory());

  const loadStory = (storyToLoad: StoryState) => {
    // Bring framings to the story's canonical aspect on the way in, so
    // everything captured from here on agrees and the next save writes them
    // back normalised.
    const normalizedStory = normalizeStoryAnnotations(
      normaliseStoryFraming(storyToLoad),
    );
    pushHistorySnapshot();
    loadStoryIntoStore(normalizedStory, storyStoreWrapper);
    latestNarrationSegments = collectLatestNarrationSegments(
      storyStoreWrapper.exportStory(),
    );
    transitionDelayDefault.set(
      collectLatestTransitionDelay(storyStoreWrapper.exportStory()),
    );

    // Load the first chapter's manifest if available
    const firstChapter = normalizedStory.chapters?.[0];
    if (firstChapter?.manifest && viewer) {
      viewer.setManifest?.(firstChapter.manifest);
      if (typeof firstChapter.canvasIndex === "number") {
        viewer.setCanvasByIndex?.(firstChapter.canvasIndex);
      }
    }

    // Auto-select the first chapter so the editor shows content on load
    autoSelectFirstChapterIfNeeded();
    history.reset(storyStoreWrapper.exportStory());
    historyRun = null;
    canUndo.set(false);
    canRedo.set(false);
    dirty.set(false);
  };

  /** Where a key belongs to the field or control that has focus, not the builder. */
  const handleShortcut = createShortcutHandler({
    storyStore,
    selectedChapterId,
    activeChapterTask,
    selectedDrawingAnnotationId,
    selectedMotionPointId,
    isPreviewing,
    saveModalOpen,
    motionPreviewing,
    canUndo,
    canRedo,
    undo,
    redo,
    previewMotion,
    stopMotionPreview,
    deleteChapterDrawingAnnotation,
    deleteMotionPoint,
  });

  const controller: StoryBuilderController = {
    story: storyStore,
    currentManifest,
    viewerCanvasIndex,
    viewerCanvasCount,
    selectedChapterId,
    activeChapterTask,
    selectedDrawingAnnotationId,
    chapterAnnotationTool,
    uiMode,
    drawerOpen,
    viewBox,
    mediaType,
    mediaMarks: mediaMarksState,
    transitionDelayDefault,
    avMarksValid,
    error,
    validationErrors,
    language,
    languages,
    saveState,
    saveConfigured,
    dirty,
    canUndo,
    canRedo,
    saveModalOpen,
    saveModalPayload,
    closeSaveModal,
    sourcesModalOpen,
    openSourcesModal,
    closeSourcesModal,
    selectSourceCanvas,
    mediaSources: mediaSourcesStore,
    layerOpacities: layerOpacitiesStore,
    updateLayerOpacity,
    attach,
    addChapter,
    updateChapter,
    setChapterPosition,
    setChapterPositionFromView,
    resetViewToSaved,
    clearMotionTrack,
    deleteChapter,
    duplicateChapter,
    reorderChapter,
    selectChapter,
    openNarration,
    backFromNarration,
    closeNarration,
    openChapter,
    closeChapter,
    loadManifestAndAddChapter,
    markIn,
    markOut,
    setMediaMarks,
    assignMediaSegment,
    previewMediaSegment,
    stopPreviewMediaSegment,
    setNarrationTrack,
    updateStoryTitle,
    updateStoryIdentifiers,
    updateStoryAspect,
    addMotionPoint,
    setMotionPointViewBox,
    setMotionPointFocus,
    moveMotionPointTime,
    reorderMotionPoint,
    evenSpaceMotionPoints,
    scrubMotionTo,
    selectMotionPoint,
    updateMotionPointFromViewport,
    selectedMotionPointId,
    deleteMotionPoint,
    updateMotionDuration,
    updateMotionPathType,
    updateMotionInitialDwell,
    updateMotionEasing,
    goToMotionPoint,
    applyMotionPreset,
    motionPreviewing,
    previewMotion,
    stopMotionPreview,
    updateChapterTitle,
    updateChapterDescription,
    assignNarrationSegment,
    skipNarration,
    updateAnnotationText,
    updateAnnotationPlacement,
    updateAdvanceMode,
    updateDelay,
    updateManifest,
    reloadManifest,
    selectCanvas,
    loadManifest,
    saveChapterSettings,
    cancelChapterSettings,
    applyChapterSource: captureSourceRetarget,
    saveExport,
    exportStory,
    getStory,
    getExportPayload,
    saveStory,
    undo,
    redo,
    handleShortcut,
    setSaveConfig,
    setAnnotationLanguage,
    setChapterAnnotationTool,
    deleteChapterDrawingAnnotation,
    deleteChapterTextAnnotation,
    editChapterDrawingAnnotation,
    finishChapterDrawingAnnotationEdit,
    editChapterTextAnnotation,
    setChapterDrawingAnnotationLabel,
    setChapterDrawingAnnotationStyle,
    annotationLanguage,
    modelPoseDebug,
    loadStory,
    isPreviewing,
    stageFade,
    startPreview,
    stopPreview,
    previewChapter,
    positioningLanguage: { subscribe: positioningLanguage.subscribe },
    startAnnotationPositioning,
    confirmAnnotationPositioning,
    cancelAnnotationPositioning,
  };
  options.onControllerReady?.(controller);
  return controller;
};
