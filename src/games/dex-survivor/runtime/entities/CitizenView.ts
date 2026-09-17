import type Phaser from "phaser";

import { BOSS_ONE_BALANCE } from "../../domain/bosses";
import type { Vector2 } from "../../domain/types";

export class CitizenView {
  readonly object: Phaser.GameObjects.Container;
  #rescuing = false;
  #destroyed = false;

  public constructor(scene: Phaser.Scene, textureKey: string | null, position: Vector2) {
    const halo = scene.add.circle(0, 0, 30, 0x4dd5b8, 0.28).setStrokeStyle(2, 0xffffff, 0.85);
    const contents: Phaser.GameObjects.GameObject[] = [halo];
    if (textureKey !== null) {
      contents.push(scene.add.image(0, 0, textureKey).setDisplaySize(48, 48));
    } else {
      contents.push(scene.add.circle(0, 0, 23, 0x273944));
      contents.push(scene.add.rectangle(0, 0, 24, 7, 0x4dd5b8));
      contents.push(scene.add.rectangle(0, 0, 7, 24, 0x4dd5b8));
    }
    this.object = scene.add.container(position.x, position.y, contents).setDepth(7);
  }

  public sync(position: Vector2): void {
    if (!this.#rescuing) {
      this.object.setPosition(position.x, position.y);
    }
  }

  public rescue(scene: Phaser.Scene, onComplete: () => void): void {
    if (this.#rescuing || this.#destroyed) {
      return;
    }
    this.#rescuing = true;
    const label = scene.add
      .text(0, -42, "구출 완료", { color: "#ffffff", fontFamily: "sans-serif", fontSize: "14px" })
      .setOrigin(0.5);
    this.object.add(label);
    scene.tweens.add({
      targets: this.object,
      alpha: 0,
      y: this.object.y - 36,
      duration: BOSS_ONE_BALANCE.rescueEffectMs,
      onComplete: () => {
        this.destroy();
        onComplete();
      },
    });
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.object.destroy(true);
  }
}