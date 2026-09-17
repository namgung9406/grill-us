import { expect, test } from "./fixtures/app";

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 640 },
  { name: "mobile-412", width: 412, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
] as const;

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const browser = globalThis as typeof globalThis & {
      document: { documentElement: { clientWidth: number; scrollWidth: number } };
    };
    return {
      clientWidth: browser.document.documentElement.clientWidth,
      scrollWidth: browser.document.documentElement.scrollWidth,
    };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("다섯 viewport에서 페이지와 게임 UI가 overflow 또는 overlap 없이 배치된다", async ({ app, page }, testInfo) => {
  test.setTimeout(120_000);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of ["/", "/games", "/games/leaderboard"]) {
      await app.goto(path);
      await expectNoHorizontalOverflow(page);
    }

    await page.evaluate(() => {
      const browser = globalThis as typeof globalThis & { localStorage: { clear: () => void } };
      browser.localStorage.clear();
    });
    await app.startGame();
    const canvasBounds = await page.locator("canvas").boundingBox();
    expect(canvasBounds).not.toBeNull();
    if (canvasBounds !== null) {
      expect(canvasBounds.width / canvasBounds.height).toBeCloseTo(16 / 9, 2);
      expect(canvasBounds.height).toBeLessThanOrEqual(viewport.height);
    }
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 768) {
      const hudButton = await page.getByRole("button", { name: "게임 일시정지" }).boundingBox();
      const joystick = await page.getByLabel("이동 조이스틱").boundingBox();
      expect(hudButton).not.toBeNull();
      expect(joystick).not.toBeNull();
      if (hudButton !== null && joystick !== null) {
        expect(hudButton.y + hudButton.height).toBeLessThan(joystick.y);
      }
    }

    await testInfo.attach(`responsive-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
});

test("reduced motion에서는 장식 animation을 비활성화한다", async ({ app, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.goto("/games/dex-survivor");
  await page.getByRole("button", { name: "게임 시작" }).click();
  const spinner = page.locator(".animate-spin");
  await expect(spinner).toBeVisible();
  await expect.poll(() => spinner.evaluate((element) => {
    const browser = globalThis as typeof globalThis & {
      getComputedStyle: (target: unknown) => { animationName: string };
    };
    return browser.getComputedStyle(element).animationName;
  })).toBe("none");
});