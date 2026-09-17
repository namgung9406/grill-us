import type Phaser from "phaser";

import {
  BOSS_TWO_BALANCE,
  BOSS_TWO_PART_LAYOUT,
  activeBossTwoParts,
  type BossTwoPartKey,
} from "../../domain/bosses";
import type { ActiveHazardSnapshot, BossTwoSnapshot } from "../../domain/types";

type PartShape = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc;
type ArcHazard = Extract<ActiveHazardSnapshot, { kind: "boss1-sweep" | "boss2-mace" }>;
type MaceHazard = ArcHazard & { kind: "boss2-mace" };
type ShockwaveHazard = Extract<ActiveHazardSnapshot, { kind: "boss2-shockwave" }>;

const PART_MAX_HP = BOSS_TWO_BALANCE.partHp;

export class BossTwoView {
  readonly object: Phaser.GameObjects.Container;
  readonly label: Phaser.GameObjects.Text;
  readonly #scene: Phaser.Scene;
  readonly #parts = new Map<BossTwoPartKey, PartShape>();
  readonly #maceHazards = new Map<string, Phaser.GameObjects.Rectangle>();
  readonly #shockwaveHazards = new Map<string, Phaser.GameObjects.Arc>();
  readonly #healthBar: Phaser.GameObjects.Rectangle;
  readonly #maceHead: Phaser.GameObjects.Arc;

  public constructor(scene: Phaser.Scene, boss: BossTwoSnapshot) {
    this.#scene = scene;
    const body = scene.add.rectangle(0, 0, 184, 142, 0x17242c).setStrokeStyle(5, 0x71808a, 1);
    const roof = scene.add.rectangle(0, -86, 214, 34, 0x283942).setStrokeStyle(4, 0x71808a, 1);
    const shield = scene.add
      .rectangle(
        BOSS_TWO_PART_LAYOUT.shield.offset.x,
        BOSS_TWO_PART_LAYOUT.shield.offset.y,
        64,
        126,
        0x31586b,
      )
      .setStrokeStyle(4, 0x71808a, 1);
    const maceArm = scene.add
      .rectangle(
        BOSS_TWO_PART_LAYOUT.maceArm.offset.x,
        BOSS_TWO_PART_LAYOUT.maceArm.offset.y,
        82,
        28,
        0x7d4650,
      )
      .setStrokeStyle(4, 0x71808a, 1);
    this.#maceHead = scene.add.circle(162, -4, 30, 0x943e4d).setStrokeStyle(4, 0xc7727f, 1);
    const leftLeg = scene.add
      .rectangle(
        BOSS_TWO_PART_LAYOUT.leftLeg.offset.x,
        BOSS_TWO_PART_LAYOUT.leftLeg.offset.y,
        58,
        92,
        0x34454e,
      )
      .setStrokeStyle(4, 0x71808a, 1);
    const rightLeg = scene.add
      .rectangle(
        BOSS_TWO_PART_LAYOUT.rightLeg.offset.x,
        BOSS_TWO_PART_LAYOUT.rightLeg.offset.y,
        58,
        92,
        0x34454e,
      )
      .setStrokeStyle(4, 0x71808a, 1);
    const core = scene.add
      .rectangle(0, 0, 164, 120, 0x102027)
      .setStrokeStyle(4, 0x71808a, 1);

    this.label = scene.add
      .text(0, 0, "동그라미\n재단", {
        align: "center",
        color: "#ffffff",
        fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        fontSize: "52px",
        fontStyle: "bold",
        lineSpacing: -12,
        stroke: "#081015",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setResolution(Math.max(2, globalThis.devicePixelRatio ?? 1));

    const healthTrack = scene.add.rectangle(0, -126, 210, 10, 0x081015);
    this.#healthBar = scene.add.rectangle(-105, -126, 210, 10, 0xffbf47).setOrigin(0, 0.5);
    this.object = scene.add
      .container(boss.position.x, boss.position.y, [
        roof,
        body,
        leftLeg,
        rightLeg,
        maceArm,
        this.#maceHead,
        shield,
        core,
        this.label,
        healthTrack,
        this.#healthBar,
      ])
      .setDepth(6);
    this.#parts.set("shield", shield);
    this.#parts.set("maceArm", maceArm);
    this.#parts.set("leftLeg", leftLeg);
    this.#parts.set("rightLeg", rightLeg);
    this.#parts.set("core", core);
    this.sync(boss, []);
  }

  public sync(boss: BossTwoSnapshot, activeHazards: readonly ActiveHazardSnapshot[]): void {
    this.object.setPosition(boss.position.x, boss.position.y);
    const activeParts = activeBossTwoParts(boss);
    for (const [part, object] of this.#parts) {
      const destroyed = boss.parts[part].destroyed;
      object.setVisible(!destroyed);
      object.setAlpha(destroyed ? 0 : 0.55 + (boss.parts[part].hp / PART_MAX_HP[part]) * 0.45);
      object.setStrokeStyle(activeParts.includes(part) ? 7 : 4, activeParts.includes(part) ? 0xffbf47 : 0x71808a, 1);
    }
    const maceActive = activeParts.includes("maceArm");
    this.#maceHead
      .setVisible(!boss.parts.maceArm.destroyed)
      .setAlpha(0.55 + (boss.parts.maceArm.hp / PART_MAX_HP.maceArm) * 0.45)
      .setStrokeStyle(maceActive ? 7 : 4, maceActive ? 0xffbf47 : 0xc7727f, 1);
    this.label.setVisible(!boss.parts.core.destroyed);

    const activeHp = activeParts.reduce((total, part) => total + boss.parts[part].hp, 0);
    const activeMaxHp = activeParts.reduce((total, part) => total + PART_MAX_HP[part], 0);
    this.#healthBar.setScale(activeMaxHp === 0 ? 0 : activeHp / activeMaxHp, 1);
    this.#syncMaceHazards(activeHazards);
    this.#syncShockwaveHazards(activeHazards);
  }

  public showBlocked(part: BossTwoPartKey): void {
    const layout = BOSS_TWO_PART_LAYOUT[part];
    const feedback = this.#scene.add
      .text(layout.offset.x, layout.offset.y - layout.radius - 18, "BLOCKED", {
        color: "#ffcf66",
        fontFamily: "sans-serif",
        fontSize: "20px",
        fontStyle: "bold",
        stroke: "#10171d",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.object.add(feedback);
    this.#scene.tweens.add({
      targets: feedback,
      alpha: 0,
      y: feedback.y - 22,
      duration: 420,
      onComplete: () => feedback.destroy(),
    });
  }

  #syncMaceHazards(activeHazards: readonly ActiveHazardSnapshot[]): void {
    const hazards = activeHazards.filter((hazard): hazard is MaceHazard => hazard.kind === "boss2-mace");
    const activeIds = new Set(hazards.map(({ id }) => id));
    for (const [id, object] of this.#maceHazards) {
      if (!activeIds.has(id)) {
        object.destroy();
        this.#maceHazards.delete(id);
      }
    }
    for (const hazard of hazards) {
      let object = this.#maceHazards.get(hazard.id);
      if (!object) {
        object = this.#scene.add.rectangle(0, 0, hazard.radius, 34, 0xffbf47, 0.28).setOrigin(0, 0.5).setDepth(5);
        this.#maceHazards.set(hazard.id, object);
      }
      object
        .setPosition(hazard.origin.x, hazard.origin.y)
        .setRotation(hazard.angleRadians)
        .setSize(hazard.radius, 34)
        .setFillStyle(hazard.telegraphRemainingMs > 0 ? 0xffbf47 : 0xe65c62, hazard.telegraphRemainingMs > 0 ? 0.28 : 0.62);
    }
  }

  #syncShockwaveHazards(activeHazards: readonly ActiveHazardSnapshot[]): void {
    const hazards = activeHazards.filter(
      (hazard): hazard is ShockwaveHazard => hazard.kind === "boss2-shockwave",
    );
    const activeIds = new Set(hazards.map(({ id }) => id));
    for (const [id, object] of this.#shockwaveHazards) {
      if (!activeIds.has(id)) {
        object.destroy();
        this.#shockwaveHazards.delete(id);
      }
    }
    for (const hazard of hazards) {
      let object = this.#shockwaveHazards.get(hazard.id);
      if (!object) {
        object = this.#scene.add.circle(hazard.origin.x, hazard.origin.y, Math.max(2, hazard.radius), 0x000000, 0).setDepth(5);
        this.#shockwaveHazards.set(hazard.id, object);
      }
      object
        .setPosition(hazard.origin.x, hazard.origin.y)
        .setRadius(Math.max(2, hazard.radius))
        .setStrokeStyle(hazard.telegraphRemainingMs > 0 ? 3 : 6, hazard.telegraphRemainingMs > 0 ? 0xffbf47 : 0x70d7ff, 0.8);
    }
  }

  public destroy(): void {
    for (const hazard of this.#maceHazards.values()) {
      hazard.destroy();
    }
    for (const hazard of this.#shockwaveHazards.values()) {
      hazard.destroy();
    }
    this.#maceHazards.clear();
    this.#shockwaveHazards.clear();
    this.#parts.clear();
    this.object.destroy(true);
  }
}