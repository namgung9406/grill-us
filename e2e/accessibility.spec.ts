import AxeBuilder from "@axe-core/playwright";

import { calculateScore } from "../src/games/dex-survivor/domain/score";
import type { RunResult } from "../src/games/dex-survivor/domain/types";
import { expect, test } from "./fixtures/app";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

async function expectNoSeriousViolations(page: import("@playwright/test").Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  const violations = result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations).toEqual([]);
}

test("주요 화면에 serious 또는 critical 접근성 위반이 없다", async ({ app, page }) => {
  await app.goto("/");
  await expectNoSeriousViolations(page);

  await app.goto("/games");
  await expectNoSeriousViolations(page);

  await app.goto("/games/dex-survivor");
  await page.getByRole("button", { name: "게임 시작" }).click();
  await expect(page.getByRole("heading", { name: "출격 준비 완료" })).toBeVisible({ timeout: 30_000 });
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "게임 입장" }).click();
  await app.waitForGameBridge();
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "게임 일시정지" }).click();
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "계속하기" }).click();
  await page.route("**/api/leaderboard/results", (route) => route.abort("failed"));
  await app.damagePlayer(1_000_000);
  await expect(page.getByLabel("게임 결과")).toContainText("패배");
  await expectNoSeriousViolations(page);

  await app.goto("/games/leaderboard");
  await expectNoSeriousViolations(page);
});

test("인증, 게임, pause와 pending 삭제를 keyboard-only로 조작한다", async ({ app, page }) => {
  await app.goto("/", false);
  const login = page.getByRole("button", { name: "게임 - 로그인 필요" });
  await login.focus();
  await page.keyboard.press("Enter");
  const gamesLink = page.getByRole("link", { name: "게임" });
  await expect(gamesLink).toBeVisible();
  await gamesLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/games$/);

  await page.getByRole("link", { name: "홈" }).focus();
  await page.keyboard.press("Enter");
  const logout = page.getByRole("button", { name: "로그아웃" });
  await logout.focus();
  await logout.press("Enter");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("grill-us:e2e:authenticated"))).toBe("false");
  const loginButton = page.getByRole("button", { name: "로그인", exact: true });
  await expect(loginButton).toBeVisible();

  await loginButton.focus();
  await page.keyboard.press("Enter");
  await app.goto("/games/dex-survivor");
  const start = page.getByRole("button", { name: "게임 시작" });
  await start.focus();
  await page.keyboard.press("Enter");
  const enter = page.getByRole("button", { name: "게임 입장" });
  await expect(enter).toBeVisible({ timeout: 30_000 });
  await enter.focus();
  await page.keyboard.press("Enter");
  await app.waitForGameBridge();

  const pause = page.getByRole("button", { name: "게임 일시정지" });
  await pause.focus();
  await page.keyboard.press("Enter");
  const pauseDialog = page.getByRole("dialog", { name: "일시정지" });
  await expect(pauseDialog.getByRole("button", { name: "계속하기" })).toBeFocused();
  await page.keyboard.press("Enter");

  const pendingResult: RunResult = {
    resultId: "71000000-0000-4000-8000-000000000001",
    ownerObjectId: OWNER_ID,
    outcome: "defeated",
    score: calculateScore({
      outcome: "defeated",
      enemyKills: 1,
      hitCount: 1,
      bossTimesMs: [null, null, null],
    }),
    normalElapsedMs: 60_000,
    totalActiveMs: 60_000,
    enemyKills: 1,
    hitCount: 1,
    bossTimesMs: [null, null, null],
    completedAtEpochMs: 1_800_000_000_000,
  };
  await app.seedPendingResult(pendingResult);
  await app.goto("/games/leaderboard");
  page.once("dialog", (dialog) => dialog.accept());
  const remove = page.getByRole("button", { name: "결과 71000000 삭제" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(remove).toHaveCount(0);
});