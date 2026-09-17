import { expect, test } from "./fixtures/app";

test("E2E 인증과 프로필 fixture가 Microsoft 외부 요청 없이 동작한다", async ({ app, page }) => {
  await app.startGame();
  await expect(page.getByLabel("주 메뉴").getByText("E2E 플레이어", { exact: true })).toBeAttached();
  await expect(page.locator("canvas")).toBeVisible();
});