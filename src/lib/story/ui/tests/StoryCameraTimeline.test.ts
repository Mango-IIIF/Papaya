import { mount, tick, unmount } from "svelte";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import type { StoryState } from "../../../core/types/story";
import StoryCameraTimeline from "../StoryCameraTimeline.svelte";

const chapter = (
  keyframeCount: number,
  extra: Partial<StoryState["chapters"][number]> = {},
): StoryState["chapters"][number] => ({
  id: "chapter-1",
  manifest: "https://example.org/manifest",
  canvasIndex: 0,
  viewBox: { x: 0, y: 0, w: 1000, h: 500 },
  ...(keyframeCount > 0
    ? {
        cameraTrack: {
          durationMs: 4000,
          keyframes: Array.from({ length: keyframeCount }, (_, index) => ({
            id: `point-${index + 1}`,
            timeMs: keyframeCount > 1 ? (index * 4000) / (keyframeCount - 1) : 0,
            viewBox: { x: index * 100, y: 0, w: 500, h: 250 },
          })),
        },
      }
    : {}),
  ...extra,
});

const mountTimeline = (
  storyValue: StoryState,
  props: Record<string, unknown> = {},
) => {
  const node = document.createElement("div");
  document.body.appendChild(node);
  const handlers = {
    onSetFrameFromView: vi.fn(),
    onAddPoint: vi.fn(),
    onGoToPoint: vi.fn(),
    onSelectPoint: vi.fn(),
    onUpdatePointFromView: vi.fn(),
    onDeletePoint: vi.fn(),
    onPreviewMotion: vi.fn(),
    onStopMotionPreview: vi.fn(),
    onUpdateDuration: vi.fn(),
  };
  const selectedPointId = writable<string | null>(null);
  const motionPreviewing = writable(false);
  const instance = mount(StoryCameraTimeline, {
    target: node,
    props: {
      story: writable(storyValue),
      selectedChapterId: writable("chapter-1"),
      selectedPointId,
      motionPreviewing,
      ...handlers,
      ...props,
    },
  });
  const byId = <T extends HTMLElement = HTMLButtonElement>(id: string) =>
    node.querySelector<T>(`[data-testid="${id}"]`);
  const cleanup = () => {
    unmount(instance);
    node.remove();
  };
  return { node, byId, handlers, selectedPointId, motionPreviewing, cleanup };
};

describe("Story camera timeline", () => {
  it("is the one place to capture, select and play keyframes", async () => {
    const { node, byId, handlers, selectedPointId, cleanup } = mountTimeline({
      chapters: [chapter(2)],
    });

    expect(node.querySelectorAll(".camera-timeline__marker")).toHaveLength(2);
    const chips = node.querySelectorAll<HTMLButtonElement>(
      '[data-testid="camera-timeline-keyframe"]',
    );
    expect(chips).toHaveLength(2);
    expect(byId("camera-timeline-time")?.textContent).toBe("0:00 / 0:04");

    byId("camera-timeline-capture")!.click();
    chips[1].click();
    byId("camera-timeline-play")!.click();

    expect(handlers.onAddPoint).toHaveBeenCalledOnce();
    expect(handlers.onGoToPoint).toHaveBeenCalledWith("point-2");
    expect(handlers.onPreviewMotion).toHaveBeenCalledOnce();

    // The selected keyframe carries its own actions; nothing else does.
    expect(byId("camera-timeline-update")).toBeNull();
    selectedPointId.set("point-2");
    await tick();
    expect(chips[1].getAttribute("aria-pressed")).toBe("true");
    byId("camera-timeline-update")!.click();
    byId("camera-timeline-delete")!.click();
    expect(handlers.onUpdatePointFromView).toHaveBeenCalledWith("point-2");
    expect(handlers.onDeletePoint).toHaveBeenCalledWith("point-2");

    // Clicking the selected keyframe again lets go of it.
    chips[1].click();
    expect(handlers.onSelectPoint).toHaveBeenCalledWith(null);

    cleanup();
  });

  it("takes the current view as the chapter frame, beside capturing a keyframe", async () => {
    const { byId, handlers, cleanup } = mountTimeline({ chapters: [chapter(0)] });

    const setFrame = byId("chapter-position-from-view")!;
    const capture = byId("camera-timeline-capture")!;
    // Side by side: both mean "take what I am looking at".
    expect(setFrame.nextElementSibling).toBe(capture);
    setFrame.click();
    expect(handlers.onSetFrameFromView).toHaveBeenCalledOnce();
    expect(handlers.onAddPoint).not.toHaveBeenCalled();

    cleanup();
  });

  it("offers no frame where a chapter cannot have one, and prompts for a missing one", () => {
    const unframed = { ...chapter(0) };
    delete unframed.viewBox;

    const posed = mountTimeline({ chapters: [chapter(0)] }, { canSetFrame: false });
    expect(posed.byId("chapter-position-from-view")).toBeNull();
    posed.cleanup();

    const missing = mountTimeline({ chapters: [unframed] });
    expect(missing.byId("chapter-position-from-view")).not.toBeNull();
    expect(missing.byId("camera-timeline-empty")?.textContent).toContain("No frame yet");
    missing.cleanup();
  });

  it("shows nothing it does not have", () => {
    const { node, byId, cleanup } = mountTimeline({ chapters: [chapter(0)] });

    // No motion: no invented duration, no markers, nothing to play.
    expect(byId("camera-timeline-time")).toBeNull();
    expect(byId("camera-timeline-narration")).toBeNull();
    expect(node.querySelectorAll(".camera-timeline__marker")).toHaveLength(0);
    expect(byId("camera-timeline-play")!.disabled).toBe(true);
    expect(byId("camera-timeline-options")!.disabled).toBe(true);
    expect(byId("camera-timeline-empty")?.textContent).toContain("No camera motion");
    // Capture is always available: it is how motion starts.
    expect(byId("camera-timeline-capture")!.disabled).toBe(false);

    cleanup();
  });

  it("asks for a second keyframe before calling one keyframe motion", () => {
    const { node, byId, cleanup } = mountTimeline({ chapters: [chapter(1)] });

    expect(byId("camera-timeline-time")).toBeNull();
    expect(byId("camera-timeline-play")!.disabled).toBe(true);
    expect(node.textContent).toContain("capture a second keyframe");

    cleanup();
  });

  it("shows the narration length beside the motion and brings them into line", async () => {
    const { byId, handlers, cleanup } = mountTimeline({
      chapters: [
        chapter(2, { narrationSegment: { en: { start: 3, end: 19 } } }),
      ],
    });

    expect(byId("camera-timeline-time")?.textContent).toBe("0:00 / 0:04");
    expect(byId("camera-timeline-narration")?.textContent?.trim()).toBe("Narration 0:16");
    byId("camera-timeline-match-narration")!.click();
    expect(handlers.onUpdateDuration).toHaveBeenCalledWith(16_000);

    cleanup();
  });

  it("offers no match when motion and narration already agree", () => {
    const { byId, cleanup } = mountTimeline({
      chapters: [chapter(2, { narrationSegment: { en: { start: 0, end: 4 } } })],
    });

    expect(byId("camera-timeline-narration")).not.toBeNull();
    expect(byId("camera-timeline-match-narration")).toBeNull();

    cleanup();
  });

  it("keeps motion options behind one control and plays in place", async () => {
    const { byId, handlers, motionPreviewing, cleanup } = mountTimeline({
      chapters: [chapter(3)],
    });

    expect(byId("camera-timeline-options-panel")).toBeNull();
    byId("camera-timeline-options")!.click();
    await tick();
    expect(byId("camera-timeline-options-panel")?.textContent).toContain("Movement style");

    motionPreviewing.set(true);
    await tick();
    byId("camera-timeline-play")!.click();
    expect(handlers.onStopMotionPreview).toHaveBeenCalledOnce();
    expect(handlers.onPreviewMotion).not.toHaveBeenCalled();

    cleanup();
  });
});
