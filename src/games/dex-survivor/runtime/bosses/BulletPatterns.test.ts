import { describe, expect, it } from "vitest";

import { GAME_BALANCE } from "../../domain/constants";
import { createSafeZone, spawnEdgeCompression, spawnRing } from "./BulletPatterns";

function idFactory(): () => string {
  let id = 0;
  return () => `projectile-${id++}`;
}

describe("BulletPatterns", () => {
  it("repeats ring angles and safe-zone positions for the same seed and pattern index", () => {
    const options = {
      origin: { x: 640, y: 360 },
      projectileCount: 24,
      speed: 130,
      damage: 10,
      seed: 12345,
      patternIndex: 7,
    };
    const first = spawnRing({ ...options, createId: idFactory() });
    const second = spawnRing({ ...options, createId: idFactory() });

    expect(first.map(({ velocity }) => velocity)).toEqual(second.map(({ velocity }) => velocity));
    expect(createSafeZone(12345, 7, 2)).toEqual(createSafeZone(12345, 7, 2));
    expect(createSafeZone(12345, 7, 0)).not.toEqual(createSafeZone(12345, 7, 1));
  });

  it("spawns all edge-compression shots from one opposite edge pair toward the arena", () => {
    const projectiles = spawnEdgeCompression({
      edges: "horizontal",
      projectileCount: GAME_BALANCE.bosses.bossThree.edgeCompression.projectileCount,
      speed: GAME_BALANCE.bosses.bossThree.edgeCompression.speed,
      damage: GAME_BALANCE.bosses.bossThree.edgeCompression.damage,
      createId: idFactory(),
    });

    expect(projectiles).toHaveLength(36);
    expect(projectiles.every(({ position }) => position.y === 0 || position.y === GAME_BALANCE.arena.height)).toBe(true);
    expect(projectiles.filter(({ position }) => position.y === 0).every(({ velocity }) => velocity.y > 0)).toBe(true);
    expect(projectiles.filter(({ position }) => position.y > 0).every(({ velocity }) => velocity.y < 0)).toBe(true);
  });
});