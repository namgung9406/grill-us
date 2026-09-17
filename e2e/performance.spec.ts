import { expect, test } from "./fixtures/app";

interface PerformanceMetrics {
  readonly stepDurationsMs: readonly number[];
  readonly droppedCatchUpEvents: number;
  readonly bridgeListenerCount: number;
  readonly snapshotBytes: number;
  readonly entityCounts: {
    readonly enemies: number;
    readonly projectiles: number;
    readonly pickups: number;
  };
}

interface PerformanceApi {
  prepareMaximumEntityFixture: () => void;
  resetMetrics: () => void;
  readMetrics: () => PerformanceMetrics;
}

type PerformanceWindow = typeof globalThis & { __DEX_PERF__?: PerformanceApi };

async function readMetrics(page: import("@playwright/test").Page): Promise<PerformanceMetrics> {
  return page.evaluate(() => {
    const api = (globalThis as PerformanceWindow).__DEX_PERF__;
    if (api === undefined) {
      throw new Error("DEX performance diagnostics가 설치되지 않았습니다.");
    }
    return api.readMetrics();
  });
}

test("최대 entity cap에서 60초 simulation step 비용과 snapshot 크기가 상한을 지킨다", async ({ app, page }) => {
  test.setTimeout(100_000);
  await app.startGame();
  await page.evaluate(() => {
    const api = (globalThis as PerformanceWindow).__DEX_PERF__;
    if (api === undefined) throw new Error("DEX performance diagnostics가 설치되지 않았습니다.");
    api.prepareMaximumEntityFixture();
    api.resetMetrics();
  });
  await expect.poll(async () => (await readMetrics(page)).entityCounts).toEqual({
    enemies: 220,
    projectiles: 1_000,
    pickups: 100,
  });

  await page.waitForTimeout(60_000);
  const metrics = await readMetrics(page);
  const orderedDurations = [...metrics.stepDurationsMs].sort((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.ceil(orderedDurations.length * 0.95) - 1);
  expect(orderedDurations.length).toBeGreaterThan(300);
  expect(orderedDurations[percentileIndex]).toBeLessThanOrEqual(8);
  expect(metrics.droppedCatchUpEvents).toBeLessThanOrEqual(3);
  expect(metrics.snapshotBytes).toBeLessThan(1024 * 1024);
});

test("hidden 복귀는 simulation jump와 눌린 입력을 남기지 않는다", async ({ app, page }) => {
  await app.startGame();
  await page.locator("canvas").focus();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(120);
  const beforeHidden = await app.getSnapshot();

  await page.evaluate(() => {
    const browser = globalThis as typeof globalThis & {
      document: { dispatchEvent: (event: unknown) => boolean };
      Event: new (type: string) => unknown;
    };
    Object.defineProperty(browser.document, "visibilityState", { configurable: true, value: "hidden" });
    browser.document.dispatchEvent(new browser.Event("visibilitychange"));
  });
  await page.waitForTimeout(2_000);
  await page.evaluate(() => {
    const browser = globalThis as typeof globalThis & {
      document: { dispatchEvent: (event: unknown) => boolean };
      Event: new (type: string) => unknown;
    };
    Object.defineProperty(browser.document, "visibilityState", { configurable: true, value: "visible" });
    browser.document.dispatchEvent(new browser.Event("visibilitychange"));
  });
  await expect.poll(async () => (await app.getSnapshot()).phase).toBe("paused");
  const afterVisible = await app.getSnapshot();
  expect(afterVisible.normalElapsedMs - beforeHidden.normalElapsedMs).toBeLessThanOrEqual(100);

  await page.getByRole("button", { name: "계속하기" }).click();
  const releasedPosition = (await app.getSnapshot()).player.position.x;
  await page.waitForTimeout(200);
  expect((await app.getSnapshot()).player.position.x).toBeCloseTo(releasedPosition, 4);
  await page.keyboard.up("KeyD");
});

test("게임 start와 exit 5회 후 canvas, listener와 Blob URL이 누적되지 않는다", async ({ app, page }) => {
  await page.addInitScript(() => {
    const browser = globalThis as typeof globalThis & {
      URL: typeof URL;
      sessionStorage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
    };
    const metricsKey = "grill-us:e2e:url-metrics";
    const read = (): { created: number; revoked: number } => {
      const stored = browser.sessionStorage.getItem(metricsKey);
      return stored === null ? { created: 0, revoked: 0 } : JSON.parse(stored) as { created: number; revoked: number };
    };
    const write = (metrics: { created: number; revoked: number }): void => {
      browser.sessionStorage.setItem(metricsKey, JSON.stringify(metrics));
    };
    const createObjectUrl = browser.URL.createObjectURL.bind(browser.URL);
    const revokeObjectUrl = browser.URL.revokeObjectURL.bind(browser.URL);
    browser.URL.createObjectURL = (blob) => {
      const metrics = read();
      write({ ...metrics, created: metrics.created + 1 });
      return createObjectUrl(blob);
    };
    browser.URL.revokeObjectURL = (url) => {
      const metrics = read();
      write({ ...metrics, revoked: metrics.revoked + 1 });
      revokeObjectUrl(url);
    };
  });

  const listenerCounts: number[] = [];
  for (let iteration = 0; iteration < 5; iteration += 1) {
    await app.startGame();
    await expect(page.locator("canvas")).toHaveCount(1);
    listenerCounts.push((await readMetrics(page)).bridgeListenerCount);
    await page.getByRole("button", { name: "게임 나가기" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (globalThis as PerformanceWindow).__DEX_PERF__ === undefined)).toBe(true);
    await page.evaluate(() => {
      const browser = globalThis as typeof globalThis & { localStorage: { clear: () => void } };
      browser.localStorage.clear();
    });
  }

  expect(new Set(listenerCounts).size).toBe(1);
  await expect.poll(async () => {
    const metrics = await page.evaluate(() => {
      const browser = globalThis as typeof globalThis & {
        sessionStorage: { getItem: (key: string) => string | null };
      };
      const stored = browser.sessionStorage.getItem("grill-us:e2e:url-metrics");
      return stored === null ? null : JSON.parse(stored) as { created: number; revoked: number };
    });
    return metrics !== null && metrics.created >= 50 && metrics.revoked === metrics.created;
  }).toBe(true);
});