import { expect, test } from "./fixtures/app";

test("Home은 공개되고 보호 URL은 E2E 로그인 후 원래 위치를 유지한다", async ({ app, page }) => {
  await app.goto("/", false);
  await expect(page.getByRole("heading", { name: "게임을 준비하고 있습니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: "게임 - 로그인 필요" })).toBeVisible();

  await page.goto("/games");
  await expect(page.getByRole("heading", { name: "게임", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByText("E2E 플레이어", { exact: true })).toBeVisible();
});

test("리더보드 route가 게임 상세 route보다 우선한다", async ({ app, page }) => {
  await app.goto("/games/leaderboard");
  await expect(page.getByRole("heading", { name: "리더보드" })).toBeVisible();
  await expect(page.getByText("게임을 찾을 수 없습니다")).toHaveCount(0);
});

test("모바일 drawer는 Escape로 닫히고 toggle에 focus를 복원한다", async ({ app, page }, testInfo) => {
  test.skip(testInfo.project.name !== "Mobile Chromium");
  await app.goto("/");
  const toggle = page.getByRole("button", { name: "메뉴 열기" });
  await toggle.click();
  await expect(page.getByLabel("주 메뉴")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
});