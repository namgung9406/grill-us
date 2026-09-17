import type Phaser from "phaser";

import { GAME_BALANCE } from "../../domain/constants";
import type { PlayerSnapshot } from "../../domain/types";
import { normalizeUpgradeLevels } from "../../domain/upgrades";

export interface PlayerAppearance {
  armorTint: number;
  gunTint: number;
  gunBarrelLength: number;
  swordBladeLength: number;
  swordTrailAlpha: number;
  dashTrailTint: number;
  dashTrailCount: number;
  corePulse: boolean;
}

function levelRatio(level: number, maximum: number): number {
  return maximum === 0 ? 0 : Math.min(1, Math.max(0, level / maximum));
}

export function applyAppearanceLevel(player: PlayerSnapshot): PlayerAppearance {
  const levels = normalizeUpgradeLevels(player.upgrades);
  const maximums = GAME_BALANCE.upgrades.maxLevels;
  const gunRatio = Math.max(
    levelRatio(levels.gunDamage, maximums.gunDamage),
    levelRatio(levels.gunRange, maximums.gunRange),
  );
  const swordRatio = levelRatio(levels.swordPower, maximums.swordPower);
  const dashRatio = Math.max(
    levelRatio(levels.dashCapacity, maximums.dashCapacity),
    levelRatio(levels.dashRecovery, maximums.dashRecovery),
  );
  const totalLevels = levels.gunDamage + levels.gunRange + levels.swordPower + levels.dashCapacity + levels.dashRecovery;
  const totalMaximum =
    maximums.gunDamage + maximums.gunRange + maximums.swordPower + maximums.dashCapacity + maximums.dashRecovery;

  return {
    armorTint: totalLevels === 0 ? 0xffffff : totalLevels === totalMaximum ? 0xffe082 : 0xb9f5e8,
    gunTint: gunRatio === 0 ? 0x8997a3 : gunRatio === 1 ? 0xffbd45 : 0x8ad8ff,
    gunBarrelLength: 12 + gunRatio * 12,
    swordBladeLength: 16 + swordRatio * 18,
    swordTrailAlpha: swordRatio * 0.7,
    dashTrailTint: dashRatio === 1 ? 0x4dd5b8 : 0x7b9aaa,
    dashTrailCount: dashRatio === 0 ? 0 : Math.max(1, Math.ceil(dashRatio * 3)),
    corePulse: player.ultimateCharge === GAME_BALANCE.player.ultimate.maxCharge,
  };
}

export class PlayerView {
  readonly object: Phaser.GameObjects.Container;
  readonly #body: Phaser.GameObjects.Image;
  readonly #gun: Phaser.GameObjects.Rectangle;
  readonly #sword: Phaser.GameObjects.Rectangle;
  readonly #swordTrail: Phaser.GameObjects.Arc;
  readonly #dashTrails: readonly Phaser.GameObjects.Arc[];
  readonly #core: Phaser.GameObjects.Arc;
  readonly #coreTween: Phaser.Tweens.Tween;

  public constructor(scene: Phaser.Scene, textureKey: string, player: PlayerSnapshot) {
    this.#body = scene.add.image(0, 0, textureKey).setDisplaySize(44, 44);
    this.#gun = scene.add.rectangle(10, 0, 12, 5, 0x8997a3).setOrigin(0, 0.5);
    this.#sword = scene.add.rectangle(-8, 0, 16, 4, 0xd9f2ff).setOrigin(1, 0.5).setRotation(-0.45);
    this.#swordTrail = scene.add.circle(-16, 0, 18, 0x8ad8ff, 0).setStrokeStyle(3, 0x8ad8ff, 0);
    this.#dashTrails = [1, 2, 3].map((index) => scene.add.circle(0, index * 8, 5 - index, 0x7b9aaa, 0.35));
    this.#core = scene.add.circle(0, 0, 6, 0xfff2a8).setVisible(false);
    this.object = scene.add.container(player.position.x, player.position.y, [
      ...this.#dashTrails,
      this.#body,
      this.#gun,
      this.#swordTrail,
      this.#sword,
      this.#core,
    ]);
    this.#coreTween = scene.tweens.add({ targets: this.#core, scale: 1.5, duration: 420, yoyo: true, repeat: -1, paused: true });
    this.sync(player);
  }

  public sync(player: PlayerSnapshot): void {
    const appearance = applyAppearanceLevel(player);
    this.object.setPosition(player.position.x, player.position.y);
    this.object.setRotation(player.facingRadians);
    this.object.setAlpha(player.invulnerableRemainingMs > 0 ? 0.68 : 1);
    this.#body.setTint(appearance.armorTint);
    this.#gun.setFillStyle(appearance.gunTint).setSize(appearance.gunBarrelLength, 5);
    this.#sword.setSize(appearance.swordBladeLength, 4);
    this.#swordTrail.setStrokeStyle(3, 0x8ad8ff, appearance.swordTrailAlpha);
    this.#dashTrails.forEach((trail, index) => {
      trail.setFillStyle(appearance.dashTrailTint, 0.35).setVisible(index < appearance.dashTrailCount);
    });
    this.#core.setVisible(appearance.corePulse);
    if (appearance.corePulse) {
      this.#coreTween.resume();
    } else {
      this.#coreTween.pause();
      this.#core.setScale(1);
    }
  }

  public destroy(): void {
    this.#coreTween.destroy();
    this.object.destroy(true);
  }
}