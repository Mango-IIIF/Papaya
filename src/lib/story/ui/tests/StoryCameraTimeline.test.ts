import { mount, unmount } from "svelte";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import type { StoryState } from "../../../core/types/story";
import StoryCameraTimeline from "../StoryCameraTimeline.svelte";
import StoryKeyframeInspector from "../StoryKeyframeInspector.svelte";

const story: StoryState = {
  chapters: [
    {
      id: "chapter-1",
      manifest: "https://example.org/manifest",
      canvasIndex: 0,
      description: { en: "A narrated camera move." },
      cameraTrack: {
        durationMs: 4000,
        keyframes: [
          {
            id: "point-1",
            timeMs: 0,
            viewBox: { x: 0, y: 0, w: 1000, h: 562.5 },
          },
          {
            id: "point-2",
            timeMs: 4000,
            viewBox: { x: 100, y: 80, w: 500, h: 281.25 },
          },
        ],
      },
    },
  ],
};

const target = (): HTMLDivElement => {
  const node = document.createElement("div");
  document.body.appendChild(node);
  return node;
};

describe("Story camera timeline", () => {
  it("keeps camera capture, navigation, and preview on one persistent rail", () => {
    const node = target();
    const onAddPoint = vi.fn();
    const onGoToPoint = vi.fn();
    const onPreviewMotion = vi.fn();
    const instance = mount(StoryCameraTimeline, {
      target: node,
      props: {
        story: writable(story),
        selectedChapterId: writable("chapter-1"),
        selectedPointId: writable("point-1"),
        motionPreviewing: writable(false),
        onAddPoint,
        onGoToPoint,
        onPreviewMotion,
      },
    });

    expect(node.querySelectorAll(".camera-timeline__marker")).toHaveLength(2);
    expect(node.querySelectorAll(".camera-timeline__card")).toHaveLength(2);
    expect(node.querySelector(".camera-timeline__card--selected")).toBeTruthy();

    node.querySelector<HTMLButtonElement>(".camera-timeline__capture")?.click();
    node
      .querySelectorAll<HTMLButtonElement>(".camera-timeline__card")[1]
      ?.click();
    node.querySelector<HTMLButtonElement>(".camera-timeline__play")?.click();

    expect(onAddPoint).toHaveBeenCalledOnce();
    expect(onGoToPoint).toHaveBeenCalledWith("point-2");
    expect(onPreviewMotion).toHaveBeenCalledOnce();

    unmount(instance);
    node.remove();
  });

  it("shows the selected image-space frame and exposes keyframe actions", () => {
    const node = target();
    const onGoToPoint = vi.fn();
    const onUpdatePointFromView = vi.fn();
    const onDeletePoint = vi.fn();
    const instance = mount(StoryKeyframeInspector, {
      target: node,
      props: {
        story: writable(story),
        selectedChapterId: writable("chapter-1"),
        selectedPointId: writable("point-1"),
        onGoToPoint,
        onUpdatePointFromView,
        onDeletePoint,
      },
    });

    expect(node.textContent).toContain("Keyframe 1");
    expect(node.textContent).toContain("1000 × 563");
    expect(node.textContent).toContain("A narrated camera move.");

    node
      .querySelectorAll<HTMLButtonElement>(
        ".keyframe-inspector__header button",
      )[1]
      ?.click();
    node
      .querySelector<HTMLButtonElement>(".keyframe-inspector__update")
      ?.click();
    node
      .querySelector<HTMLButtonElement>(".keyframe-inspector__delete")
      ?.click();

    expect(onGoToPoint).toHaveBeenCalledWith("point-2");
    expect(onUpdatePointFromView).toHaveBeenCalledWith("point-1");
    expect(onDeletePoint).toHaveBeenCalledWith("point-1");

    unmount(instance);
    node.remove();
  });
});
