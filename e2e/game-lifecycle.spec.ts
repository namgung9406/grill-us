import { expect, test } from "./fixtures/app";

test("게임 시작, 입력, 숨김 일시정지, 저장과 복원을 이어간다", async ({ app, page }, testInfo) => {
  await app.startGame();
  await expect(page.getByLabel("DEX Survivor 게임")).toBeVisible();
  await expect.poll(() => app.canvasHasPixels()).toBe(true);

  const beforeInput = await app.getSnapshot();
  if (testInfo.project.name === "Mobile Chromium") {
    const joystick = page.getByLabel("이동 조이스틱");
    const bounds = await joystick.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds !== null) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width, centerY);
      await page.waitForTimeout(180);
      await page.mouse.up();
    }
  } else {
    await page.locator("canvas").focus();
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(180);
    await page.keyboard.up("KeyD");
  }
  await expect.poll(async () => (await app.getSnapshot()).player.position.x).toBeGreaterThan(
    beforeInput.player.position.x,
  );

  await page.evaluate(() => {
    const browser = globalThis as typeof globalThis & {
      document: { dispatchEvent: (event: unknown) => boolean };
      Event: new (type: string) => unknown;
    };
    Object.defineProperty(browser.document, "visibilityState", { configurable: true, value: "hidden" });
    browser.document.dispatchEvent(new browser.Event("visibilitychange"));
  });
  await expect.poll(async () => (await app.getSnapshot()).phase).toBe("paused");
  await app.flushSave();
  const savedSessionId = (await app.getSnapshot()).sessionId;

  await page.reload();
  await expect(page.getByRole("button", { name: "계속하기" })).toBeVisible();
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect(page.getByRole("heading", { name: "출격 준비 완료" })).toBeVisible();
  await page.getByRole("button", { name: "게임 입장" }).click();
  await app.waitForGameBridge();
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect.poll(async () => (await app.getSnapshot()).sessionId).toBe(savedSessionId);
  await expect(page.getByText("BOSS RESUMING")).toBeVisible();
});

test("재시작과 나가기는 완료 결과를 만들지 않는다", async ({ app, page }) => {
  await app.startGame();
  const firstSessionId = (await app.getSnapshot()).sessionId;
  await page.getByRole("button", { name: "게임 일시정지" }).click();
  await page.getByRole("button", { name: "재시작" }).click();
  await page.getByRole("dialog", { name: "게임 재시작" }).getByRole("button", { name: "재시작" }).click();
  await app.waitForGameBridge();
  await expect.poll(async () => (await app.getSnapshot()).sessionId).not.toBe(firstSessionId);
  await page.getByRole("button", { name: "게임 일시정지" }).click();
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole("heading", { name: "제출 대기 결과" })).toHaveCount(0);
});