import { expect, test, type Locator, type Page } from "@playwright/test";

const openExampleStoryBuilder = async (page: Page) => {
  await page.goto("/story-builder.html?iiif-content=test-story/demo.json");
  await expect(page.locator('[data-testid="inspector-activate-focus"]')).toBeVisible();
  let previous = "";
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const view = await page
          .locator(":is(mango-story-viewer, mango-story-builder)")
          .evaluate((element: any) => element.getViewBox());
        const signature = view
          ? [view.x, view.y, view.w, view.h]
              .map((value) => Number(value).toFixed(2))
              .join(":")
          : "";
        stableSamples =
          signature && signature === previous ? stableSamples + 1 : 0;
        previous = signature;
        return stableSamples;
      },
      { timeout: 15_000, intervals: [150] },
    )
    .toBeGreaterThanOrEqual(2);
};

/*
 * Annotation mode, end to end. The tools that act on the image are one row in
 * the bar under the editor; the list of annotations and the selected one's
 * text and appearance are in the inspector; and there is exactly one way out.
 */

const builder = (page: Page) => page.locator(":is(mango-story-viewer, mango-story-builder)");
const EDITOR = ".mango-annotation-editor:not(.story-frame-layer)";
const drawings = (page: Page, chapterIndex = 0) =>
  builder(page).evaluate(
    (element: any, index) => element.getStory().chapters[index].drawingAnnotations ?? [],
    chapterIndex,
  );

/*
 * The annotation layer re-creates its shapes as the story settles after an
 * edit, so a box read at an unlucky moment belongs to a node already replaced
 * and comes back null. Read it once there is a shape to read.
 */
type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
const settledBox = async (locator: Locator): Promise<Box> => {
  let box: Box | null = null;
  await expect
    .poll(async () => {
      box = await locator.boundingBox();
      return box !== null;
    })
    .toBe(true);
  return box as unknown as Box;
};

const openAnnotations = async (page: Page) => {
  const viewer = builder(page);
  await viewer.locator('[data-testid="inspector-activate-focus"]').click();
  await expect(viewer.getByTestId("annotation-bar")).toBeVisible();
  await expect(viewer.locator(`${EDITOR} .mango-annotation-editor__svg`)).toBeVisible();
};

/** Draws a rectangle across the middle of the image, clear of every panel. */
const drawRectangle = async (page: Page) => {
  const viewer = builder(page);
  await viewer.getByTestId("annotation-tool-rectangle").click();
  const stage = await viewer.locator(".openseadragon-container").boundingBox();
  expect(stage).not.toBeNull();
  if (!stage) throw new Error("no stage");
  const from = { x: stage.x + stage.width * 0.3, y: stage.y + stage.height * 0.35 };
  const to = { x: stage.x + stage.width * 0.55, y: stage.y + stage.height * 0.55 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await drawings(page)).length).toBe(1);
};

test("edits an existing annotation from the inspector list and leaves with one Done", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openExampleStoryBuilder(page);
  const viewer = builder(page);
  await viewer.getByRole("button").filter({ hasText: "Chapter 6" }).first().click();

  // Closed, the section says what the chapter has; the timeline is the bar.
  await expect(viewer.getByTestId("camera-timeline")).toBeVisible();
  await openAnnotations(page);

  // Open: six tools and one Done in the bar, in place of the timeline, and
  // nothing floating over the image.
  const bar = viewer.getByTestId("annotation-bar");
  await expect(viewer.getByTestId("camera-timeline")).toHaveCount(0);
  await expect(bar.locator('[data-testid^="annotation-tool-"]')).toHaveCount(6);
  await expect(bar.getByTestId("story-wide-done")).toHaveCount(1);
  await expect(viewer.getByTestId("annotation-edit-done")).toHaveCount(0);
  await expect(viewer.locator(".viewer__grid--builder-annotation-editing")).toHaveCount(1);

  // The list is in the inspector, and so are the selected one's properties.
  const inspector = viewer.locator(".panel-stack--right");
  const existing = inspector.getByRole("button", {
    name: /Edit Rectangle annotation 1.*Annotations appear in context/i,
  });
  await expect(existing).toBeVisible();
  await expect(inspector.getByTestId("annotation-options")).toHaveCount(0);
  await existing.click();
  await expect(inspector.getByTestId("annotation-options")).toBeVisible();
  await expect(viewer.locator(`${EDITOR} [data-handle]`).first()).toBeVisible();

  // Clicking it again lets go without leaving annotation mode.
  await existing.click();
  await expect(inspector.getByTestId("annotation-options")).toHaveCount(0);
  await expect(viewer.locator(".viewer__grid--builder-annotation-editing")).toHaveCount(1);

  await bar.getByTestId("story-wide-done").click();
  await expect(viewer.locator(".viewer__grid--builder-annotation-editing")).toHaveCount(0);
  await expect(viewer.getByTestId("camera-timeline")).toBeVisible();
});

test("draws, labels, moves, resizes and keeps an annotation", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openExampleStoryBuilder(page);
  const viewer = builder(page);
  await openAnnotations(page);

  // Opening the tool moves nothing: the image and both panels stay put.
  const stageBefore = await viewer.locator(".openseadragon-container").boundingBox();
  await drawRectangle(page);
  const stageAfter = await viewer.locator(".openseadragon-container").boundingBox();
  expect(stageAfter).toEqual(stageBefore);
  await expect(viewer.locator(".panel-stack--left")).toBeVisible();

  // The new shape is selected, the tool returns to select, and its
  // properties are open in the inspector.
  await expect(viewer.getByTestId("annotation-tool-select")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const options = viewer.getByTestId("annotation-options");
  await expect(options).toBeVisible();
  await options.locator("textarea").fill("The mast");
  await expect.poll(async () => (await drawings(page))[0].label?.en).toBe("The mast");

  // The swatch that reads as selected is the colour on the image; choosing
  // another changes the stored colour.
  const swatches = options.locator(".annotation-options__palette button");
  await expect(swatches.first()).toHaveAttribute("aria-pressed", "true");
  await swatches.nth(2).click();
  await expect.poll(async () => (await drawings(page))[0].color).toBeTruthy();

  // Move it by dragging the shape.
  const drawn = (await drawings(page))[0].rect;
  const shape = viewer
    .locator(`${EDITOR} [data-annotation-id]:not([data-handle])`)
    .first();
  const shapeBox = await settledBox(shape);
  await page.mouse.move(shapeBox.x + shapeBox.width / 2, shapeBox.y + shapeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    shapeBox.x + shapeBox.width / 2 + 60,
    shapeBox.y + shapeBox.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await drawings(page))[0].rect.x).toBeGreaterThan(drawn.x);
  const moved = (await drawings(page))[0].rect;
  expect(moved.y).toBeGreaterThan(drawn.y);
  expect(moved.w).toBeCloseTo(drawn.w, 0);

  // Resize it by its corner handle.
  const handle = viewer.locator(`${EDITOR} [data-handle="se"]`);
  await expect(handle).toBeVisible();
  const handleBox = await settledBox(handle);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 50,
    handleBox.y + handleBox.height / 2 + 35,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await drawings(page))[0].rect.w).toBeGreaterThan(moved.w);
  const resized = (await drawings(page))[0].rect;
  expect(resized.h).toBeGreaterThan(moved.h);

  // One Done keeps it all, and it is one undo step.
  await viewer.getByTestId("story-wide-done").click();
  await expect(viewer.locator(".viewer__grid--builder-annotation-editing")).toHaveCount(0);
  const kept = (await drawings(page))[0];
  expect(kept.label?.en).toBe("The mast");
  expect(kept.rect).toEqual(resized);
  await expect(viewer.getByTestId("inspector-summary-focus")).toContainText("1 annotation");

  // Reopening shows the same annotation in the list.
  await openAnnotations(page);
  await expect(viewer.locator(".story-wide-annotations__item")).toHaveCount(1);
  await expect(viewer.locator(".story-wide-annotations__item")).toContainText("The mast");
});

test("deletes an annotation from the inspector list", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openExampleStoryBuilder(page);
  const viewer = builder(page);
  await openAnnotations(page);
  await drawRectangle(page);

  const items = viewer.locator(".story-wide-annotations__item");
  await expect(items).toHaveCount(1);
  await viewer.getByRole("button", { name: /Delete Rectangle annotation/ }).click();

  await expect(items).toHaveCount(0);
  await expect(viewer.getByTestId("annotation-options")).toHaveCount(0);
  await expect(viewer.locator(`${EDITOR} [data-annotation-id]`)).toHaveCount(0);
  expect(await drawings(page)).toHaveLength(0);
  // Still in annotation mode, ready to draw another.
  await expect(viewer.getByTestId("annotation-bar")).toBeVisible();
});
