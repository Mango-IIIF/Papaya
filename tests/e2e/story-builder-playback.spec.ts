import { expect, test } from "@playwright/test";

test("reader preserves the same IIIF chapter region on desktop, tablet, and phone", async ({
  page,
}) => {
  const saved = { x: 4333, y: 6393, w: 2494, h: 1245 };
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/index.html?iiif-content=test-story/demo.json");
    const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
    await viewer.locator('[data-testid="story-controls-page-6"]').click();
    await expect(viewer.locator('.story-shell__title')).toHaveText('Chapter 6');
    const pause = viewer.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.isVisible()) await pause.click();

    await expect
      .poll(() =>
        viewer.evaluate((element: any) => {
          const current = element.getViewBox?.();
          if (!current) return Number.POSITIVE_INFINITY;
          const expected = { x: 4333, y: 6393, w: 2494, h: 1245 };
          return Math.max(
            Math.abs(Math.round(current.x) - expected.x),
            Math.abs(Math.round(current.y) - expected.y),
            Math.abs(Math.round(current.w) - expected.w),
            Math.abs(Math.round(current.h) - expected.h),
          );
        }),
      )
      .toBeLessThanOrEqual(2);

    const surfaceBox = await viewer
      .locator('[data-testid="story-stage-surface"]')
      .boundingBox();
    expect(surfaceBox).not.toBeNull();
    expect(surfaceBox!.width / surfaceBox!.height).toBeCloseTo(saved.w / saved.h, 2);
  }
});

test("keeps viewer zoom shortcuts scoped away from story metadata fields", async ({
  page,
}) => {
  await page.goto("/story-builder.html?iiif-content=test-story/demo.json");
  await page.getByRole("button", { name: "Story settings", exact: true }).click();

  const title = page.getByTestId("story-title");
  await title.fill("");
  await title.pressSequentially("A+B-C");
  await expect(title).toHaveValue("A+B-C");

  const stage = page.getByRole("application", { name: "Viewer stage" });
  await stage.focus();
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const viewBefore = await viewer.evaluate((element: any) => element.getViewBox());
  await stage.press("+");
  await expect
    .poll(() => viewer.evaluate((element: any) => element.getViewBox()))
    .not.toEqual(viewBefore);
});

test("previews saved chapter motion without showing authoring frames", async ({
  page,
}) => {
  await page.goto("/story-builder.html?iiif-content=test-story/demo.json");
  const builder = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const capture = page.locator('[data-testid="camera-timeline-capture"]');
  await expect(capture).toBeVisible();
  await expect
    .poll(() => builder.evaluate((element: any) => element.getViewBox()))
    .not.toBeNull();
  const moveView = (dx: number, dy: number, scale: number) =>
    builder.evaluate(
      (element: any, [x, y, k]) => {
        const view = element.getViewBox();
        element.setViewBox({
          x: view.x + view.w * x,
          y: view.y + view.h * y,
          w: view.w * k,
          h: view.h * k,
        });
      },
      [dx, dy, scale],
    );

  // Capture two deliberately different views. Each keyframe is the view the
  // author was looking at, and is drawn on the image as a numbered outline.
  await moveView(0.2, 0.2, 0.6);
  await page.waitForTimeout(300);
  await capture.click();
  await expect(page.locator('[data-testid="camera-timeline-keyframe"]')).toHaveCount(1);
  await moveView(0.15, 0.1, 0.7);
  await page.waitForTimeout(300);
  await capture.click();
  await expect(page.locator('[data-testid="camera-timeline-keyframe"]')).toHaveCount(2);
  await expect(page.locator(".story-frame--keyframe")).toHaveCount(2);
  await expect(page.locator(".story-frame--keyframe.story-frame--editable")).toHaveCount(1);
  await expect(page.locator(".story-frame--chapter")).toHaveCount(1);

  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const viewBeforePreview = await viewer.evaluate((element: any) =>
    element.getViewBox(),
  );
  await page
    .getByRole("button", { name: "Preview story", exact: true })
    .click();
  // Nothing is drawn on the stage while the preview drives it.
  await expect(page.locator(".story-frame")).toHaveCount(0);
  await expect(viewer.locator(".panel-stack--left")).toHaveCSS("display", "none");
  await expect(viewer.locator(".panel-stack--right")).toHaveCSS("display", "none");
  await expect(viewer.locator(".stage__bottom")).toHaveCSS("display", "none");
  await expect(viewer.locator(".stage__toolbar--below")).toHaveCSS("display", "none");

  await expect
    .poll(() => viewer.evaluate((element: any) => element.getViewBox()), {
      timeout: 5_000,
      message: "expected the saved camera motion to change the preview view",
    })
    .not.toEqual(viewBeforePreview);

  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
});

test("authors camera motion from captured views on the timeline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/story-builder.html?iiif-content=test-story/demo.json");
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  const capture = viewer.getByTestId("camera-timeline-capture");
  await expect(capture).toBeVisible();
  await expect.poll(() => viewer.evaluate((element: any) => element.getViewBox())).not.toBeNull();
  const track = () =>
    viewer.evaluate((element: any) => element.getStory().chapters[0].cameraTrack);
  const inside = (box: any, view: any) =>
    box.x >= view.x - 1 &&
    box.y >= view.y - 1 &&
    box.x + box.w <= view.x + view.w + 1 &&
    box.y + box.h <= view.y + view.h + 1;

  // Nothing is invented before there is motion: no time, nothing to play.
  await expect(viewer.getByTestId("camera-timeline-time")).toHaveCount(0);
  await expect(viewer.getByTestId("camera-timeline-play")).toBeDisabled();

  const initialView = await viewer.evaluate((element: any) => element.getViewBox());
  await capture.click();
  await expect(viewer.getByTestId("camera-timeline-keyframe")).toHaveCount(1);
  const first = (await track()).keyframes[0];
  // A keyframe is the story-shaped box inside the view, never wider than it.
  expect(inside(first.viewBox, initialView)).toBe(true);

  const closeView = {
    x: initialView.x + initialView.w * 0.5,
    y: initialView.y + initialView.h * 0.35,
    w: initialView.w * 0.3,
    h: initialView.h * 0.3,
  };
  await viewer.evaluate((element: any, next) => element.setViewBox(next), closeView);
  await expect.poll(() => viewer.evaluate((element: any) => element.getViewBox().w)).toBeLessThan(initialView.w * 0.45);
  await capture.click();
  await expect(viewer.getByTestId("camera-timeline-keyframe")).toHaveCount(2);
  let authored = await track();
  expect(authored.keyframes[1].viewBox.w).toBeLessThan(authored.keyframes[0].viewBox.w);
  expect(authored.keyframes[1].focus.x).toBeGreaterThan(authored.keyframes[0].focus.x);
  await expect(viewer.getByTestId("camera-timeline-time")).toHaveText(/^0:00 \/ 0:0\d/);

  // The new keyframe is selected: its outline has the handles, and its
  // actions are on the timeline beside it.
  await expect(viewer.locator(".story-frame--keyframe.story-frame--editable")).toHaveCount(1);
  await expect(viewer.getByTestId("camera-timeline-update")).toBeVisible();

  // Selecting the first keyframe goes to it; moving the view and updating
  // replaces the keyframe with the view — where it looks and how far in.
  await viewer.getByTestId("camera-timeline-keyframe").first().click();
  await expect
    .poll(() => viewer.evaluate((element: any) => element.getViewBox().w))
    .toBeGreaterThan(initialView.w * 0.6);
  const leftView = {
    x: initialView.x + initialView.w * 0.05,
    y: initialView.y + initialView.h * 0.3,
    w: initialView.w * 0.4,
    h: initialView.h * 0.4,
  };
  await viewer.evaluate((element: any, next) => element.setViewBox(next), leftView);
  await expect.poll(() => viewer.evaluate((element: any) => element.getViewBox().w)).toBeLessThan(initialView.w * 0.5);
  const viewAtUpdate = await viewer.evaluate((element: any) => element.getViewBox());
  await viewer.getByTestId("camera-timeline-update").click();
  authored = await track();
  expect(inside(authored.keyframes[0].viewBox, viewAtUpdate)).toBe(true);
  expect(authored.keyframes[0].viewBox.w).toBeLessThan(first.viewBox.w);
  expect(authored.keyframes[0].focus.x).toBeLessThan(authored.keyframes[1].focus.x);

  // A third keyframe can be deleted again from the same place.
  await capture.click();
  await expect(viewer.getByTestId("camera-timeline-keyframe")).toHaveCount(3);
  await viewer.getByTestId("camera-timeline-delete").click();
  await expect(viewer.getByTestId("camera-timeline-keyframe")).toHaveCount(2);

  await viewer.getByTestId("camera-timeline-options").click();
  const fineTuning = viewer.locator(".motion-panel__fine-tuning");
  const options = viewer.locator(".motion-panel__options");
  await fineTuning.locator("summary").click();
  const [fineBox, optionsBox] = await Promise.all([fineTuning.boundingBox(), options.boundingBox()]);
  expect(fineBox && optionsBox).toBeTruthy();
  if (!fineBox || !optionsBox) return;
  expect(fineBox.width).toBeGreaterThan(optionsBox.width * 0.9);
  const tuningCards = fineTuning.locator(".motion-panel__fine-tuning-grid > section");
  await expect(tuningCards).toHaveCount(3);
  const cardTops = await tuningCards.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top));
  expect(Math.max(...cardTops) - Math.min(...cardTops)).toBeLessThanOrEqual(2);

  const duration = viewer.getByTestId("motion-duration");
  await duration.fill("3");
  await duration.blur();
  await viewer.getByTestId("camera-timeline-options").click();
  await expect(viewer.getByTestId("camera-timeline-time")).toHaveText("0:00 / 0:03");

  // Motion plays in place: the editor stays exactly where it is, the frames
  // step aside, and the same button stops it.
  const play = viewer.getByTestId("camera-timeline-play");
  await play.click();
  const viewerRoot = viewer.locator(".viewer:not(.viewer--headless)");
  await expect(viewerRoot).not.toHaveClass(/viewer--story-preview/);
  await expect(viewer.locator(".panel-stack--left")).toBeVisible();
  await expect(viewer.locator(".panel-stack--right")).toBeVisible();
  await expect(viewer.getByTestId("camera-timeline")).toBeVisible();
  await expect(viewer.locator(".story-frame")).toHaveCount(0);

  const centre = async () => viewer.evaluate((element: any) => {
    const box = element.getViewBox();
    return { x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w };
  });
  await page.waitForTimeout(250);
  const early = await centre();
  await page.waitForTimeout(550);
  const late = await centre();
  // OpenSeadragon's own camera spring can briefly lag behind the sampled
  // track, so assert real pan/zoom progress rather than a brittle per-frame
  // direction while that spring catches up.
  expect(Math.hypot(late.x - early.x, late.y - early.y)).toBeGreaterThan(10);
  expect(Math.abs(late.w - early.w)).toBeGreaterThan(10);

  await play.click();
  await expect(viewer.locator(".story-frame--chapter")).toHaveCount(1);
  await expect(viewer.locator(".story-frame--keyframe")).toHaveCount(2);
});
