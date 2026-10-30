import { expect, test, type Page } from "@playwright/test";

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

test("returns from editing Chapter 6's existing annotation to the annotation list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openExampleStoryBuilder(page);
  const viewer = page.locator(":is(mango-story-viewer, mango-story-builder)");
  await viewer
    .getByRole("button")
    .filter({ hasText: "Chapter 6" })
    .first()
    .click();

  await viewer.locator('[data-testid="inspector-activate-focus"]').click();
  const workspace = viewer.locator('.story-wide-authoring--annotations');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('[role="tab"]')).toHaveCount(0);
  await expect(workspace.getByText('Add annotation', { exact: true })).toBeVisible();
  await expect(workspace.locator('.story-wide-authoring__annotation-tool')).toHaveCount(6);

  // Existing content opens the focused edit form from the list.
  const existing = viewer.getByRole("button", {
    name: /Edit Rectangle annotation 1.*Annotations appear in context/i,
  });
  await expect(existing).toBeVisible();
  await existing.click();

  await expect(viewer.locator(".viewer__grid--builder-annotation-editing")).toHaveCount(1);
  await expect(viewer.locator(".mango-annotation-editor__svg")).toBeVisible();
  await expect(viewer.locator("[data-testid=chapter-preview]")).toHaveCount(0);
  await expect(viewer.locator(".chapter-inspector__groups")).toHaveCount(0);
  await expect(viewer.locator('#annotation-options-panel')).toBeVisible();

  // Done in the focused edit form steps back to annotation management; it
  // does not close the annotation tool or restore the sidebars.
  await viewer.getByTestId('annotation-edit-done').click();
  await expect(viewer.locator('#annotation-options-panel')).toHaveCount(0);
  await expect(viewer.locator('#annotation-list-panel')).toBeVisible();
  await expect(viewer.getByText('Add annotation', { exact: true })).toBeVisible();
  await expect(viewer.locator('.viewer__grid--builder-annotation-editing')).toHaveCount(1);

  const done = workspace.getByTestId('story-wide-done');
  await expect(done).toBeVisible();
  await done.click();
  await expect(viewer.locator('.viewer__grid--builder-annotation-editing')).toHaveCount(0);
});

test("moves, resizes, and persists a story annotation", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("ERR_BLOCKED_BY_RESPONSE") &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      runtimeErrors.push(message.text());
    }
  });

  await openExampleStoryBuilder(page);
  await page.locator('[data-testid="inspector-activate-focus"]').click();

  // The chapter frame is drawn with the same editor; this is the drawing one.
  const drawingEditor = () =>
    page.locator(
      ".mango-annotation-editor:not(.story-frame-layer) .mango-annotation-editor__svg",
    );
  let editor = drawingEditor();
  await expect(editor).toBeVisible();
  const editorBounds = await editor.boundingBox();
  expect(editorBounds).not.toBeNull();
  if (!editorBounds) return;

  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.waitForTimeout(200);
  // Draw in the genuinely visible strip between the floating panels. The
  // annotation inspector is deliberately wider in this mode, so fixed stage
  // offsets can be covered even though they remain inside the SVG bounds.
  const chaptersBounds = await page.locator(".panel-stack--left").boundingBox();
  const inspectorBounds = await page.locator(".panel-stack--right").boundingBox();
  expect(chaptersBounds).not.toBeNull();
  expect(inspectorBounds).not.toBeNull();
  const visibleLeft = Math.max(
    editorBounds.x,
    chaptersBounds!.x + chaptersBounds!.width,
  );
  const visibleRight = Math.min(
    editorBounds.x + editorBounds.width,
    inspectorBounds!.x,
  );
  const visibleWidth = visibleRight - visibleLeft;
  await page.mouse.move(
    visibleLeft + visibleWidth * 0.25,
    editorBounds.y + editorBounds.height * 0.3,
  );
  await page.mouse.down();
  await page.mouse.move(
    visibleLeft + visibleWidth * 0.55,
    editorBounds.y + editorBounds.height * 0.55,
    { steps: 8 },
  );
  await page.mouse.up();

  const annotationShapes = editor.locator(
    "rect[data-annotation-id]:not([data-handle])",
  );
  await expect(annotationShapes).toHaveCount(1);

  await page.getByRole("button", { name: "Select / pan" }).click();
  let shape = annotationShapes.first();
  await shape.click();

  const storyText = page.locator(
    ".chapter-overlay__translation-field textarea",
  );
  await storyText.fill("Note");
  await storyText.press("Backspace");
  await expect(storyText).toHaveValue("Not");
  await expect(annotationShapes).toHaveCount(1);

  const geometry = async () =>
    shape.evaluate((element) => ({
      x: Number(element.getAttribute("x")),
      y: Number(element.getAttribute("y")),
      width: Number(element.getAttribute("width")),
      height: Number(element.getAttribute("height")),
    }));

  const beforeMove = await geometry();
  await expect(shape).toBeVisible();
  const shapeBounds = await shape.boundingBox();
  expect(shapeBounds).not.toBeNull();
  if (!shapeBounds) return;
  await page.mouse.move(
    shapeBounds.x + shapeBounds.width / 2,
    shapeBounds.y + shapeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    shapeBounds.x + shapeBounds.width / 2 + 70,
    shapeBounds.y + shapeBounds.height / 2 + 45,
    { steps: 8 },
  );
  await page.mouse.up();

  const afterMove = await geometry();
  expect(afterMove.x).toBeGreaterThan(beforeMove.x + 20);
  expect(afterMove.y).toBeGreaterThan(beforeMove.y + 15);

  const resizeHandle = editor.locator('[data-handle="se"]');
  await expect(resizeHandle).toBeVisible();
  const resizeBounds = await resizeHandle.boundingBox();
  expect(resizeBounds).not.toBeNull();
  if (!resizeBounds) return;
  await page.mouse.move(
    resizeBounds.x + resizeBounds.width / 2,
    resizeBounds.y + resizeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resizeBounds.x + resizeBounds.width / 2 + 55,
    resizeBounds.y + resizeBounds.height / 2 + 35,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(150);

  const afterResize = await geometry();
  expect(afterResize.width).toBeGreaterThan(afterMove.width + 20);
  expect(afterResize.height).toBeGreaterThan(afterMove.height + 15);

  // The focus task is transactional: Save commits geometry; Cancel must
  // restore the chapter snapshot rather than silently committing it.
  await page.getByRole("button", { name: "Save annotation" }).click();
  await page.locator('[data-testid="inspector-activate-focus"]').click();
  editor = drawingEditor();
  shape = editor
    .locator("rect[data-annotation-id]:not([data-handle])")
    .first();
  const reopened = await geometry();
  expect(Math.abs(reopened.x - afterMove.x)).toBeLessThan(2);
  expect(reopened.width).toBeGreaterThan(afterMove.width + 15);
  expect(reopened.height).toBeGreaterThan(afterMove.height + 10);
  expect(runtimeErrors).toEqual([]);
});

test("opens and deletes a Mango annotation from the inspector list", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("ERR_BLOCKED_BY_RESPONSE") &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      runtimeErrors.push(message.text());
    }
  });

  await openExampleStoryBuilder(page);
  await page.locator('[data-testid="inspector-activate-focus"]').click();

  const editor = page.locator(
    ".mango-annotation-editor:not(.story-frame-layer) .mango-annotation-editor__svg",
  );
  await expect(editor).toBeVisible();
  const editorBounds = await editor.boundingBox();
  expect(editorBounds).not.toBeNull();
  if (!editorBounds) return;

  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.waitForTimeout(200);
  // Draw in the genuinely visible strip between the two floating panels. The
  // annotation inspector is deliberately wider in this mode, so fixed offsets
  // can land under its transparent edge even though they are inside the SVG.
  const chaptersBounds = await page.locator(".panel-stack--left").boundingBox();
  const inspectorBounds = await page.locator(".panel-stack--right").boundingBox();
  expect(chaptersBounds).not.toBeNull();
  expect(inspectorBounds).not.toBeNull();
  const visibleLeft = Math.max(editorBounds.x, chaptersBounds!.x + chaptersBounds!.width);
  const visibleRight = Math.min(
    editorBounds.x + editorBounds.width,
    inspectorBounds!.x,
  );
  const visibleWidth = visibleRight - visibleLeft;
  await page.mouse.move(
    visibleLeft + visibleWidth * 0.3,
    editorBounds.y + editorBounds.height * 0.32,
  );
  await page.mouse.down();
  await page.mouse.move(
    visibleLeft + visibleWidth * 0.7,
    editorBounds.y + editorBounds.height * 0.58,
    { steps: 6 },
  );
  await page.mouse.up();

  const inspectorItems = page.locator(".story-wide-annotations__item");
  await expect(inspectorItems).toHaveCount(1);
  const zoom = page.getByRole("textbox", { name: "Zoom percent" });
  const zoomBefore = Number((await zoom.inputValue()).replace(/[^0-9.]/g, ""));
  await page.getByRole("button", { name: /Edit Rectangle annotation/ }).click();
  await expect(editor.locator("[data-handle]")).toHaveCount(8);
  const zoomAfter = Number((await zoom.inputValue()).replace(/[^0-9.]/g, ""));
  // Opening the editor changes the available canvas width, which can adjust
  // the displayed fit percentage by a few points. Guard against an unwanted
  // zoom-to-annotation jump without requiring pixel-identical layout timing.
  expect(Math.abs(zoomAfter - zoomBefore)).toBeLessThanOrEqual(5);

  await page
    .getByRole("button", { name: /Delete Rectangle annotation/ })
    .click();
  await expect(editor.locator("[data-annotation-id]")).toHaveCount(0);
  await expect(inspectorItems).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});
