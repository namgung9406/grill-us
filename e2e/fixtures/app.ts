import { expect, test as base, type Page } from "@playwright/test";

import type { GameState, RunResult } from "../../src/games/dex-survivor/domain/types";

const E2E_AUTHENTICATED_KEY = "grill-us:e2e:authenticated";
const E2E_USER_ID = "00000000-0000-4000-8000-000000000001";

interface BrowserGameApi {
  getSnapshot: () => GameState;
  advanceNormalTo: (targetElapsedMs: number) => void;
  setBossHp: (hp: number) => void;
  damageActiveBossPart: (amount: number) => void;
  damagePlayer: (amount: number) => void;
  completeCurrentBoss: () => void;
  flushSave: () => unknown;
}

type GameWindow = typeof globalThis & { __DEX_E2E__?: BrowserGameApi };

interface Canvas2dContextLike {
  getImageData: (x: number, y: number, width: number, height: number) => { data: Uint8ClampedArray };
}

interface WebGlContextLike {
  readonly RGBA: number;
  readonly UNSIGNED_BYTE: number;
  readPixels: (
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    pixels: Uint8Array,
  ) => void;
}

interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext: {
    (contextId: "2d"): Canvas2dContextLike | null;
    (contextId: "webgl" | "webgl2"): WebGlContextLike | null;
  };
}

export class AppDriver {
  public constructor(public readonly page: Page) {}

  public async goto(path: string, authenticated = true): Promise<void> {
    await this.page.addInitScript(
      ({ key, value }) => sessionStorage.setItem(key, value),
      { key: E2E_AUTHENTICATED_KEY, value: String(authenticated) },
    );
    await this.page.goto(path);
  }

  public async startGame(): Promise<void> {
    await this.goto("/games/dex-survivor");
    await this.page.getByRole("button", { name: "게임 시작" }).click();
    await expect(this.page.getByRole("heading", { name: "출격 준비 완료" })).toBeVisible({
      timeout: 30_000,
    });
    await this.page.getByRole("button", { name: "게임 입장" }).click();
    await this.waitForGameBridge();
  }

  public async waitForGameBridge(): Promise<void> {
    await this.page.waitForFunction(
      () => typeof (globalThis as GameWindow).__DEX_E2E__ === "object",
    );
  }

  public async getSnapshot(): Promise<GameState> {
    return this.page.evaluate(() => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      return api.getSnapshot();
    });
  }

  public async advanceNormalTo(targetElapsedMs: number): Promise<void> {
    await this.page.evaluate((value) => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      api.advanceNormalTo(value);
    }, targetElapsedMs);
  }

  public async setBossHp(hp: number): Promise<void> {
    await this.page.evaluate((value) => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      api.setBossHp(value);
    }, hp);
  }

  public async damageActiveBossPart(amount: number): Promise<void> {
    await this.page.evaluate((value) => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      api.damageActiveBossPart(value);
    }, amount);
  }

  public async damagePlayer(amount: number): Promise<void> {
    await this.page.evaluate((value) => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      api.damagePlayer(value);
    }, amount);
  }

  public async completeCurrentBoss(): Promise<void> {
    await this.page.evaluate(() => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      api.completeCurrentBoss();
    });
  }

  public async flushSave(): Promise<void> {
    await this.page.evaluate(() => {
      const api = (globalThis as GameWindow).__DEX_E2E__;
      if (api === undefined) throw new Error("DEX E2E bridge가 설치되지 않았습니다.");
      api.flushSave();
    });
  }

  public async canvasHasPixels(): Promise<boolean> {
    return this.page.locator("canvas").evaluate((element) => {
      const canvas = element as unknown as CanvasLike;
      const context2d = canvas.getContext("2d");
      if (context2d !== null) {
        return context2d.getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0);
      }
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (context === null) {
        return false;
      }
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
      return pixels.some((value) => value !== 0);
    });
  }

  public async seedPendingResult(result: RunResult): Promise<void> {
    await this.page.addInitScript(
      ({ ownerObjectId, pendingResult }) => {
        localStorage.setItem(
          `grill-us:dex-survivor:pending-results:v1:${encodeURIComponent(ownerObjectId)}`,
          JSON.stringify([pendingResult]),
        );
      },
      { ownerObjectId: E2E_USER_ID, pendingResult: result },
    );
  }
}

interface AppFixtures {
  app: AppDriver;
  browserErrorGuard: void;
  externalNetworkGuard: void;
}

export const test = base.extend<AppFixtures>({
  browserErrorGuard: [
    async ({ page }, provide) => {
      const browserErrors: string[] = [];
      page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && message.text() !== "Failed to load resource: net::ERR_FAILED") {
          browserErrors.push(message.text());
        }
      });

      await provide();
      expect(browserErrors, "브라우저 실행 중 처리되지 않은 오류가 발생했습니다.").toEqual([]);
    },
    { auto: true },
  ],
  externalNetworkGuard: [
    async ({ context }, provide) => {
      const blockedRequests: string[] = [];
      await context.route("**/*", async (route) => {
        const hostname = new URL(route.request().url()).hostname;
        if (hostname === "login.microsoftonline.com" || hostname === "graph.microsoft.com") {
          blockedRequests.push(route.request().url());
          await route.abort();
          return;
        }
        await route.continue();
      });

      await provide();
      expect(blockedRequests, "E2E 중 Microsoft 인증 또는 Graph 요청이 발생했습니다.").toEqual([]);
    },
    { auto: true },
  ],
  app: async ({ page }, provide) => {
    await provide(new AppDriver(page));
  },
});

export { expect } from "@playwright/test";