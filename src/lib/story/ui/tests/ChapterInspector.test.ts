import { describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import { tick } from "svelte";
import { writable } from "svelte/store";
import ChapterOverlay from "../ChapterOverlay.svelte";
import type { ChapterTaskId } from "../../chapterTasks";
import type { StoryState } from "../../../core/types/story";

/*
 * The inspector is one form: the chapter's words. There are no tabs, no
 * status chips and nothing folds away — its title and description, its
 * annotations and its narration are stacked in the order an author writes
 * them, what is set rarely sits behind More, and the sections that need the
 * stage to themselves open their tool in place. What acts on the image — the
 * frame and camera motion — is set from the bar under the image, not here.
 */
const mountInspector = (
  props: Record<string, unknown> = {},
  storyOverrides: Partial<StoryState> = {},
) => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const story = writable<StoryState>({
    chapters: [
      {
        id: "chapter-one",
        manifest: "https://example.org/manifest",
        canvasIndex: 0,
        viewBox: { x: 0, y: 0, w: 100, h: 100 },
      },
    ],
    ...storyOverrides,
  });
  const instance = mount(ChapterOverlay, {
    target,
    props: {
      story,
      open: true,
      docked: true,
      chapterId: "chapter-one",
      languages: ["en", "cy"],
      ...props,
    },
  });
  const cleanup = () => {
    unmount(instance);
    target.remove();
  };
  const more = () =>
    target.querySelector('[data-testid="inspector-more"]') as HTMLButtonElement | null;
  const moreBody = () =>
    target.querySelector("#chapter-inspector-more") as HTMLElement | null;
  const section = (id: string) =>
    target.querySelector(`[data-testid="inspector-section-${id}"]`) as HTMLElement | null;
  return { target, story, more, moreBody, section, cleanup };
};

describe("Chapter inspector", () => {
  it("stacks the everyday sections in one form and keeps the rest behind More", async () => {
    const { target, more, moreBody, section, cleanup } = mountInspector();

    // Everything an author does to every chapter is on screen at once.
    expect(target.querySelector('[data-testid^="inspector-group-"]')).toBeNull();
    expect(section("details")?.textContent).toContain("Details");
    expect(section("focus")?.textContent).toContain("Annotations");
    expect(section("audio-timing")?.textContent).toContain("Narration");
    // A form, not a checklist: no status chips, and nothing to fold away.
    expect(target.textContent).not.toContain("Not configured");
    expect(target.textContent).not.toContain("Configured");
    expect(target.textContent).not.toContain("languages");
    expect(target.querySelector('[data-testid^="inspector-toggle-"]')).toBeNull();
    expect(target.querySelector('[data-testid^="inspector-attention-"]')).toBeNull();
    expect(target.querySelector('[data-testid="chapter-title"]')).toBeTruthy();
    expect(target.textContent).not.toContain("Back to chapter tools");
    // An image chapter has no source media to time.
    expect(section("media-timing")).toBeNull();
    // Motion is authored on the timeline, not in a section here.
    expect(section("motion")).toBeNull();

    // In document order: name it, annotate it, narrate it.
    const order = [...target.querySelectorAll("[data-task-id]")].map((node) =>
      node.getAttribute("data-task-id"),
    );
    expect(order.slice(0, 3)).toEqual(["details", "focus", "audio-timing"]);

    // The rarely-set sections exist but stay out of the way until asked for.
    expect(more()?.getAttribute("aria-expanded")).toBe("false");
    expect(moreBody()?.hidden).toBe(true);
    more()!.click();
    await tick();
    expect(more()?.getAttribute("aria-expanded")).toBe("true");
    expect(moreBody()?.hidden).toBe(false);
    expect(section("transition-timing")?.textContent).toContain("Chapter transition time");
    expect(section("source")?.textContent).toContain("Source");
    expect(target.querySelector('[data-testid="chapter-manifest"]')).toBeTruthy();
    expect(section("layers")?.textContent).toContain("Layers");
    expect(section("comparison")).toBeNull();
    expect(moreBody()?.contains(section("source"))).toBe(true);
    // The frame as typed numbers is here too; setting it from the view is
    // in the bar under the image.
    expect(moreBody()?.contains(section("position"))).toBe(true);
    expect(section("position")?.textContent).toContain("Frame");

    cleanup();
  });

  it("opens a stage tool in place and follows an open tool to its section", async () => {
    const activeChapterTask = writable<ChapterTaskId | null>(null);
    const onChapterTaskChange = vi.fn((task: ChapterTaskId | null) =>
      activeChapterTask.set(task),
    );
    const { more, section, cleanup } = mountInspector({
      activeChapterTask,
      onChapterTaskChange,
    });

    // Closed: a summary and an Open control, no tools.
    const annotations = section("focus")!;
    expect(annotations.textContent).toContain("0 annotations");
    expect(annotations.querySelector(".chapter-overlay__annotation-tools")).toBeNull();

    (
      annotations.querySelector('[data-testid="inspector-activate-focus"]') as HTMLButtonElement
    ).click();
    await tick();
    expect(onChapterTaskChange).toHaveBeenCalledWith("focus");
    expect(section("focus")?.classList.contains("inspector-section--active")).toBe(true);
    expect(section("focus")?.querySelector(".chapter-overlay__annotation-tools")).toBeNull();
    // Open, the section is the annotation list itself.
    expect(section("focus")?.querySelector(".story-wide-annotations")).toBeTruthy();
    expect(section("focus")?.textContent).toContain("No annotations in this chapter");
    expect(section("focus")?.textContent).toContain("Done");
    // Annotation editing becomes a focused inspector instead of squeezing its
    // properties beneath unrelated chapter sections.
    expect(section("details")).toBeNull();
    expect(section("audio-timing")).toBeNull();
    expect(more()).toBeNull();

    // A tool opened from elsewhere is shown as open in its own section.
    activeChapterTask.set("audio-timing");
    await tick();
    expect(section("details")).not.toBeNull();
    expect(section("audio-timing")?.classList.contains("inspector-section--active")).toBe(true);
    expect(section("audio-timing")?.textContent).toContain("Done");

    activeChapterTask.set(null);
    await tick();
    expect(section("audio-timing")?.classList.contains("inspector-section--active")).toBe(false);

    // A task that lives behind More opens it.
    expect(more()?.getAttribute("aria-expanded")).toBe("false");
    activeChapterTask.set("source");
    await tick();
    expect(more()?.getAttribute("aria-expanded")).toBe("true");

    cleanup();
  });

  it("keeps the frame out of the form: only its numbers, behind More", async () => {
    const { target, moreBody, section, cleanup } = mountInspector({
      mediaType: writable("image"),
    });
    await tick();

    const frame = section("position")!;
    expect(moreBody()?.contains(frame)).toBe(true);
    // No Adjust, no Done, no capture: the frame is not a tool that opens here.
    expect(frame.querySelector('[data-testid="inspector-activate-position"]')).toBeNull();
    expect(frame.querySelector('[data-testid="inspector-done-position"]')).toBeNull();
    expect(target.querySelector('[data-testid="chapter-position-from-view"]')).toBeNull();
    expect(frame.querySelectorAll('input[type="number"]')).toHaveLength(4);
    expect(frame.querySelector('[data-testid="chapter-position-goto"]')).toBeTruthy();

    cleanup();
  });

  it("says nothing about a section unless it needs attention, and then shows it", async () => {
    const { more, moreBody, section, target, cleanup } = mountInspector({
      validationErrors: ["Chapter 1: manifest is missing"],
    });
    await tick();

    const marker = target.querySelectorAll('[data-testid^="inspector-attention-"]');
    expect(marker).toHaveLength(1);
    expect(marker[0].getAttribute("data-testid")).toBe("inspector-attention-source");
    expect(section("source")?.textContent).toContain("Needs attention");
    // A problem behind More is not left hidden behind it.
    expect(more()?.getAttribute("aria-expanded")).toBe("true");
    expect(moreBody()?.hidden).toBe(false);

    cleanup();
  });

  it("summarizes existing annotations before the editor is opened", async () => {
    const { section, cleanup } = mountInspector(
      {},
      {
        chapters: [
          {
            id: "chapter-one",
            manifest: "https://example.org/manifest",
            canvasIndex: 0,
            viewBox: { x: 0, y: 0, w: 100, h: 100 },
            drawingAnnotations: [
              {
                id: "existing-annotation",
                type: "rectangle",
                rect: { x: 10, y: 10, w: 30, h: 20 },
                label: { en: "Existing note" },
              },
            ],
          },
        ],
      },
    );

    const annotations = section("focus")!;
    expect(annotations.textContent).toContain("1 annotation on this chapter.");
    expect(annotations.textContent).toContain("Open");
    expect(annotations.textContent).not.toContain("Draw to add or edit");
    expect(annotations.querySelector(".story-wide-annotations__delete")).toBeNull();
    expect(annotations.querySelector(".story-wide-annotations__select")).toBeNull();

    cleanup();
  });

  it("explains why Layers is unavailable and keeps Comparison hidden", async () => {
    const { more, section, cleanup } = mountInspector();
    more()!.click();
    await tick();

    const sections = [
      {
        id: "layers",
        title: "Layers",
        reason: "This source does not currently expose multiple image layers.",
        action: "Choose a layered Manifest in Source.",
      },
    ] as const;

    for (const item of sections) {
      const target = section(item.id)!;
      expect(target.textContent).toContain(item.title);
      expect(target.textContent).toContain(item.reason);
      expect(target.textContent).toContain(item.action);
    }
    expect(section("comparison")).toBeNull();
    cleanup();
  });

  it("leaves an open stage tool by Escape without closing the inspector", async () => {
    const activeChapterTask = writable<ChapterTaskId | null>(null);
    const onChapterTaskChange = vi.fn((task: ChapterTaskId | null) =>
      activeChapterTask.set(task),
    );
    const onClose = vi.fn();
    const { cleanup } = mountInspector({ activeChapterTask, onChapterTaskChange, onClose });
    await tick();
    activeChapterTask.set("audio-timing");
    await tick();
    onChapterTaskChange.mockClear();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await tick();
    expect(onChapterTaskChange).toHaveBeenCalledWith(null);
    expect(onClose).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
  });
});
