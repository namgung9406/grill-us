import { expect, test } from "./fixtures/app";

test("세 보스의 단계와 클리어 결과를 순서대로 검증한다", async ({ app, page }) => {
  await app.startGame();

  await app.advanceNormalTo(300_000);
  await expect.poll(async () => (await app.getSnapshot()).phase).toBe("boss1");
  const killsBeforeRescue = (await app.getSnapshot()).enemyKills;
  await app.damageActiveBossPart(1_000_000);
  await expect.poll(async () => (await app.getSnapshot()).rescuedCitizenIds.length).toBe(1);
  expect((await app.getSnapshot()).enemyKills).toBe(killsBeforeRescue);
  await app.completeCurrentBoss();

  await app.advanceNormalTo(600_000);
  await expect.poll(async () => (await app.getSnapshot()).boss).toMatchObject({ kind: "boss2", stage: "shield" });
  await app.damageActiveBossPart(1_000_000);
  await expect.poll(async () => (await app.getSnapshot()).boss).toMatchObject({ kind: "boss2", stage: "mace-arm" });
  await app.damageActiveBossPart(1_000_000);
  await expect.poll(async () => (await app.getSnapshot()).boss).toMatchObject({ kind: "boss2", stage: "legs" });
  await app.completeCurrentBoss();

  await app.advanceNormalTo(900_000);
  await app.setBossHp(4_000);
  await expect.poll(async () => (await app.getSnapshot()).boss).toMatchObject({ kind: "boss3", phase: 2 });
  await app.setBossHp(800);
  await expect.poll(async () => (await app.getSnapshot()).phase).toBe("finale-adds");
  await app.completeCurrentBoss();
  await expect.poll(async () => (await app.getSnapshot()).boss).toMatchObject({ resumeCountdownMs: 3000 });
  await expect.poll(async () => (await app.getSnapshot()).phase, { timeout: 5_000 }).toBe("boss3");
  await app.completeCurrentBoss();

  await expect(page.getByLabel("게임 결과")).toContainText("클리어");
  await expect.poll(async () => (await app.getSnapshot()).phase).toBe("cleared");
});

test("플레이어 체력이 0이면 패배 결과가 생성된다", async ({ app, page }) => {
  await app.startGame();
  await page.waitForTimeout(5_100);
  await app.damagePlayer(1_000_000);
  await expect(page.getByLabel("게임 결과")).toContainText("패배");
});