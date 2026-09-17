import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { build } from "vite";
import { expect, test } from "@playwright/test";

const DIST_DIRECTORY = resolve("dist");
const PRODUCTION_OWNER_ID = "90000000-0000-4000-8000-000000000001";
const PRODUCTION_TENANT_ID = "90000000-0000-4000-8000-000000000002";
const PRODUCTION_CLIENT_ID = "90000000-0000-4000-8000-000000000003";

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveProductionAsset(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname.startsWith("/api/leaderboard")) {
    response.statusCode = 404;
    response.end();
    return;
  }

  const candidate = resolve(DIST_DIRECTORY, `.${decodeURIComponent(pathname)}`);
  let filePath = resolve(DIST_DIRECTORY, "index.html");
  if (candidate.startsWith(DIST_DIRECTORY)) {
    try {
      if ((await stat(candidate)).isFile()) {
        filePath = candidate;
      }
    } catch {
      // SPA routes fall back to index.html.
    }
  }
  response.setHeader("content-type", contentTypes[extname(filePath)] ?? "application/octet-stream");
  response.end(await readFile(filePath));
}

async function createProductionServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    void serveProductionAsset(request, response).catch(() => {
      response.statusCode = 500;
      response.end();
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function buildProductionBundle(): Promise<void> {
  const values: Readonly<Record<string, string>> = {
    VITE_ENTRA_CLIENT_ID: PRODUCTION_CLIENT_ID,
    VITE_ENTRA_TENANT_ID: PRODUCTION_TENANT_ID,
    VITE_ENTRA_REDIRECT_URI: "http://127.0.0.1",
    VITE_ENTRA_API_SCOPE: "",
    VITE_LEADERBOARD_ENABLED: "false",
    VITE_E2E_AUTH: "false",
  };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await build({ mode: "production", logLevel: "silent" });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("production bundle은 leaderboard와 E2E 인증 경계를 닫는다", async ({ page }) => {
  test.setTimeout(120_000);
  await buildProductionBundle();
  const { server, origin } = await createProductionServer();
  const leaderboardRequests: string[] = [];
  const loggedMessages: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/leaderboard")) {
      leaderboardRequests.push(request.url());
    }
  });
  page.on("console", (message) => loggedMessages.push(message.text()));

  try {
    await page.goto(origin);
    await expect(page.getByRole("link", { name: "리더보드" })).toHaveCount(0);
    expect(await page.evaluate(() => (globalThis as typeof globalThis & { __DEX_PERF__?: unknown }).__DEX_PERF__)).toBeUndefined();
    await page.evaluate((ownerObjectId) => {
      localStorage.setItem(
        `grill-us:dex-survivor:pending-results:v1:${encodeURIComponent(ownerObjectId)}`,
        JSON.stringify([{
          resultId: "90000000-0000-4000-8000-000000000004",
          ownerObjectId,
          outcome: "defeated",
          normalElapsedMs: 600_000,
          totalActiveMs: 720_000,
          enemyKills: 20,
          hitCount: 3,
          bossTimesMs: [120_000, null, null],
          score: 1_000,
          completedAtEpochMs: 1_800_000_000_000,
        }]),
      );
    }, PRODUCTION_OWNER_ID);
    await page.reload();
    await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
    expect(leaderboardRequests).toEqual([]);

    const response = await page.request.get(`${origin}/api/leaderboard`);
    expect(response.status()).toBe(404);

    const assets = await readdir(resolve(DIST_DIRECTORY, "assets"));
    const bundleText = (await Promise.all(
      assets.filter((name) => name.endsWith(".js")).map((name) => readFile(resolve(DIST_DIRECTORY, "assets", name), "utf8")),
    )).join("\n");
    const forbiddenValues = [
      "__DEX_E2E__",
      "E2E 플레이어",
      "e2e@example.invalid",
      "E2eAuthAdapter",
      "E2eGraphProfileService",
      "E2eGameBridge",
      "/games/leaderboard",
      "/api/leaderboard/results",
    ];
    expect(forbiddenValues.filter((forbidden) => bundleText.includes(forbidden))).toEqual([]);
    expect(loggedMessages.join("\n")).not.toMatch(/access.?token|blob:|e2e@example\.invalid|90000000-0000-4000-8000-000000000001/i);
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => error === undefined ? resolveClose() : reject(error));
    });
  }
});