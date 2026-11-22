import { derived, type Readable } from "svelte/store";
import type { MediaType } from "@mango-iiif/iiif-viewer/core";
import type {
  ChapterTaskId,
  StoryFrame,
  StoryPluginContext,
  StoryState,
} from "../../core/types/story";
import type { UIMode } from "./types";

export const CHAPTER_FRAME_ID = "chapter";
export const KEYFRAME_FRAME_PREFIX = "keyframe:";

export const keyframeIdFromFrame = (frameId: string): string | null =>
  frameId.startsWith(KEYFRAME_FRAME_PREFIX)
    ? frameId.slice(KEYFRAME_FRAME_PREFIX.length)
    : null;

export type StageFramesPayload = {
  frames: StoryFrame[];
  selection: string | null;
};

export const createStageFramesSync = (deps: {
  storyStore: Readable<StoryState>;
  selectedChapterId: Readable<string | null>;
  activeChapterTask: Readable<ChapterTaskId | null>;
  isPreviewing: Readable<boolean>;
  uiMode: Readable<UIMode>;
  mediaType: Readable<MediaType | null>;
  selectedMotionPointId: Readable<string | null>;
  motionPreviewing: Readable<boolean>;
  frameAspect: () => number;
  getViewer: () => StoryPluginContext["viewer"] | null;
}) => {
  const stageFrames = derived(
    [
      deps.storyStore,
      deps.selectedChapterId,
      deps.activeChapterTask,
      deps.isPreviewing,
      deps.uiMode,
      deps.mediaType,
      deps.selectedMotionPointId,
      deps.motionPreviewing,
    ],
    ([
      $story,
      $chapterId,
      $task,
      $previewing,
      $mode,
      $mediaType,
      $motionPoint,
      $motionPreviewing,
    ]): StageFramesPayload => {
      const none: StageFramesPayload = { frames: [], selection: null };
      const chapter = $story.chapters.find((entry) => entry.id === $chapterId);
      if (
        !chapter?.viewBox ||
        $previewing ||
        $motionPreviewing ||
        $mode === "annotationPositioning" ||
        $mode === "narrationPanel"
      ) {
        return none;
      }
      if (
        $mediaType === "audio" ||
        $mediaType === "video" ||
        $mediaType === "model" ||
        chapter.model
      ) {
        return none;
      }
      // Drawing has the pointer; the frames step back to guides while it does.
      const drawing = $task === "focus";
      const aspect = deps.frameAspect();
      const selectedKeyframe = drawing
        ? null
        : ((chapter.cameraTrack?.keyframes ?? []).find(
            (point) => point.viewBox && point.id === $motionPoint,
          ) ?? null);
      const frames: StoryFrame[] = [
        {
          id: CHAPTER_FRAME_ID,
          kind: "chapter",
          viewBox: chapter.viewBox,
          aspect,
          editable: !drawing && !selectedKeyframe,
        },
      ];
      (drawing ? [] : (chapter.cameraTrack?.keyframes ?? [])).forEach(
        (point, index) => {
          if (!point.viewBox) return;
          frames.push({
            id: `${KEYFRAME_FRAME_PREFIX}${point.id}`,
            kind: "keyframe",
            viewBox: point.viewBox,
            aspect,
            label: String(index + 1),
            editable: point.id === selectedKeyframe?.id,
          });
        },
      );
      const selection = drawing
        ? null
        : selectedKeyframe
          ? `${KEYFRAME_FRAME_PREFIX}${selectedKeyframe.id}`
          : CHAPTER_FRAME_ID;
      return { frames, selection };
    },
  );

  let lastPushedFrames = "";

  const pushStageFrames = ({ frames, selection }: StageFramesPayload) => {
    const viewer = deps.getViewer();
    if (!viewer) return;
    viewer.setStoryPresentationAspect?.(deps.frameAspect());
    const key = JSON.stringify({ frames, selection });
    if (key === lastPushedFrames) return;
    lastPushedFrames = key;
    viewer.setStoryFrames?.(frames);
    viewer.setStoryFrameSelection?.(selection);
  };

  const resetLastPushed = () => {
    lastPushedFrames = "";
  };

  return {
    stageFrames,
    pushStageFrames,
    resetLastPushed,
  };
};
