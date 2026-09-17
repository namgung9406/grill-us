import { describe, expect, it } from "vitest";

import { ENEMY_ARCHETYPES } from "../../domain/enemies";
import type { RandomSource } from "../../domain/random";
import { EnemySystem } from "./EnemySystem";

class FixedRandom implements RandomSource {
  public next(): number {
    return 0;
  }

  public integer(min: number): number {
    return min;
  }

  public state(): number {
    return 1;
  }
}

describe("EnemySystem", () => {
  it("moves archetypes by role and fires ranged projectiles on an integer cooldown", () => {
    let nextId = 0;
    const system = new EnemySystem({ random: new FixedRandom(), createId: () => `enemy-${nextId++}` });
    const chaser = system.spawn("chaser", { x: 0, y: 0 });
    const ranged = system.spawn("ranged", { x: 320, y: 0 });
    expect(chaser).not.toBeNull();
    expect(ranged).not.toBeNull();

    system.step(1600, { phase: "boss1", normalElapsedMs: 0, playerPosition: { x: 0, y: 0 } });
    const snapshots = system.enemies;
    expect(snapshots.find(({ id }) => id === chaser?.id)?.position.x).toBe(0);
    expect(snapshots.find(({ id }) => id === ranged?.id)?.velocity).toEqual({ x: 0, y: 0 });

    const attack = system.step(0, { phase: "boss1", normalElapsedMs: 0, playerPosition: { x: 0, y: 0 } });
    expect(attack.projectiles).toHaveLength(0);
    const nextAttack = system.step(1600, { phase: "boss1", normalElapsedMs: 0, playerPosition: { x: 0, y: 0 } });
    expect(nextAttack.projectiles[0]).toMatchObject({ owner: "enemy", damage: 8, velocity: { x: -360, y: 0 } });
  });

  it("splits a splitter once and counts both normal and small enemy kills", () => {
    const system = new EnemySystem({ random: new FixedRandom() });
    const splitter = system.spawn("splitter", { x: 400, y: 300 });
    const split = system.damageEnemy(splitter?.id ?? "", ENEMY_ARCHETYPES.splitter.hp);

    expect(split.spawnedChildren).toHaveLength(3);
    expect(split.enemyKills).toBe(1);
    expect(split.spawnedChildren.every(({ type }) => type === "splitter-small")).toBe(true);

    const firstChild = split.spawnedChildren[0];
    if (firstChild === undefined) {
      throw new Error("splitter did not create its expected children");
    }
    const childDeath = system.damageEnemy(firstChild.id, ENEMY_ARCHETYPES["splitter-small"].hp);
    expect(childDeath.spawnedChildren).toHaveLength(0);
    expect(childDeath.enemyKills).toBe(2);
  });

  it("stops automatic boss-phase spawning and enforces the wave cap for summons", () => {
    const bossSystem = new EnemySystem({ random: new FixedRandom() });
    bossSystem.step(5000, { phase: "boss2", normalElapsedMs: 0, playerPosition: { x: 640, y: 360 } });
    expect(bossSystem.enemies).toHaveLength(0);

    for (let count = 0; count < 25; count += 1) {
      bossSystem.spawn("chaser", { x: -32, y: count * 10 });
    }
    expect(bossSystem.spawnSummoned("tank", { x: -32, y: 300 }, 0)).toBeNull();
  });

  it("keeps automatic spawns outside the arena and at least 240px from the player", () => {
    const system = new EnemySystem({ random: new FixedRandom() });
    system.step(0, { phase: "normal", normalElapsedMs: 0, playerPosition: { x: 0, y: 0 } });

    const spawned = system.enemies[0];
    expect(spawned).toBeDefined();
    expect(
      spawned?.position.x === -32 ||
        spawned?.position.x === 1312 ||
        spawned?.position.y === -32 ||
        spawned?.position.y === 752,
    ).toBe(true);
    expect(Math.hypot(spawned?.position.x ?? 0, spawned?.position.y ?? 0)).toBeGreaterThanOrEqual(240);
  });
});