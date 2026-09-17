import type Phaser from "phaser";

import { BOSS_THREE_BALANCE } from "../../domain/bosses";
import type { ActiveHazardSnapshot, BossThreeSnapshot } from "../../domain/types";
import { createSafeZone } from "./BulletPatterns";

export class BossThreeView {
  readonly object: Phaser.GameObjects.Container;
  readonly label: Phaser.GameObjects.Text;
  readonly #seed: number;
  readonly #core: Phaser.GameObjects.Graphics;
  readonly #cracks: Phaser.GameObjects.Graphics;
  readonly #fragments: readonly Phaser.GameObjects.Rectangle[];
  readonly #healthBar: Phaser.GameObjects.Rectangle;
  readonly #patternTelegraph: Phaser.GameObjects.Arc;
  readonly #aimTelegraph: Phaser.GameObjects.Graphics;
  readonly #hazards: Phaser.GameObjects.Graphics;

  public constructor(scene: Phaser.Scene, boss: BossThreeSnapshot, seed: number) {
    this.#seed = seed;
    const ship = scene.add.graphics();
    ship.fillStyle(0x172532, 1);
    ship.fillPoints([
      { x: -172, y: 0 }, { x: -86, y: -70 }, { x: -40, y: -38 }, { x: 0, y: -72 },
      { x: 40, y: -38 }, { x: 86, y: -70 }, { x: 172, y: 0 }, { x: 86, y: 70 },
      { x: 40, y: 38 }, { x: 0, y: 72 }, { x: -40, y: 38 }, { x: -86, y: 70 },
    ], true);
    ship.lineStyle(5, 0x8ad8ff, 0.95);
    ship.strokePoints([
      { x: -172, y: 0 }, { x: -86, y: -70 }, { x: -40, y: -38 }, { x: 0, y: -72 },
      { x: 40, y: -38 }, { x: 86, y: -70 }, { x: 172, y: 0 }, { x: 86, y: 70 },
      { x: 40, y: 38 }, { x: 0, y: 72 }, { x: -40, y: 38 }, { x: -86, y: 70 },
    ], true);
    ship.fillStyle(0x29465a, 1);
    ship.fillTriangle(-164, 0, -76, -56, -76, 56);
    ship.fillTriangle(164, 0, 76, -56, 76, 56);

    this.#core = scene.add.graphics();
    this.#drawCore();
    this.#cracks = scene.add.graphics();
    this.#cracks.lineStyle(3, 0xff6b79, 0.95);
    this.#cracks.lineBetween(-52, -27, -18, -4);
    this.#cracks.lineBetween(52, 28, 18, 4);
    this.#cracks.lineBetween(-34, 39, -10, 15);

    this.label = scene.add
      .text(0, 0, "DEX", {
        color: "#ffffff",
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: "42px",
        fontStyle: "bold",
        stroke: "#081015",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setResolution(Math.max(2, globalThis.devicePixelRatio ?? 1));

    this.#fragments = [-1, 1].flatMap((side) => [
      scene.add.rectangle(side * 118, -72, 18, 8, 0xff6b79).setRotation(side * 0.35),
      scene.add.rectangle(side * 136, 66, 13, 7, 0x8ad8ff).setRotation(side * -0.55),
    ]);
    const healthTrack = scene.add.rectangle(0, -112, 260, 10, 0x081015);
    this.#healthBar = scene.add.rectangle(-130, -112, 260, 10, 0xff6b79).setOrigin(0, 0.5);
    this.#patternTelegraph = scene.add.circle(0, 0, 116, 0x000000, 0).setStrokeStyle(4, 0xffd166, 0.8);
    this.#aimTelegraph = scene.add.graphics();
    this.object = scene.add
      .container(boss.position.x, boss.position.y, [
        this.#patternTelegraph,
        this.#aimTelegraph,
        ship,
        this.#cracks,
        ...this.#fragments,
        this.#core,
        this.label,
        healthTrack,
        this.#healthBar,
      ])
      .setDepth(6);
    this.#hazards = scene.add.graphics().setDepth(4);
    this.sync(boss, []);
  }

  public sync(
    boss: BossThreeSnapshot,
    activeHazards: readonly ActiveHazardSnapshot[],
    playerPosition: { x: number; y: number } | null = null,
  ): void {
    const visible = boss.phase !== "hidden" && boss.hp > 0;
    this.object.setVisible(visible).setPosition(boss.position.x, boss.position.y);
    if (!visible) {
      this.#hazards.clear();
      return;
    }
    this.#core.rotation += boss.phase === 2 ? 0.045 : 0.02;
    this.#healthBar.setScale(Math.max(0, boss.hp / BOSS_THREE_BALANCE.hp), 1);
    this.#cracks.setVisible(boss.phase === 2);
    this.#fragments.forEach((fragment, index) => {
      fragment.setVisible(boss.phase === 2);
      fragment.rotation += (index % 2 === 0 ? 1 : -1) * 0.025;
    });
    const telegraphVisible = boss.patternCooldownMs <= BOSS_THREE_BALANCE.minimumTelegraphMs;
    const ringIsNext = boss.phase === 1 ? boss.patternIndex % 2 === 0 : boss.patternIndex % 2 === 0;
    const aimedIsNext = boss.phase === 1 ? boss.patternIndex % 2 === 1 : boss.patternIndex % 2 === 0;
    this.#patternTelegraph
      .setVisible(telegraphVisible && ringIsNext)
      .setAlpha(0.35 + 0.45 * (1 - boss.patternCooldownMs / BOSS_THREE_BALANCE.minimumTelegraphMs));
    this.#aimTelegraph.clear();
    if (telegraphVisible && aimedIsNext && playerPosition !== null) {
      this.#aimTelegraph.lineStyle(5, 0xffd166, 0.65);
      this.#aimTelegraph.lineBetween(0, 0, playerPosition.x - boss.position.x, playerPosition.y - boss.position.y);
    }
    this.#drawHazards(boss, activeHazards);
  }

  #drawCore(): void {
    this.#core.clear();
    this.#core.fillStyle(0x4dd5b8, 0.92);
    this.#core.fillTriangle(0, -50, -43, 25, 0, 12);
    this.#core.fillStyle(0x8ad8ff, 0.92);
    this.#core.fillTriangle(0, -50, 43, 25, 0, 12);
    this.#core.fillStyle(0x237c83, 0.95);
    this.#core.fillTriangle(-43, 25, 43, 25, 0, 12);
    this.#core.fillStyle(0x123d4a, 1);
    this.#core.fillTriangle(-43, 25, 43, 25, 0, 52);
    this.#core.lineStyle(3, 0xffffff, 0.85);
    this.#core.strokePoints([{ x: 0, y: -50 }, { x: 43, y: 25 }, { x: 0, y: 52 }, { x: -43, y: 25 }], true);
  }

  #drawHazards(boss: BossThreeSnapshot, activeHazards: readonly ActiveHazardSnapshot[]): void {
    this.#hazards.clear();
    for (const hazard of activeHazards) {
      if (hazard.kind === "boss3-edge") {
        this.#hazards.lineStyle(8, 0xff6b79, 0.35);
        if (hazard.edges === "horizontal") {
          this.#hazards.lineBetween(0, 4, 1280, 4).lineBetween(0, 716, 1280, 716);
        } else {
          this.#hazards.lineBetween(4, 0, 4, 720).lineBetween(1276, 0, 1276, 720);
        }
      }
      if (hazard.kind === "boss3-safe-zone") {
        const patternIndex = Math.max(0, boss.patternIndex - 1);
        const path = Array.from({ length: BOSS_THREE_BALANCE.safeZone.positionCount }, (_, index) =>
          createSafeZone(this.#seed, patternIndex, index),
        );
        this.#hazards.lineStyle(3, 0x4dd5b8, 0.45);
        this.#hazards.strokePoints(path, false);
        this.#hazards.lineStyle(hazard.telegraphRemainingMs > 0 ? 4 : 7, 0x4dd5b8, 0.85);
        this.#hazards.strokeCircle(hazard.center.x, hazard.center.y, hazard.radius);
      }
    }
  }

  public destroy(): void {
    this.#hazards.destroy();
    this.object.destroy(true);
  }
}