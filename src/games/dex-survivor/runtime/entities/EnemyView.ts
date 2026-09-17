import type Phaser from "phaser";

import { ENEMY_ARCHETYPES, enemyRadius } from "../../domain/enemies";
import type { EnemySnapshot, EnemyType } from "../../domain/types";

const ENEMY_COLORS: Record<EnemyType, number> = {
  chaser: 0xe85d75,
  ranged: 0xf2c14e,
  splitter: 0x8f6ad8,
  "splitter-small": 0xc89cff,
  tank: 0x5d7a8c,
};

export class EnemyView {
  readonly object: Phaser.GameObjects.Container;
  readonly #body: Phaser.GameObjects.Arc;
  readonly #healthBar: Phaser.GameObjects.Rectangle;

  public constructor(scene: Phaser.Scene, enemy: EnemySnapshot) {
    const radius = enemyRadius(enemy.type);
    this.#body = scene.add.circle(0, 0, radius, ENEMY_COLORS[enemy.type]);
    this.#body.setStrokeStyle(enemy.type === "tank" ? 4 : 2, 0xffffff, 0.8);
    const marker = scene.add.triangle(0, -radius / 2, 0, radius, radius / 2, 0, radius, radius, 0x172026);
    this.#healthBar = scene.add.rectangle(0, -radius - 7, radius * 2, 3, 0x4dd5b8).setOrigin(0.5);
    this.object = scene.add.container(enemy.position.x, enemy.position.y, [this.#body, marker, this.#healthBar]);
    this.sync(enemy);
  }

  public sync(enemy: EnemySnapshot): void {
    this.object.setPosition(enemy.position.x, enemy.position.y);
    if (enemy.velocity.x !== 0 || enemy.velocity.y !== 0) {
      this.object.setRotation(Math.atan2(enemy.velocity.y, enemy.velocity.x) + Math.PI / 2);
    }
    const hpRatio = Math.max(0, enemy.hp / ENEMY_ARCHETYPES[enemy.type].hp);
    this.#healthBar.setScale(hpRatio, 1).setVisible(hpRatio < 1);
    this.#body.setAlpha(enemy.hp > 0 ? 1 : 0);
  }

  public destroy(): void {
    this.object.destroy(true);
  }
}