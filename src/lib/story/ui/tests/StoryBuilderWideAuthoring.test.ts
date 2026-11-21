import { tick } from "svelte";
import { mount, unmount } from "svelte";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import type { StoryState } from "../../../core/types/story";
import type { MediaType } from "@mango-iiif/iiif-viewer/core";
import type { ChapterTaskId } from "../../chapterTasks";
import StoryBuilderWideAuthoring from "../StoryBuilderWideAuthoring.svelte";

describe("StoryBuilderWideAuthoring", () => {
  it("only renders the editor for the active wide chapter tool", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const story = writable<StoryState>({
      narration: {
        tracks: { en: { src: "https://example.org/narration.mp3" } },
      },
      chapters: [
        {
          id: "chapter-two",
          manifest: "https://example.org/manifest",
          canvasIndex: 0,
          viewBox: { x: 0, y: 0, w: 100, h: 100 },
          annotations: { en: { text: "A text annotation" } },
          drawingAnnotations: [
            {
              id: "rectangle-one",
              type: "rectangle",
              rect: { x: 10, y: 10, w: 20, h: 20 },
            },
          ],
          cameraTrack: {
            durationMs: 5000,
            keyframes: [
              { id: "one", timeMs: 0, viewBox: { x: 0, y: 0, w: 100, h: 100 } },
              {
                id: "two",
                timeMs: 5000,
                viewBox: { x: 25, y: 25, w: 50, h: 50 },
              },
            ],
          },
          narrationSegment: { en: { start: 1, end: 4 } },
          media: { start: 5, end: 25 },
        },
      ],
    });
    const selectedChapterId = writable<string | null>("chapter-two");
    const activeTask = writable<ChapterTaskId | null>(null);
    const mediaType = writable<MediaType | null>("audio");
    const mediaSources = writable([
      {
        id: "source-audio",
        src: "https://example.org/source.mp4",
        type: "audio" as const,
        duration: 120,
      },
    ]);
    const mediaMarks = writable({ lastTime: 12, markIn: 5, markOut: 25 });
    const onAssignMediaSegment = vi.fn();
    const onPreviewMediaSegment = vi.fn();
    const onStopPreviewMediaSegment = vi.fn();
    const selectedPointId = writable<string | null>(null);
    const motionPreviewing = writable(false);
    const selectedAnnotationId = writable<string | null>(null);
    const annotationTool = writable("select" as const);
    const onSetAnnotationTool = vi.fn((tool) => annotationTool.set(tool));
    const onUpdatePointFromView = vi.fn();
    const onDeletePoint = vi.fn();
    const onUpdateMotionPathType = vi.fn();
    const onUpdateMotionInitialDwell = vi.fn();
    const onUpdateMotionEasing = vi.fn();
    const onPreviewMotion = vi.fn();
    const onStopMotionPreview = vi.fn();
    const onSkipNarration = vi.fn();
    const instance = mount(StoryBuilderWideAuthoring, {
      target,
      props: {
        story,
        selectedChapterId,
        activeTask,
        mediaType,
        mediaSources,
        mediaMarks,
        avMarksValid: writable(true),
        languages: ["en", "cy"],
        selectedPointId,
        onAddPoint: vi.fn(),
        onDeletePoint,
        onGoToPoint: vi.fn(),
        onUpdatePointFromView,
        motionPreviewing,
        onUpdateMotionPathType,
        onUpdateMotionInitialDwell,
        onUpdateMotionEasing,
        onUpdateMotionDuration: vi.fn(),
        onApplyMotionPreset: vi.fn(),
        onPreviewMotion,
        onStopMotionPreview,
        annotationTool,
        selectedAnnotationId,
        onSetAnnotationTool,
        onSetNarrationTrack: vi.fn(),
        onAssignNarrationSegment: vi.fn(),
        onSkipNarration,
        onAssignMediaSegment,
        onPreviewMediaSegment,
        onStopPreviewMediaSegment,
      },
    });

    expect(target.querySelector(".story-wide-authoring")).toBeNull();
    expect(target.querySelector(".story-wide-narration")).toBeNull();

    // An audio chapter has no camera to move, so no timeline.
    expect(target.querySelector('[data-testid="camera-timeline"]')).toBeNull();

    // A spatial chapter always has the camera timeline under the image: it is
    // not a tool to open, and the whole of motion authoring is on it.
    mediaType.set("image");
    await tick();
    const timeline = target.querySelector('[data-testid="camera-timeline"]')!;
    expect(timeline).toBeTruthy();
    expect(target.querySelector('[data-testid="story-wide-done"]')).toBeNull();
    expect(target.querySelector('[role="tab"]')).toBeNull();
    expect(
      timeline.querySelectorAll('[data-testid="camera-timeline-keyframe"]'),
    ).toHaveLength(2);
    timeline
      .querySelector<HTMLButtonElement>('[data-testid="camera-timeline-play"]')!
      .click();
    expect(onPreviewMotion).toHaveBeenCalledOnce();

    selectedPointId.set("one");
    await tick();
    timeline
      .querySelector<HTMLButtonElement>('[data-testid="camera-timeline-update"]')!
      .click();
    expect(onUpdatePointFromView).toHaveBeenCalledWith("one");
    timeline
      .querySelector<HTMLButtonElement>('[data-testid="camera-timeline-delete"]')!
      .click();
    expect(onDeletePoint).toHaveBeenCalledWith("one");

    timeline
      .querySelector<HTMLButtonElement>('[data-testid="camera-timeline-options"]')!
      .click();
    await tick();
    expect(target.querySelector(".motion-panel--wide")).toBeTruthy();
    expect(target.querySelector(".motion-panel__fine-tuning-grid")).toBeTruthy();
    const motionOption = (label: string) =>
      [...target.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === label,
      )!;
    motionOption("Curved Spline").click();
    motionOption("1.0s").click();
    motionOption("Ease out").click();
    expect(onUpdateMotionPathType).toHaveBeenCalledWith("spline");
    expect(onUpdateMotionInitialDwell).toHaveBeenCalledWith(1000);
    expect(onUpdateMotionEasing).toHaveBeenCalledWith("ease-out");

    // Playing keeps the timeline where it is; its play button becomes stop.
    motionPreviewing.set(true);
    await tick();
    expect(target.querySelector('[data-testid="camera-timeline"]')).toBeTruthy();
    target
      .querySelector<HTMLButtonElement>('[data-testid="camera-timeline-play"]')!
      .click();
    expect(onStopMotionPreview).toHaveBeenCalledOnce();
    motionPreviewing.set(false);
    await tick();

    // A tool that takes the stage replaces the timeline while it is open.
    mediaType.set("audio");
    activeTask.set("audio-timing");
    await tick();
    expect(target.querySelector(".story-wide-authoring")).toBeNull();
    expect(target.querySelector(".story-wide-narration")).toBeTruthy();
    expect(
      target.querySelector('[data-testid="chapter-narration-waveform"]'),
    ).toBeTruthy();
    expect(
      target.querySelectorAll(".story-wide-narration__range input"),
    ).toHaveLength(2);
    expect(
      Array.from(
        target.querySelectorAll<HTMLInputElement>(
          ".story-wide-narration__range input",
        ),
      ).map((input) => input.value),
    ).toEqual(["1.00", "4.00"]);
    expect(target.textContent).toContain("Preview");
    const noNarration = target.querySelector(
      '[data-testid="chapter-narration-none"]',
    ) as HTMLButtonElement;
    noNarration.click();
    await tick();
    expect(onSkipNarration).toHaveBeenCalledWith("en");
    expect(
      target.querySelector('[data-testid="chapter-narration-editor"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      target.querySelector<HTMLInputElement>(
        ".story-wide-narration__track input",
      )?.disabled,
    ).toBe(true);
    expect(
      target.querySelector('[data-testid="chapter-narration-waveform"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    (
      target.querySelector(
        '[data-testid="chapter-narration-use"]',
      ) as HTMLButtonElement
    ).click();
    await tick();
    expect(
      target.querySelector<HTMLInputElement>(
        ".story-wide-narration__track input",
      )?.disabled,
    ).toBe(false);
    expect(
      target.querySelector('.story-wide-modal__panel')?.getAttribute('role'),
    ).toBe('dialog');
    expect(
      target.querySelector('.story-wide-modal__panel')?.getAttribute('aria-modal'),
    ).toBe('true');

    // The media-timing footer remains available while an audio source is resolving.
    mediaSources.set([]);
    activeTask.set("media-timing");
    await tick();
    expect(
      target.querySelector('[data-testid="chapter-media-timing-editor"]'),
    ).toBeTruthy();
    expect(
      target.querySelector('[data-testid="chapter-media-waveform"]'),
    ).toBeTruthy();
    expect(target.querySelector('.story-wide-modal__panel')).toBeTruthy();
    expect(target.textContent).not.toContain("manifest audio");
    expect(target.textContent).not.toContain(
      "Drag or resize the waveform region",
    );
    expect(
      target.querySelectorAll('.story-wide-media__range input[type="number"]'),
    ).toHaveLength(2);
    expect(target.textContent).not.toContain("Narration is edited separately");
    expect(target.textContent).not.toContain("Apply segment");
    const mediaInputs = target.querySelectorAll<HTMLInputElement>(
      '.story-wide-media__range input[type="number"]',
    );
    expect(Array.from(mediaInputs).map((input) => input.value)).toEqual([
      "5.00",
      "25.00",
    ]);
    mediaInputs[0].value = "6";
    mediaInputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    mediaInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    mediaInputs[1].value = "24";
    mediaInputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    mediaInputs[1].dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(onAssignMediaSegment).toHaveBeenLastCalledWith(6, 24);
    expect(Array.from(mediaInputs).map((input) => input.value)).toEqual([
      "6.00",
      "24.00",
    ]);
    const previewMedia = Array.from(target.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Preview segment"),
    ) as HTMLButtonElement;
    const stopMedia = Array.from(target.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Stop"),
    ) as HTMLButtonElement;
    previewMedia.click();
    expect(onAssignMediaSegment).toHaveBeenLastCalledWith(6, 24);
    expect(onPreviewMediaSegment).toHaveBeenCalledOnce();
    stopMedia.click();
    expect(onStopPreviewMediaSegment).toHaveBeenCalledOnce();

    mediaType.set("video");
    mediaSources.set([
      {
        id: "source-video",
        src: "https://example.org/source.mp4",
        type: "video",
        duration: 120,
      },
    ]);
    await tick();
    expect(
      target.querySelector('[data-testid="chapter-media-waveform"]'),
    ).toBeTruthy();
    const videoPreview = target.querySelector<HTMLVideoElement>(
      '[data-testid="chapter-media-video-preview"]',
    );
    expect(videoPreview).toBeTruthy();
    expect(videoPreview?.getAttribute('src')).toBe(
      'https://example.org/source.mp4',
    );
    expect(target.querySelector('.story-wide-modal--video')).toBeTruthy();
    const playVideo = vi.fn().mockResolvedValue(undefined);
    const pauseVideo = vi.fn();
    Object.defineProperty(videoPreview!, 'play', { value: playVideo });
    Object.defineProperty(videoPreview!, 'pause', { value: pauseVideo });
    videoPreview!.currentTime = 12;
    videoPreview!.dispatchEvent(new Event('timeupdate'));
    (
      target.querySelectorAll<HTMLButtonElement>('.story-wide-media__current')[0]
    ).click();
    await tick();
    expect(onAssignMediaSegment).toHaveBeenLastCalledWith(12, 25);
    const stagePreviewCalls = onPreviewMediaSegment.mock.calls.length;
    const stopStageCalls = onStopPreviewMediaSegment.mock.calls.length;
    const previewVideo = Array.from(target.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Preview segment'),
    ) as HTMLButtonElement;
    previewVideo.click();
    await tick();
    expect(playVideo).toHaveBeenCalledOnce();
    expect(onPreviewMediaSegment).toHaveBeenCalledTimes(stagePreviewCalls);
    expect(onStopPreviewMediaSegment.mock.calls.length).toBeGreaterThan(
      stopStageCalls,
    );
    expect(target.querySelector(".story-wide-media__track")).toBeNull();
    expect(target.querySelector(".story-wide-media__sliders")).toBeNull();

    // Annotation mode is one tool row in the same bar: the tool in hand, a
    // line saying what the pointer does, and the way out. The list and an
    // annotation's properties are in the inspector, not here.
    mediaType.set("image");
    activeTask.set("focus");
    await tick();
    const bar = target.querySelector('[data-testid="annotation-bar"]')!;
    expect(bar).toBeTruthy();
    expect(target.querySelector('[data-testid="camera-timeline"]')).toBeNull();
    expect(bar.querySelectorAll('[data-testid^="annotation-tool-"]')).toHaveLength(6);
    expect(bar.querySelectorAll('[data-testid="story-wide-done"]')).toHaveLength(1);
    expect(target.querySelector(".story-wide-annotations")).toBeNull();
    expect(target.querySelector(".annotation-options")).toBeNull();
    expect(target.querySelector('[data-testid="annotation-edit-done"]')).toBeNull();
    const hint = () =>
      target.querySelector('[data-testid="annotation-bar-hint"]')?.textContent?.trim() ?? "";
    expect(hint()).toContain("Pick a shape to draw");

    const rectangle = bar.querySelector<HTMLButtonElement>(
      '[data-testid="annotation-tool-rectangle"]',
    )!;
    rectangle.click();
    expect(onSetAnnotationTool).toHaveBeenCalledWith("rectangle");
    await tick();
    // The bar stays put while a shape is being drawn; only the hint changes.
    expect(target.querySelector('[data-testid="annotation-bar"]')).toBeTruthy();
    expect(rectangle.getAttribute("aria-pressed")).toBe("true");
    expect(hint()).toContain("Draw the rectangle on the image");

    annotationTool.set("select");
    selectedAnnotationId.set("rectangle-one");
    await tick();
    expect(hint()).toContain("Drag the annotation to move or resize it");
    selectedAnnotationId.set(null);

    activeTask.set("details");
    await tick();
    expect(target.querySelector(".story-wide-authoring")).toBeNull();
    expect(target.querySelector(".story-wide-narration")).toBeNull();

    selectedChapterId.set(null);
    await tick();
    expect(target.querySelector(".story-wide-authoring--empty")).toBeTruthy();

    unmount(instance);
    target.remove();
  });
});
