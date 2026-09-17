import { calculateScore } from "../src/games/dex-survivor/domain/score";
import type { RunResult } from "../src/games/dex-survivor/domain/types";
import type { LeaderboardSubmission } from "../src/shared/leaderboard";
import { expect, test } from "./fixtures/app";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

const clearSubmission: LeaderboardSubmission = {
  resultId: "70000000-0000-4000-8000-000000000001",
  outcome: "cleared",
  normalElapsedMs: 900_000,
  totalActiveMs: 1_110_000,
  enemyKills: 100,
  hitCount: 2,
  bossTimesMs: [60_000, 70_000, 80_000],
};

const defeatSubmission: LeaderboardSubmission = {
  resultId: "70000000-0000-4000-8000-000000000002",
  outcome: "defeated",
  normalElapsedMs: 600_000,
  totalActiveMs: 720_000,
  enemyKills: 20,
  hitCount: 3,
  bossTimesMs: [120_000, null, null],
};

async function submit(page: import("@playwright/test").Page, submission: LeaderboardSubmission): Promise<void> {
  const response = await page.request.post("/api/leaderboard/results", {
    headers: { Authorization: "Bearer e2e-api-token" },
    data: submission,
  });
  expect([200, 201]).toContain(response.status());
}

test("서버 계산 점수 순서와 공개 필드만 Top 10에 표시한다", async ({ app, page }, testInfo) => {
  await app.goto("/");
  await submit(page, defeatSubmission);
  await submit(page, clearSubmission);
  await page.goto("/games/leaderboard");

  const clearScore = calculateScore(clearSubmission);
  const defeatScore = calculateScore(defeatSubmission);
  const ranking = testInfo.project.name === "Mobile Chromium"
    ? page.locator("main ol").first()
    : page.locator("main table");
  await expect(ranking.getByText(clearScore.toLocaleString(), { exact: true })).toBeVisible();
  await expect(ranking.getByText(defeatScore.toLocaleString(), { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("e2e@example.invalid");
  await expect(page.locator("main")).not.toContainText(OWNER_ID);
});

test("network 실패 결과를 유지하고 수동 retry 후 제거한다", async ({ app, page }) => {
  const result: RunResult = {
    ...defeatSubmission,
    resultId: "70000000-0000-4000-8000-000000000003",
    ownerObjectId: OWNER_ID,
    score: calculateScore(defeatSubmission),
    completedAtEpochMs: 1_800_000_000_000,
  };
  await app.seedPendingResult(result);
  await page.route("**/api/leaderboard/results", (route) => route.abort("failed"));
  await app.goto("/games/leaderboard");
  await expect(page.getByRole("heading", { name: "제출 대기 결과" })).toBeVisible();
  await expect(page.getByText("연결이 복구되면 다시 시도할 수 있습니다.")).toBeVisible();

  await page.unroute("**/api/leaderboard/results");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "제출 대기 결과" })).toHaveCount(0);
});