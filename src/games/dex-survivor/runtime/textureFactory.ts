import type Phaser from "phaser";

import type { GameProfileAssets, ProfileAsset } from "@/graph/types";

export const PROCEDURAL_TEXTURE_KEYS = {
  arena: "dex-arena-grid",
  player: "dex-player",
  projectile: "dex-projectile",
} as const;

function hashUserId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function profileTextureKey(userId: string): string {
  return `dex-profile-${hashUserId(userId)}`;
}

export function queueProfileTextures(scene: Phaser.Scene, assets: GameProfileAssets): readonly string[] {
  const queuedKeys: string[] = [];
  const uniqueAssets = new Map<string, ProfileAsset>();
  uniqueAssets.set(assets.player.userId, assets.player);
  for (const citizen of assets.citizens) {
    uniqueAssets.set(citizen.userId, citizen);
  }

  for (const asset of uniqueAssets.values()) {
    if (asset.objectUrl === null) {
      continue;
    }
    const key = profileTextureKey(asset.userId);
    if (!scene.textures.exists(key)) {
      scene.load.image(key, asset.objectUrl);
      queuedKeys.push(key);
    }
  }
  return queuedKeys;
}

export function createProceduralTextures(scene: Phaser.Scene): readonly string[] {
  const createdKeys: string[] = [];
  const create = (key: string, width: number, height: number, draw: (graphics: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) {
      return;
    }
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
    createdKeys.push(key);
  };

  create(PROCEDURAL_TEXTURE_KEYS.arena, 64, 64, (graphics) => {
    graphics.fillStyle(0x10171d, 1).fillRect(0, 0, 64, 64);
    graphics.lineStyle(1, 0x273944, 0.75).strokeRect(0, 0, 64, 64);
    graphics.fillStyle(0x1b2830, 0.8).fillCircle(32, 32, 2);
  });
  create(PROCEDURAL_TEXTURE_KEYS.player, 40, 40, (graphics) => {
    graphics.fillStyle(0x4dd5b8, 1).fillCircle(20, 20, 19);
    graphics.lineStyle(3, 0xffffff, 0.9).strokeCircle(20, 20, 17);
    graphics.fillStyle(0x151b21, 1).fillTriangle(20, 3, 29, 22, 11, 22);
  });
  create(PROCEDURAL_TEXTURE_KEYS.projectile, 10, 10, (graphics) => {
    graphics.fillStyle(0xffbd45, 1).fillCircle(5, 5, 4);
  });

  return createdKeys;
}