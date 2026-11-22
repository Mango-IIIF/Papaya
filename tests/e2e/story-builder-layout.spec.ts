import { expect, test, type Page } from "@playwright/test";

/*
 * The story builder's stage is the author's reference frame, so two things
 * have to hold whatever the chrome around it does: the viewer's idea of "the
 * current view" must describe the stage as it is now, and opening or closing
 * an authoring panel must not change the stage at all.
 */

const STORY_URL = "/story-builder.html?iiif-content=test-story/demo.json";

type StageMeasure = {
  width: number;
  height: number;
  aspect: number;
  viewAspect: number | null;
};

const measureStage = (page: Page): Promise<StageMeasure> =>
  page.locator(":is(mango-story-viewer, mango-story-builder)").evaluate((element: any) => {
    const container = element.shadowRoot?.querySelector(
      ".openseadragon-container",
    ) as HTMLElement | null;
    const rect = container?.getBoundingClientRect();
    const view = element.getViewBox?.() ?? null;
    return {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      aspect: rect && rect.height > 0 ? rect.width / rect.height : 0,
      viewAspect: view && view.h > 0 ? view.w / view.h : null,
    };
  });

const waitForStage = async (page: Page) => {
  await page.goto(STORY_URL);
  await expect
    .poll(async () => (await measureStage(page)).viewAspect, {
      timeout: 30_000,
    })
    .not.toBeNull();
  await expect
    .poll(async () => (await measureStage(page)).width)
    .toBeGreaterThan(0);
};

const selectChapterSix = async (page: Page) => {
  const viewer = page.locator(':is(mango-story-viewer, mango-story-builder)');
  const chaptersToggle = viewer.locator('[data-testid="builder-toggle-chapters"]');
  if ((await chaptersToggle.getAttribute('aria-expanded')) !== 'true') {
    await chaptersToggle.click();
  }
  await viewer
    .getByRole('button')
    .filter({ hasText: 'Chapter 6' })
    .first()
    .click();
  await expect
    .poll(() =>
      viewer.evaluate((element: any) => {
        const saved = element.getStory?.()?.chapters?.[5]?.viewBox;
        const current = element.getViewBox?.();
        if (!saved || !current) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(saved.x + saved.w / 2 - (current.x + current.w / 2)),
          Math.abs(saved.y + saved.h / 2 - (current.y + current.h / 2)),
        );
      }),
    )
    // A fluid authoring viewport may expose more picture on one axis than the
    // saved output frame, but it must stay centred on the authored region.
    .toBeLessThanOrEqual(2);
};

test("places Reload manifest below the source URL", async ({ page }) => {
  await waitForStage(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  await viewer.locator('[data-testid="inspector-more"]').click();

  const input = viewer.getByTestId("chapter-manifest");
  const reload = viewer.getByTestId("chapter-manifest-reload");
  await expect(input).toBeVisible();
  await expect(reload).toBeVisible();
  const [inputBox, reloadBox] = await Promise.all([
    input.boundingBox(),
    reload.boundingBox(),
  ]);
  expect(inputBox && reloadBox).toBeTruthy();
  if (!inputBox || !reloadBox) return;
  expect(reloadBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height + 7);
  expect(Math.abs(reloadBox.x - inputBox.x)).toBeLessThanOrEqual(1);
});

test("loads a new story source without a canvas-selection step", async ({
  page,
}) => {
  await page.goto("/story-edit.html");
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  await expect(viewer.getByTestId("story-source-setup")).toBeVisible();
  await expect(viewer.getByTestId("chapter-canvas-select")).toHaveCount(0);

  await viewer
    .getByTestId("chapter-manifest")
    .fill("/test-story/local-iiif/manifest.json");
  await viewer.getByTestId("chapter-manifest-reload").click();

  await expect(viewer.getByTestId("narration-overlay")).toBeHidden({
    timeout: 15_000,
  });
  await expect(
    viewer.locator('[data-testid^="chapter-row-"]').first(),
  ).toBeVisible();
  await expect(viewer.getByTestId("story-stage-label")).toHaveCount(0);
  const storyStage = await viewer.getByTestId("story-stage").boundingBox();
  const surface = await viewer.getByTestId("story-stage-surface").boundingBox();
  expect(storyStage && surface).toBeTruthy();
  if (!storyStage || !surface) return;
  expect(Math.abs(surface.x - storyStage.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(surface.y - storyStage.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(surface.width - storyStage.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(surface.height - storyStage.height)).toBeLessThanOrEqual(1);
});

test("fills desktop, tablet, and phone workspaces while keeping the authored region centred", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await waitForStage(page);
    await selectChapterSix(page);
    const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");

    const storyStage = viewer.locator('[data-testid="story-stage"]');
    const surface = viewer.locator('[data-testid="story-stage-surface"]');
    const storyStageBox = await storyStage.boundingBox();
    const surfaceBox = await surface.boundingBox();
    expect(storyStageBox).not.toBeNull();
    expect(surfaceBox).not.toBeNull();
    expect(Math.abs(surfaceBox!.width - storyStageBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(surfaceBox!.height - storyStageBox!.height)).toBeLessThanOrEqual(1);
  }
});

test("keeps the current view in step with the stage after a window resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await waitForStage(page);
  await selectChapterSix(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  await viewer.evaluate((element: any) => {
    (window as any).__viewBoxEvents = [];
    element.addEventListener("viewBoxChange", (event: CustomEvent) => {
      const box = event.detail?.viewBox;
      if (box && box.h > 0) {
        (window as any).__viewBoxEvents.push(box.w / box.h);
      }
    });
  });

  // The full-workspace stage follows the window, and OSD reports that new
  // viewport shape rather than retaining a hidden fixed-ratio surface.
  await page.setViewportSize({ width: 1100, height: 900 });

  await expect
    .poll(async () => {
      const stage = await measureStage(page);
      return stage.viewAspect === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(stage.viewAspect - stage.aspect) / stage.aspect;
    })
    .toBeLessThan(0.01);

  const stage = await measureStage(page);
  const emitted: number[] = await viewer.evaluate(
    () => (window as any).__viewBoxEvents,
  );
  expect(emitted.length).toBeGreaterThan(0);
  expect(Math.abs(emitted[emitted.length - 1] - stage.aspect) / stage.aspect).toBeLessThan(
    0.01,
  );
});

test("leaves the stage the same size whatever chrome the author opens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await waitForStage(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const chapterRows = viewer.locator('[data-testid^="chapter-row-"]');
  await expect(chapterRows.first()).toBeVisible();

  const baseline = await measureStage(page);
  expect(baseline.width).toBeGreaterThan(0);

  const expectUnchanged = async (label: string) => {
    // Measured, not eyeballed: the container must not move by a pixel.
    await expect
      .poll(async () => {
        const stage = await measureStage(page);
        return [Math.round(stage.width), Math.round(stage.height)];
      }, { message: `stage size after ${label}` })
      .toEqual([Math.round(baseline.width), Math.round(baseline.height)]);
  };

  const openTool = async (task: string) => {
    await viewer.locator(`[data-testid="inspector-activate-${task}"]`).click();
  };
  const closeTool = async (task: string) => {
    if (task === "focus") {
      await viewer.locator('[data-testid="story-wide-done"]').click();
      return;
    }
    await viewer.locator('.story-wide-modal__done').click();
  };

  // The frame is not a tool that opens: it is already drawn on the image, and
  // the camera timeline is already under it.
  await expect(viewer.locator(".story-frame--chapter")).toHaveCount(1);
  await expect(viewer.locator('[data-testid="inspector-activate-position"]')).toHaveCount(0);
  await expect(viewer.locator('[data-testid="inspector-activate-motion"]')).toHaveCount(0);
  await expect(viewer.locator('[data-testid="camera-timeline"]')).toBeVisible();

  for (const task of ["focus", "audio-timing"]) {
    await openTool(task);
    // The tool's own panel has appeared...
    await expect(viewer.locator(".stage__bottom")).toBeVisible();
    // ...and the picture has not flinched.
    await expectUnchanged(`opening ${task}`);
    await closeTool(task);
    await expectUnchanged(`closing ${task}`);
  }

  // Authoring motion is chrome too: the first keyframe, a second, the options
  // that open over the image, and playing it back all leave the stage alone.
  const capture = viewer.locator('[data-testid="camera-timeline-capture"]');
  await capture.click();
  await expectUnchanged("capturing the first keyframe");
  await capture.click();
  await expect(viewer.locator('[data-testid="camera-timeline-keyframe"]')).toHaveCount(2);
  await expectUnchanged("capturing a second keyframe");
  const options = viewer.locator('[data-testid="camera-timeline-options"]');
  await options.click();
  await expect(viewer.locator('[data-testid="camera-timeline-options-panel"]')).toBeVisible();
  await expectUnchanged("opening motion options");
  await options.click();
  const play = viewer.locator('[data-testid="camera-timeline-play"]');
  await play.click();
  await expectUnchanged("playing motion in place");
  await expect(viewer.locator(".panel-stack--left")).toBeVisible();
  await expect(viewer.locator('[data-testid="camera-timeline"]')).toBeVisible();

  // So is the rest of the form.
  await viewer.locator('[data-testid="inspector-more"]').click();
  await expectUnchanged("opening More");

  // Desktop columns are docked beside the stage, not floated over it.
  await expect(viewer.locator(".panel-stack--left")).toHaveCSS("position", "relative");
  await expect(viewer.locator(".panel-stack--right")).toHaveCSS("position", "relative");
});

test("collapses the desktop columns to give the image their width", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await waitForStage(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const chapters = viewer.locator(".panel-stack--left");
  const inspector = viewer.locator(".panel-stack--right");
  const chaptersToggle = viewer.locator('[data-testid="builder-toggle-chapters"]');
  const toolsToggle = viewer.locator('[data-testid="builder-toggle-tools"]');
  const stageWidth = async () => Math.round((await measureStage(page)).width);

  await expect(chapters).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(chaptersToggle).toBeVisible();
  await expect(toolsToggle).toBeVisible();
  await expect(chaptersToggle).toHaveAttribute("aria-expanded", "true");
  const docked = await stageWidth();

  // A handle never sits on its own column: it is just inside the stage.
  const chaptersBox = (await chapters.boundingBox())!;
  const toggleBox = (await chaptersToggle.boundingBox())!;
  expect(toggleBox.x).toBeGreaterThanOrEqual(chaptersBox.x + chaptersBox.width);

  await chaptersToggle.click();
  await expect(chaptersToggle).toHaveAttribute("aria-expanded", "false");
  await expect(chapters).toBeHidden();
  await expect.poll(stageWidth).toBeGreaterThan(docked + 150);
  const leftOnly = await stageWidth();

  await toolsToggle.click();
  await expect(inspector).toBeHidden();
  await expect.poll(stageWidth).toBeGreaterThan(leftOnly + 200);

  // Both come back as they were, and so does the stage.
  await chaptersToggle.click();
  await toolsToggle.click();
  await expect(chapters).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect.poll(stageWidth).toBe(docked);
});

test("opens narration in a modal over the editor and keeps its controls in reach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await waitForStage(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const stageBefore = await measureStage(page);

  await viewer.locator('[data-testid="inspector-activate-audio-timing"]').click();
  const footer = viewer.locator(".stage__bottom");
  const narration = footer.locator(".story-wide-narration");
  const dialog = footer.locator('.story-wide-modal__panel');
  const sidebars = viewer.locator('.panel-stack--left, .panel-stack--right');
  const sidebarToggles = viewer.locator('.builder-panel-toggle');
  await expect(narration).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(sidebars.first()).toHaveCSS('visibility', 'hidden');
  await expect(sidebars.last()).toHaveCSS('visibility', 'hidden');
  await expect(sidebarToggles.first()).toHaveCSS('visibility', 'hidden');
  await expect(sidebarToggles.last()).toHaveCSS('visibility', 'hidden');

  // Modal: an overlay across the whole editor, not a row of it, so the
  // image underneath keeps its size.
  const modal = footer.locator(".story-wide-modal");
  const position = await modal.evaluate((element) => getComputedStyle(element).position);
  expect(position).toBe("absolute");
  const stageAfter = await measureStage(page);
  expect(Math.round(stageAfter.height)).toBe(Math.round(stageBefore.height));

  const modalBox = await modal.boundingBox();
  const gridBox = await viewer.locator(".viewer__grid--builder-overlay").boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(modalBox && gridBox && dialogBox).toBeTruthy();
  if (!modalBox || !gridBox || !dialogBox) return;
  expect(Math.round(modalBox.x)).toBe(Math.round(gridBox.x));
  expect(Math.round(modalBox.y)).toBe(Math.round(gridBox.y));
  expect(Math.round(modalBox.width)).toBe(Math.round(gridBox.width));
  expect(Math.round(modalBox.height)).toBe(Math.round(gridBox.height));
  expect(dialogBox.width).toBeGreaterThan(gridBox.width * 0.6);
  expect(dialogBox.y).toBeGreaterThanOrEqual(gridBox.y);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(
    gridBox.y + gridBox.height + 1,
  );
  await expect(
    narration.getByRole("button", { name: "Apply to chapter" }),
  ).toBeVisible();
  await footer.locator('.story-wide-modal__done').click();
  await expect(sidebars.first()).toHaveCSS('visibility', 'visible');
  await expect(sidebars.last()).toHaveCSS('visibility', 'visible');
  await expect(sidebarToggles.first()).toHaveCSS('visibility', 'visible');
  await expect(sidebarToggles.last()).toHaveCSS('visibility', 'visible');
});

test("keeps audio and video timing inside the modal without resizing the stage", async ({
  page,
}) => {
  /*
   * Media timing is the one bottom-slot panel an image chapter never shows,
   * so it is measured on an audio chapter of the showcase story. The stage
   * there is the AV player rather than OpenSeadragon, and the box that must
   * not move is the media area.
   */
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/story-builder.html?iiif-content=test-story/feature-showcase.json");
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const audioRow = viewer.locator('[data-testid="chapter-row-chapter_11"]');
  await expect(audioRow).toBeVisible({ timeout: 30_000 });
  await audioRow.locator("button").first().click();

  const mediaTiming = viewer.locator('[data-testid="inspector-activate-media-timing"]');
  await expect(mediaTiming).toBeVisible({ timeout: 30_000 });
  const media = viewer.locator(".stage__media");
  const measure = () =>
    media.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return [Math.round(rect.width), Math.round(rect.height)];
    });
  await expect.poll(() => measure().then(([, h]) => h)).toBeGreaterThan(0);
  const before = await measure();

  await mediaTiming.click();
  await expect(viewer.locator(".stage__bottom")).toBeVisible();
  await expect(viewer.locator('.story-wide-modal__panel')).toHaveAttribute(
    'role',
    'dialog',
  );
  await expect(viewer.locator('.panel-stack--left')).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator('.panel-stack--right')).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator('.builder-panel-toggle').first()).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator('.builder-panel-toggle').last()).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect.poll(measure, { message: "media area after opening media timing" }).toEqual(before);

  await viewer.locator('.story-wide-modal__done').click();
  await expect(viewer.locator('.panel-stack--left')).toHaveCSS(
    'visibility',
    'visible',
  );
  await expect(viewer.locator('.panel-stack--right')).toHaveCSS(
    'visibility',
    'visible',
  );
  await expect(viewer.locator('.builder-panel-toggle').first()).toHaveCSS(
    'visibility',
    'visible',
  );
  await expect(viewer.locator('.builder-panel-toggle').last()).toHaveCSS(
    'visibility',
    'visible',
  );
  await expect.poll(measure, { message: "media area after closing media timing" }).toEqual(before);

  // Video chapters move the player into the timing modal instead of leaving a
  // second, blurred player in the normal canvas workspace.
  const videoRow = viewer.locator('[data-testid="chapter-row-chapter_13"]');
  await expect(videoRow).toBeVisible({ timeout: 30_000 });
  await videoRow.locator('button').first().click();
  const videoTiming = viewer.locator(
    '[data-testid="inspector-activate-media-timing"]',
  );
  await expect(videoTiming).toBeVisible({ timeout: 30_000 });
  await videoTiming.click();

  const videoPreview = viewer.locator(
    '[data-testid="chapter-media-video-preview"]',
  );
  await expect(videoPreview).toBeVisible();
  await expect(videoPreview).toHaveAttribute('src', /\S+/);
  await expect(viewer.locator('.panel-stack--left')).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator('.panel-stack--right')).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator('.builder-panel-toggle').first()).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator('.builder-panel-toggle').last()).toHaveCSS(
    'visibility',
    'hidden',
  );
  await expect(viewer.locator(".stage__primary:not(.viewer--headless .stage__primary)")).toHaveCSS(
    'visibility',
    'hidden',
  );
});

test("closes both drawers for drawing and keeps the inspector one tap away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 543, height: 591 });
  await waitForStage(page);
  const viewer = page.locator(':is(mango-story-viewer, mango-story-builder)');
  const chaptersToggle = viewer.locator('[data-testid="builder-toggle-chapters"]');
  if ((await chaptersToggle.getAttribute('aria-expanded')) !== 'true') {
    await chaptersToggle.click();
  }
  await viewer.getByRole('button').filter({ hasText: 'Chapter 6' }).first().click();
  const toolsToggle = viewer.locator('[data-testid="builder-toggle-tools"]');
  if ((await toolsToggle.getAttribute('aria-expanded')) !== 'true') {
    await toolsToggle.click();
  }
  await viewer.locator('[data-testid="inspector-activate-focus"]').click();

  const chapters = viewer.locator('.panel-stack--left');
  const inspector = viewer.locator('.panel-stack--right');
  const stage = viewer.locator('.stage--story-builder');
  const bar = viewer.locator('.stage__bottom');
  // Drawing needs the image, so both drawers close when the tool opens...
  await expect(chapters).toHaveCSS('visibility', 'hidden');
  await expect(inspector).toHaveCSS('visibility', 'hidden');
  await expect(viewer.getByTestId('annotation-bar')).toBeVisible();
  // ...but an annotation's text and colour live in the inspector, so its
  // handle stays, and brings the annotation list back over the image.
  await expect(toolsToggle).toBeVisible();
  await toolsToggle.click();
  await expect(inspector).toHaveCSS('visibility', 'visible');
  await expect(inspector.locator('.story-wide-annotations')).toBeVisible();
  await toolsToggle.click();
  await expect(inspector).toHaveCSS('visibility', 'hidden');

  const done = viewer.locator('[data-testid="story-wide-done"]');
  const doneBox = await done.boundingBox();
  const stageBox = await stage.boundingBox();
  const barBox = await bar.boundingBox();
  expect(doneBox && stageBox && barBox).toBeTruthy();
  if (!doneBox || !stageBox || !barBox) return;
  // Done is in the bar under the image, never over it or off the edge.
  expect(doneBox.x + doneBox.width).toBeLessThanOrEqual(barBox.x + barBox.width + 1);
  expect(doneBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height - 1);

  await done.click();
  await expect(inspector).toHaveCSS('visibility', 'visible');
  await expect(toolsToggle).toHaveCSS('visibility', 'visible');
  await expect(stage).toHaveCSS('z-index', '0');
  await expect(viewer.locator('.story-builder-overlay-root')).toHaveCSS(
    'z-index',
    '3',
  );
  await expect(chapters).toHaveCSS('z-index', '6');
  await expect(inspector).toHaveCSS('z-index', '6');
});

test("sets the chapter frame from the view on request, and never otherwise", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await waitForStage(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  await viewer.locator('[data-testid^="chapter-row-"]').nth(1).locator("button").first().click();
  const saved = () =>
    viewer.evaluate((element: any) => element.getStory().chapters[1].viewBox);
  await expect.poll(saved).toBeTruthy();
  const before = await saved();

  // The frame is on the image, in hand, without entering any mode.
  await expect(viewer.locator(".story-frame--chapter.story-frame--editable")).toHaveCount(1);

  /*
   * Opening and closing a tool must leave the stored frame exactly as it was.
   * The editor stage is not the story's shape, and closing the old frame mode
   * used to re-read the viewport into the chapter and widen it.
   */
  await viewer.locator('[data-testid="inspector-activate-focus"]').click();
  await viewer.locator('[data-testid="story-wide-done"]').click();
  expect(await saved()).toEqual(before);

  // Pan and zoom, then ask. Selecting the chapter flies the camera to it, so
  // wait for that to settle before moving the view somewhere else.
  await page.waitForTimeout(1500);
  const settled = await viewer.evaluate((element: any) => element.getViewBox());
  await viewer.evaluate((element: any, view) => {
    element.setViewBox({
      x: view.x + view.w * 0.2,
      y: view.y + view.h * 0.2,
      w: view.w * 0.6,
      h: view.h * 0.6,
    });
  }, settled);
  await expect
    .poll(() => viewer.evaluate((element: any) => element.getViewBox().w))
    .toBeLessThan(settled.w * 0.7);
  await page.waitForTimeout(400);
  expect(await saved()).toEqual(before);
  const view = await viewer.evaluate((element: any) => element.getViewBox());
  await viewer.locator('[data-testid="chapter-position-from-view"]').click();
  await expect.poll(saved).not.toEqual(before);
  const after = await saved();

  // The story's shape, kept...
  expect(after.w / after.h).toBeCloseTo(before.w / before.h, 3);
  // ...and wholly inside what was on screen: nothing the author did not see.
  expect(after.x).toBeGreaterThanOrEqual(view.x - 1);
  expect(after.y).toBeGreaterThanOrEqual(view.y - 1);
  expect(after.x + after.w).toBeLessThanOrEqual(view.x + view.w + 1);
  expect(after.y + after.h).toBeLessThanOrEqual(view.y + view.h + 1);

  // Asking again without moving changes nothing.
  await viewer.locator('[data-testid="chapter-position-from-view"]').click();
  await page.waitForTimeout(300);
  const again = await saved();
  for (const key of ["x", "y", "w", "h"] as const) {
    expect(again[key]).toBeCloseTo(after[key], 0);
  }
});
