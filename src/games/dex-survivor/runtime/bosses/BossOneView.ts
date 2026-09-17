import type Phaser from "phaser";

import { BOSS_ONE_BALANCE } from "../../domain/bosses";
import type { ActiveHazardSnapshot, BossOneSnapshot } from "../../domain/types";

interface TentacleObjects {
  arm: Phaser.GameObjects.Rectangle;
  joint: Phaser.GameObjects.Arc;
}

type ArcHazardSnapshot = Extract<ActiveHazardSnapshot, { kind: "boss1-sweep" | "boss2-mace" }>;
type BossOneSweepSnapshot = ArcHazardSnapshot & { kind: "boss1-sweep" };

function faceColor(seed: number, index: number): number {
  const colors = [0xe85d75, 0xf2c14e, 0x4dd5b8, 0x8ad8ff, 0xc89cff, 0x7b9aaa] as const;
  return colors[Math.abs((seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0) % colors.length] ?? colors[0];
}

export class BossOneView {
  readonly object: Phaser.GameObjects.Container;
  readonly #scene: Phaser.Scene;
  readonly #healthBar: Phaser.GameObjects.Rectangle;
  readonly #tentacles = new Map<string, TentacleObjects>();
  readonly #hazards = new Map<string, Phaser.GameObjects.Rectangle>();

  public constructor(scene: Phaser.Scene, boss: BossOneSnapshot, seed: number) {
    this.#scene = scene;
    const children: Phaser.GameObjects.GameObject[] = [];
    const body = scene.add.circle(0, 0, BOSS_ONE_BALANCE.radius, 0x202b33);
    body.setStrokeStyle(5, 0xffd166, 0.95);
    children.push(body);

    const tileSize = 48;
    for (let index = 0; index < 9; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = (column - 1) * tileSize;
      const y = (row - 1) * tileSize;
      const color = faceColor(seed, index);
      children.push(scene.add.rectangle(x, y, 44, 44, color).setStrokeStyle(2, 0x10171d, 0.9));
      const eyeOffset = 7 + ((seed + index) % 3);
      children.push(scene.add.circle(x - eyeOffset, y - 5, 3, 0x10171d));
      children.push(scene.add.circle(x + eyeOffset, y - 5, 3, 0x10171d));
      const smiling = ((seed >>> (index % 16)) & 1) === 1;
      children.push(scene.add.rectangle(x, y + 9, smiling ? 16 : 11, 3, 0x10171d));
    }

    const healthTrack = scene.add.rectangle(0, -BOSS_ONE_BALANCE.radius - 18, 180, 8, 0x10171d);
    this.#healthBar = scene.add.rectangle(-90, -BOSS_ONE_BALANCE.radius - 18, 180, 8, 0xe85d75).setOrigin(0, 0.5);
    children.push(healthTrack, this.#healthBar);
    this.object = scene.add.container(boss.position.x, boss.position.y, children).setDepth(6);

    for (const tentacle of boss.tentacles) {
      const midpoint = BOSS_ONE_BALANCE.radius + BOSS_ONE_BALANCE.sweepReach / 2;
      const arm = scene.add
        .rectangle(
          Math.cos(tentacle.angleRadians) * midpoint,
          Math.sin(tentacle.angleRadians) * midpoint,
          BOSS_ONE_BALANCE.sweepReach,
          14,
          0x8f6ad8,
        )
        .setRotation(tentacle.angleRadians);
      const joint = scene.add.circle(
        Math.cos(tentacle.angleRadians) * (BOSS_ONE_BALANCE.radius + BOSS_ONE_BALANCE.sweepReach),
        Math.sin(tentacle.angleRadians) * (BOSS_ONE_BALANCE.radius + BOSS_ONE_BALANCE.sweepReach),
        18,
        0xc89cff,
      );
      this.object.add([arm, joint]);
      this.#tentacles.set(tentacle.id, { arm, joint });
    }
    this.sync(boss, []);
  }

  public sync(boss: BossOneSnapshot, activeHazards: readonly ActiveHazardSnapshot[]): void {
    this.object.setPosition(boss.position.x, boss.position.y);
    this.#healthBar.setScale(Math.max(0, boss.hp / BOSS_ONE_BALANCE.hp), 1);
    for (const tentacle of boss.tentacles) {
      const objects = this.#tentacles.get(tentacle.id);
      if (objects) {
        objects.arm.setVisible(!tentacle.destroyed);
        objects.joint.setVisible(!tentacle.destroyed);
        const hpRatio = Math.max(0, tentacle.hp / BOSS_ONE_BALANCE.tentacleHp);
        objects.arm.setAlpha(0.35 + hpRatio * 0.65);
        objects.joint.setAlpha(0.35 + hpRatio * 0.65);
      }
    }

    const sweeps = activeHazards.filter(
      (hazard): hazard is BossOneSweepSnapshot => hazard.kind === "boss1-sweep",
    );
    const activeIds = new Set(sweeps.map(({ id }) => id));
    for (const [id, object] of this.#hazards) {
      if (!activeIds.has(id)) {
        object.destroy();
        this.#hazards.delete(id);
      }
    }
    for (const hazard of sweeps) {
      let object = this.#hazards.get(hazard.id);
      if (!object) {
        object = this.#scene.add.rectangle(0, 0, hazard.radius, 26, 0xffd166, 0.28).setOrigin(0, 0.5);
        this.object.add(object);
        this.#hazards.set(hazard.id, object);
      }
      object
        .setPosition(0, 0)
        .setRotation(hazard.angleRadians)
        .setSize(hazard.radius, 26)
        .setFillStyle(hazard.telegraphRemainingMs > 0 ? 0xffd166 : 0xe85d75, hazard.telegraphRemainingMs > 0 ? 0.28 : 0.6);
    }
  }

  public destroy(): void {
    this.#hazards.clear();
    this.#tentacles.clear();
    this.object.destroy(true);
  }
}