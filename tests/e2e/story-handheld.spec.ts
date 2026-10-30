import { expect, test } from "@playwright/test";

test.describe("handheld story layout", () => {
  for (const fixture of [
    { path: "/story-builder.html", scrollContainer: ".viewer__grid:not(.viewer--headless .viewer__grid)" },
    { path: "/index.html", scrollContainer: ".story-shell" },
  ]) {
    test(`contains ${fixture.path} within the custom-element height`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 664 });
      await page.goto(fixture.path);

      const host = page.locator(":is(mango-story-viewer, mango-story-builder)");
      const innerViewer = host.locator(".viewer:not(.viewer--headless)");
      const [hostBox, innerBox] = await Promise.all([
        host.boundingBox(),
        innerViewer.boundingBox(),
      ]);

      expect(hostBox?.height).toBe(664);
      expect(innerBox?.height).toBe(hostBox?.height);
      expect(innerBox!.y + innerBox!.height).toBe(hostBox!.y + hostBox!.height);

      const sizing = await host
        .locator(fixture.scrollContainer)
        .evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
      expect(sizing.scrollHeight).toBeGreaterThanOrEqual(sizing.clientHeight);
    });
  }
});
