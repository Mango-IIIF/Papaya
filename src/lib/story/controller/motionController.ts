import { get, type Readable, type Writable } from "svelte/store";
import type { ViewBox } from "@mango-iiif/iiif-viewer/core";
import { fitViewBoxToContent, normaliseViewBox } from "../framing";
import {
  animatableCameraDurationMs,
  configureCameraTrackPreset,
  evenSpaceCameraTrack,
  insertCameraKeyframeAtTime,
  moveCameraKeyframeTime,
  reorderCameraKeyframes,
  retimeCameraKeyframes,
  sampleCameraTrack,
} from "../cameraTrack";
import type {
  Chapter,
  ChapterCameraTrack,
  StoryPluginContext,
  StoryState,
} from "../../core/types/story";

const motionPointId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `camera-point-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const centreOf = (box: ViewBox): { x: number; y: number } => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});

export const createMotionController = (deps: {
  language: string;
  storyStore: Readable<StoryState>;
  selectedChapterId: Readable<string | null>;
  selectedMotionPointId: Writable<string | null>;
  motionPreviewing: Writable<boolean>;
  getViewer: () => StoryPluginContext["viewer"] | null;
  frameAspect: () => number;
  currentViewFrame: () => ViewBox | null;
  pushHistorySnapshot: (coalesceKey?: string) => void;
  setChapterCameraTrack: (payload: {
    chapterId: string;
    cameraTrack: Chapter["cameraTrack"] | undefined;
  }) => void;
  getNarrationSegment: (
    chapter: Chapter,
  ) => { src: string; start: number; end: number } | null;
  playNarrationSegment: (segment: {
    src: string;
    start: number;
    end: number;
  }) => void;
  stopNarration: () => void;
  cancelActiveAnimations: () => void;
}) => {
  let motionPreviewFrame: number | null = null;
  let motionPreviewOwnsAudio = false;

  const updateCameraTrack = (
    transform: (chapter: Chapter) => Chapter["cameraTrack"] | undefined,
  ) => {
    const chapterId = get(deps.selectedChapterId);
    const chapter = get(deps.storyStore).chapters.find(
      (item) => item.id === chapterId,
    );
    if (!chapterId || !chapter) return;
    deps.pushHistorySnapshot();
    deps.setChapterCameraTrack({
      chapterId,
      cameraTrack: transform(chapter),
    });
  };

  /** A keyframe box as it is stored: at the lock, and inside the canvas. */
  const settleKeyframeBox = (box: ViewBox): ViewBox => {
    const normalised = normaliseViewBox(box, deps.frameAspect());
    const contentSize = deps.getViewer()?.getContentSize?.() ?? null;
    return contentSize
      ? fitViewBoxToContent(normalised, contentSize)
      : normalised;
  };

  const clearMotionTrack = () => {
    stopMotionPreview();
    deps.selectedMotionPointId.set(null);
    updateCameraTrack(() => undefined);
  };

  const addMotionPoint = (atTimeMs?: number) => {
    const created: { id: string | null } = { id: null };
    const viewer = deps.getViewer();
    updateCameraTrack((chapter) => {
      const narrationSeg =
        chapter.narrationSegment?.[deps.language] ??
        Object.values(chapter.narrationSegment ?? {})[0];
      const narrationDurationMs =
        narrationSeg && narrationSeg.end > narrationSeg.start
          ? Math.round((narrationSeg.end - narrationSeg.start) * 1000)
          : 0;
      const defaultDurationMs = Math.max(
        1,
        chapter.cameraTrack?.durationMs ??
          chapter.presentationDurationMs ??
          5000,
      );
      const durationMs =
        typeof atTimeMs === "number" && Number.isFinite(atTimeMs)
          ? Math.max(defaultDurationMs, narrationDurationMs, Math.round(atTimeMs))
          : defaultDurationMs;
      const existing = chapter.cameraTrack?.keyframes ?? [];
      const activePreset = chapter.cameraTrack?.preset ?? "custom";
      const pointViewBox = deps.currentViewFrame() ?? chapter.viewBox ?? undefined;
      const model = viewer?.getModelPose?.() ?? chapter.model;
      const capturedLayers =
        viewer?.getLayerOpacities?.() ?? chapter.layerOpacities;
      if (!pointViewBox && !model) return chapter.cameraTrack;
      const point = {
        id: motionPointId(),
        timeMs: 0,
        ...(pointViewBox
          ? { focus: centreOf(pointViewBox), viewBox: pointViewBox }
          : {}),
        ...(model ? { model } : {}),
        ...(capturedLayers ? { layerOpacities: capturedLayers } : {}),
      };
      created.id = point.id;

      const baseTrack: NonNullable<Chapter["cameraTrack"]> = {
        ...chapter.cameraTrack,
        durationMs,
        preset: activePreset,
        easing: chapter.cameraTrack?.easing ?? "ease-in-out",
        keyframes: existing,
      };

      if (
        typeof atTimeMs === "number" &&
        Number.isFinite(atTimeMs) &&
        (existing.length > 0 || atTimeMs > 0)
      ) {
        const nextTrack = insertCameraKeyframeAtTime(baseTrack, point, atTimeMs);
        return activePreset !== "custom" && chapter.viewBox
          ? configureCameraTrackPreset(
              nextTrack,
              activePreset,
              chapter.viewBox,
              nextTrack.durationMs,
              { preservePoints: true },
            )
          : nextTrack;
      }

      if (chapter.cameraTrack?.timingMode === "custom" && existing.length > 0) {
        return insertCameraKeyframeAtTime(baseTrack, point, durationMs);
      }

      const nextTrack: NonNullable<Chapter["cameraTrack"]> = {
        ...baseTrack,
        keyframes: retimeCameraKeyframes([...existing, point], durationMs),
      };
      return activePreset !== "custom" && chapter.viewBox
        ? configureCameraTrackPreset(
            nextTrack,
            activePreset,
            chapter.viewBox,
            durationMs,
            { preservePoints: true },
          )
        : nextTrack;
    });
    if (created.id) deps.selectedMotionPointId.set(created.id);
  };

  const setMotionPointViewBox = (keyframeId: string, nextViewBox: ViewBox) => {
    if (
      ![nextViewBox.x, nextViewBox.y, nextViewBox.w, nextViewBox.h].every(
        Number.isFinite,
      ) ||
      nextViewBox.w <= 0 ||
      nextViewBox.h <= 0
    ) {
      return;
    }
    updateCameraTrack((chapter) => {
      const track = chapter.cameraTrack;
      const existing = track?.keyframes ?? [];
      const point = existing.find((entry) => entry.id === keyframeId);
      if (!track || !point) return track;
      const viewBox = settleKeyframeBox(nextViewBox);
      const tolerance = Math.max(1, viewBox.w * 0.005);
      const resized =
        !point.viewBox ||
        Math.abs(point.viewBox.w - viewBox.w) > tolerance ||
        Math.abs(point.viewBox.h - viewBox.h) > tolerance;
      const activePreset = track.preset ?? "custom";
      const preset =
        resized && activePreset !== "custom" ? "custom" : activePreset;
      const keyframes = existing.map((entry) =>
        entry.id === keyframeId
          ? { ...entry, focus: centreOf(viewBox), viewBox }
          : entry,
      );
      const nextTrack: NonNullable<Chapter["cameraTrack"]> = {
        ...track,
        preset,
        keyframes:
          track.timingMode === "custom"
            ? keyframes
            : retimeCameraKeyframes(keyframes, track.durationMs),
      };
      return preset !== "custom" && chapter.viewBox
        ? configureCameraTrackPreset(
            nextTrack,
            preset,
            chapter.viewBox,
            track.durationMs,
            { preservePoints: true },
          )
        : nextTrack;
    });
  };

  const setMotionPointFocus = (
    keyframeId: string,
    focus: { x: number; y: number },
  ) => {
    if (![focus.x, focus.y].every(Number.isFinite)) return;
    deps.selectedMotionPointId.set(keyframeId);
    const contentSize = deps.getViewer()?.getContentSize?.() ?? null;
    const nextFocus = contentSize
      ? {
          x: Math.min(contentSize.width, Math.max(0, focus.x)),
          y: Math.min(contentSize.height, Math.max(0, focus.y)),
        }
      : focus;

    updateCameraTrack((chapter) => {
      const track = chapter.cameraTrack;
      if (!track) return track;
      const keyframes = track.keyframes.map((entry) =>
        entry.id === keyframeId
          ? {
              ...entry,
              focus: nextFocus,
              ...(entry.viewBox
                ? {
                    viewBox: {
                      x: nextFocus.x - entry.viewBox.w / 2,
                      y: nextFocus.y - entry.viewBox.h / 2,
                      w: entry.viewBox.w,
                      h: entry.viewBox.h,
                    },
                  }
                : {}),
            }
          : entry,
      );
      if (!keyframes.some((entry) => entry.id === keyframeId)) return track;
      const nextTrack: NonNullable<Chapter["cameraTrack"]> = {
        ...track,
        keyframes: retimeCameraKeyframes(keyframes, track.durationMs),
      };
      return (track.preset ?? "custom") !== "custom" && chapter.viewBox
        ? configureCameraTrackPreset(
            nextTrack,
            track.preset ?? "custom",
            chapter.viewBox,
            track.durationMs,
            { preservePoints: true },
          )
        : nextTrack;
    });
  };

  const selectMotionPoint = (keyframeId: string | null) => {
    if (keyframeId === null) {
      deps.selectedMotionPointId.set(null);
      return;
    }
    const chapterId = get(deps.selectedChapterId);
    const exists = get(deps.storyStore)
      .chapters.find((chapter) => chapter.id === chapterId)
      ?.cameraTrack?.keyframes.some((entry) => entry.id === keyframeId);
    if (exists) deps.selectedMotionPointId.set(keyframeId);
  };

  const updateMotionPointFromViewport = (keyframeId: string) => {
    const viewFrame = deps.currentViewFrame();
    if (!viewFrame) return;
    deps.selectedMotionPointId.set(keyframeId);
    updateCameraTrack((chapter) => {
      const track = chapter.cameraTrack;
      const point = track?.keyframes.find((entry) => entry.id === keyframeId);
      if (!track || !point) return track;
      const updatedKeyframes = track.keyframes.map((entry) =>
        entry.id === keyframeId
          ? { ...entry, focus: centreOf(viewFrame), viewBox: viewFrame }
          : entry,
      );
      return {
        ...track,
        preset: "custom",
        keyframes:
          track.timingMode === "custom"
            ? updatedKeyframes
            : retimeCameraKeyframes(updatedKeyframes, track.durationMs),
      };
    });
  };

  const moveMotionPointTime = (
    keyframeId: string,
    timeMs: number,
    maxDurationMs?: number,
  ) => {
    const chapterId = get(deps.selectedChapterId);
    const chapter = get(deps.storyStore).chapters.find(
      (item) => item.id === chapterId,
    );
    if (!chapterId || !chapter?.cameraTrack) return;
    deps.pushHistorySnapshot(`motion-time::${chapterId}::${keyframeId}`);
    deps.setChapterCameraTrack({
      chapterId,
      cameraTrack: moveCameraKeyframeTime(
        chapter.cameraTrack,
        keyframeId,
        timeMs,
        maxDurationMs,
      ),
    });
  };

  const reorderMotionPoint = (keyframeId: string, direction: -1 | 1) => {
    updateCameraTrack((chapter) => {
      if (!chapter.cameraTrack) return chapter.cameraTrack;
      return reorderCameraKeyframes(chapter.cameraTrack, keyframeId, direction);
    });
  };

  const evenSpaceMotionPoints = () => {
    updateCameraTrack((chapter) => {
      if (!chapter.cameraTrack) return chapter.cameraTrack;
      return evenSpaceCameraTrack(chapter.cameraTrack);
    });
  };

  const scrubMotionTo = (timeMs: number) => {
    stopMotionPreview();
    const viewer = deps.getViewer();
    const chapterId = get(deps.selectedChapterId);
    const chapter = get(deps.storyStore).chapters.find(
      (item) => item.id === chapterId,
    );
    if (
      !chapter?.cameraTrack ||
      chapter.cameraTrack.keyframes.length < 2 ||
      !viewer
    ) {
      return;
    }
    const sample = sampleCameraTrack(chapter.cameraTrack, timeMs);
    if (sample?.viewBox) viewer.setViewBox?.(sample.viewBox);
    if (sample?.model) viewer.setModelPose?.(sample.model);
    for (const [id, opacity] of Object.entries(sample?.layerOpacities ?? {})) {
      viewer.updateLayerOpacity?.(id, opacity);
    }
  };

  const deleteMotionPoint = (keyframeId: string) => {
    if (get(deps.selectedMotionPointId) === keyframeId) {
      deps.selectedMotionPointId.set(null);
    }
    updateCameraTrack((chapter) => {
      if (!chapter.cameraTrack) return undefined;
      const keyframes = chapter.cameraTrack.keyframes.filter(
        (point) => point.id !== keyframeId,
      );
      return {
        ...chapter.cameraTrack,
        preset: "custom",
        keyframes:
          chapter.cameraTrack.timingMode === "custom"
            ? keyframes
            : retimeCameraKeyframes(keyframes, chapter.cameraTrack.durationMs),
      };
    });
  };

  const updateMotionDuration = (durationMs: number) => {
    updateCameraTrack((chapter) => {
      const safeDuration = Math.max(
        1,
        Number.isFinite(durationMs) ? durationMs : 5000,
      );
      const track = chapter.cameraTrack;
      if (track?.timingMode === "custom" && track.keyframes.length > 0) {
        const previousDuration = Math.max(
          1,
          animatableCameraDurationMs(track) || track.durationMs || 1,
        );
        const scale = safeDuration / previousDuration;
        return {
          ...track,
          durationMs: safeDuration,
          preset: track.preset ?? "custom",
          easing: track.easing ?? "ease-in-out",
          keyframes: track.keyframes.map((point) => ({
            ...point,
            timeMs: Math.max(
              0,
              Math.min(safeDuration, Math.round(point.timeMs * scale)),
            ),
          })),
        };
      }
      return {
        ...track,
        durationMs: safeDuration,
        preset: track?.preset ?? "custom",
        easing: track?.easing ?? "ease-in-out",
        keyframes: retimeCameraKeyframes(track?.keyframes ?? [], safeDuration),
      };
    });
  };

  const updateMotionPathType = (pathType: "linear" | "spline") => {
    updateCameraTrack((chapter) => {
      const currentView = chapter.viewBox;
      const track =
        chapter.cameraTrack ??
        (currentView
          ? {
              durationMs: 5000,
              preset: "custom" as const,
              pathType: "linear" as const,
              easing: "ease-in-out" as const,
              keyframes: [],
            }
          : undefined);
      if (!track) return undefined;
      return { ...track, pathType };
    });
  };

  const updateMotionInitialDwell = (dwellMs: number) => {
    updateCameraTrack((chapter) => {
      const currentView = chapter.viewBox;
      const track =
        chapter.cameraTrack ??
        (currentView
          ? {
              durationMs: 5000,
              preset: "custom" as const,
              pathType: "linear" as const,
              easing: "ease-in-out" as const,
              keyframes: [],
            }
          : undefined);
      if (!track || !track.keyframes.length) return track;
      const keyframes = track.keyframes.map((point, index) => {
        if (index !== 0) return point;
        const { dwellMs: _, ...rest } = point;
        return dwellMs > 0 ? { ...point, dwellMs } : rest;
      });
      return {
        ...track,
        keyframes: retimeCameraKeyframes(keyframes, track.durationMs),
      };
    });
  };

  const updateMotionEasing = (
    easing: NonNullable<ChapterCameraTrack["easing"]>,
  ) => {
    updateCameraTrack((chapter) => {
      if (!chapter.cameraTrack) return undefined;
      return { ...chapter.cameraTrack, easing };
    });
  };

  const goToMotionPoint = (keyframeId: string) => {
    stopMotionPreview();
    const chapterId = get(deps.selectedChapterId);
    const point = get(deps.storyStore)
      .chapters.find((chapter) => chapter.id === chapterId)
      ?.cameraTrack?.keyframes.find((entry) => entry.id === keyframeId);
    if (!point) return;
    deps.selectedMotionPointId.set(keyframeId);
    const viewer = deps.getViewer();
    if (!viewer) return;
    if (point.viewBox) viewer.setViewBox?.(point.viewBox);
    if (point.model) viewer.setModelPose?.(point.model);
    for (const [id, opacity] of Object.entries(point.layerOpacities ?? {})) {
      viewer.updateLayerOpacity?.(id, opacity);
    }
  };

  const applyMotionPreset = (
    preset: NonNullable<Chapter["cameraTrack"]>["preset"],
  ) => {
    if (!preset) return;
    updateCameraTrack((chapter) => {
      const currentView = chapter.viewBox;
      if (!currentView) return chapter.cameraTrack;
      const duration =
        chapter.cameraTrack?.durationMs ??
        chapter.presentationDurationMs ??
        5000;
      return configureCameraTrackPreset(
        chapter.cameraTrack,
        preset,
        currentView,
        duration,
      );
    });
  };

  const stopMotionPreview = () => {
    if (
      motionPreviewFrame !== null &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(motionPreviewFrame);
    }
    motionPreviewFrame = null;
    if (motionPreviewOwnsAudio) {
      motionPreviewOwnsAudio = false;
      deps.stopNarration();
    }
    deps.motionPreviewing.set(false);
  };

  const startMotionTrackPlayback = (
    chapter: Chapter,
    options?: { startMs?: number; withAudio?: boolean },
  ) => {
    const viewer = deps.getViewer();
    if (
      !chapter.cameraTrack ||
      chapter.cameraTrack.keyframes.length < 2 ||
      !viewer
    ) {
      return;
    }
    stopMotionPreview();
    deps.cancelActiveAnimations();
    const track = chapter.cameraTrack;
    const playbackDurationMs = animatableCameraDurationMs(track);
    const startMs = Math.max(
      0,
      Math.min(
        playbackDurationMs,
        Number.isFinite(options?.startMs) ? (options?.startMs ?? 0) : 0,
      ),
    );
    const reduceMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const applySample = (elapsedMs: number) => {
      const activeViewer = deps.getViewer();
      const sample = sampleCameraTrack(track, elapsedMs);
      if (sample?.viewBox) activeViewer?.setViewBox?.(sample.viewBox);
      if (sample?.model) activeViewer?.setModelPose?.(sample.model);
      for (const [id, opacity] of Object.entries(sample?.layerOpacities ?? {})) {
        activeViewer?.updateLayerOpacity?.(id, opacity);
      }
    };
    if (reduceMotion || typeof requestAnimationFrame !== "function") {
      applySample(playbackDurationMs);
      return;
    }

    if (options?.withAudio) {
      const narration = deps.getNarrationSegment(chapter);
      if (narration) {
        const audioStart = narration.start + startMs / 1000;
        if (audioStart < narration.end) {
          motionPreviewOwnsAudio = true;
          deps.playNarrationSegment({
            src: narration.src,
            start: audioStart,
            end: narration.end,
          });
        }
      }
    }

    applySample(startMs);
    deps.motionPreviewing.set(true);
    const startedAt = performance.now() - startMs;
    const frame = (time: number) => {
      const elapsed = Math.min(playbackDurationMs, time - startedAt);
      applySample(elapsed);
      if (elapsed < playbackDurationMs) {
        motionPreviewFrame = requestAnimationFrame(frame);
      } else {
        motionPreviewFrame = null;
        if (motionPreviewOwnsAudio) {
          motionPreviewOwnsAudio = false;
          deps.stopNarration();
        }
        deps.motionPreviewing.set(false);
      }
    };
    motionPreviewFrame = requestAnimationFrame(frame);
  };

  const previewMotion = (options?: { startMs?: number; withAudio?: boolean }) => {
    const chapterId = get(deps.selectedChapterId);
    const chapter = get(deps.storyStore).chapters.find(
      (item) => item.id === chapterId,
    );
    if (!chapter) return;
    startMotionTrackPlayback(chapter, {
      startMs: options?.startMs,
      withAudio: options?.withAudio ?? true,
    });
  };

  return {
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
  };
};
