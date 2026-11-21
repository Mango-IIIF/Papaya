import { expect, test } from "@playwright/test";

/*
 * Regression cover for an interaction bug every static layout check passed
 * straight through: the assertion is on behaviour under a real gesture, not on
 * a CSS property, because the CSS looked correct while the builder was unusable.
 */

test.describe("story builder interaction regressions", () => {
  test.use({ hasTouch: true });

  test("lets the wheel reach the bottom of the story builder authoring panel", async ({
    page,
  }) => {
    // The panel had `overscroll-behavior-y: contain` with only ~20px of its own
    // scroll, so the wheel stopped dead there and never handed the remaining
    // scroll to the stage — the Apply control stayed out of reach.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/story-builder.html?iiif-content=test-story/demo.json");
    await page.waitForTimeout(4000);
    await page
      .locator('[data-testid="inspector-activate-audio-timing"]')
      .first()
      .click({ timeout: 10000 });
    await page.waitForTimeout(2500);

    const panel = await page.evaluate(() => {
      const element = document
        .querySelector(":is(mango-story-viewer, mango-story-builder)")!
        .shadowRoot!.querySelector(".story-wide-narration")!;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
    for (let i = 0; i < 14; i += 1) {
      await page.mouse.wheel(0, 220);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const root = document.querySelector(":is(mango-story-viewer, mango-story-builder)")!.shadowRoot!;
      const narration = root.querySelector(".story-wide-narration")!;
      const stage = root.querySelector(".stage--story-builder")!;
      const trapsGesture =
        getComputedStyle(narration).overscrollBehaviorY === "contain";
      const controls = [...narration.querySelectorAll("button, input")];
      const last = controls[controls.length - 1];
      const viewer = root.querySelector(".viewer")!.getBoundingClientRect();
      const rect = last.getBoundingClientRect();
      return {
        trapsGesture,
        panelAtEnd:
          narration.scrollTop >=
          narration.scrollHeight - narration.clientHeight - 1,
        stageScrolled: Math.round(stage.scrollTop),
        stageExtent: stage.scrollHeight - stage.clientHeight,
        lastControlVisible:
          rect.height > 0 &&
          rect.y >= viewer.y - 1 &&
          rect.y + rect.height <= viewer.y + viewer.height + 1,
      };
    });

    // This panel holds only a few dozen pixels of scroll while the stage holds
    // the rest, so it must not contain the gesture: whether or not a given
    // window size happens to expose the symptom, containing it here is what
    // stops the wheel partway down the editor.
    expect(state.trapsGesture).toBe(false);
    expect(state.panelAtEnd).toBe(true);
    if (state.stageExtent > 5) {
      expect(state.stageScrolled).toBeGreaterThan(5);
    }
    expect(state.lastControlVisible).toBe(true);
  });
});
