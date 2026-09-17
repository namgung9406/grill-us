import { describe, expect, it } from "vitest";

import { BOSS_TWO_BALANCE, createBossTwoState } from "../../domain/bosses";
import { GAME_BALANCE } from "../../domain/constants";
import type { PlayerSnapshot } from "../../domain/types";
import { EnemySystem } from "../systems/EnemySystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { BossTwoSystem, bossTwoMoveSpeed, bossTwoTargetId } from "./BossTwoSystem";

function damagePart(system: BossTwoSystem, part: Parameters<typeof bossTwoTargetId>[0], damage: number) {
  return system.damageTarget(bossTwoTargetId(part), damage);
}

function createPlayer(): PlayerSnapshot {
  return {
    position: { x: 640, y: 360 },
    velocity: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    facingRadians: 0,
    dashCharges: 1,
    dashRecoveryRemainingMs: [],
    dashRemainingMs: 0,
    invulnerableRemainingMs: 0,
    gunCooldownMs: 0,
    swordCooldownMs: 0,
    swordActiveRemainingMs: 0,
    swordStormCooldownMs: 0,
    swordStormActiveRemainingMs: 0,
    ultimateCharge: 0,
    ultimateChargeTickRemainderMs: 0,
    upgrades: { gunDamage: 0, gunRange: 0, swordPower: 0, dashCapacity: 0, dashRecovery: 0 },
  };
}

describe("BossTwoSystem", () => {
  it("blocks out-of-order parts and accepts either leg order before the core", () => {
    const system = new BossTwoSystem({ boss: createBossTwoState() });

    expect(damagePart(system, "core", 100)).toMatchObject({ appliedDamage: 0, blocked: true });
    expect(damagePart(system, "shield", BOSS_TWO_BALANCE.partHp.shield).boss.stage).toBe("mace-arm");
    expect(damagePart(system, "leftLeg", 100)).toMatchObject({ appliedDamage: 0, blocked: true });
    expect(damagePart(system, "maceArm", BOSS_TWO_BALANCE.partHp.maceArm).boss.stage).toBe("legs");
    expect(damagePart(system, "rightLeg", BOSS_TWO_BALANCE.partHp.rightLeg).boss.stage).toBe("legs");
    expect(damagePart(system, "leftLeg", BOSS_TWO_BALANCE.partHp.leftLeg).boss.stage).toBe("core");
    expect(damagePart(system, "core", BOSS_TWO_BALANCE.partHp.core)).toMatchObject({
      appliedDamage: BOSS_TWO_BALANCE.partHp.core,
      completed: true,
      boss: { stage: "defeated" },
    });
  });

  it("intercepts body projectiles with the shield and weakens attacks and movement by destroyed part", () => {
    const boss = createBossTwoState();
    const system = new BossTwoSystem({ boss });
    expect(system.projectileTarget(boss.position, 5)?.part).toBe("shield");

    const opening = system.step(0, { x: boss.position.x + 300, y: boss.position.y });
    expect(opening.summons).toHaveLength(BOSS_TWO_BALANCE.summonBeforeShieldDestroyed.count);
    expect(opening.activeHazards.map(({ kind }) => kind).sort()).toEqual(["boss2-mace", "boss2-shockwave"]);
    expect(system.moveSpeed).toBe(BOSS_TWO_BALANCE.moveSpeed);

    damagePart(system, "shield", BOSS_TWO_BALANCE.partHp.shield);
    damagePart(system, "maceArm", BOSS_TWO_BALANCE.partHp.maceArm);
    expect(system.activeHazards.some(({ kind }) => kind === "boss2-mace")).toBe(false);
    damagePart(system, "leftLeg", BOSS_TWO_BALANCE.partHp.leftLeg);
    expect(system.moveSpeed).toBe(BOSS_TWO_BALANCE.oneLegMoveSpeed);
    damagePart(system, "rightLeg", BOSS_TWO_BALANCE.partHp.rightLeg);
    expect(system.moveSpeed).toBe(0);
    expect(system.activeHazards.some(({ kind }) => kind === "boss2-shockwave")).toBe(false);
  });

  it("routes summon requests through EnemySystem.spawnSummoned so the wave cap wins", () => {
    const enemies = new EnemySystem({
      random: { next: () => 0, integer: (minimum) => minimum, state: () => 1 },
    });
    let filledCount = 0;
    while (enemies.spawnSummoned("chaser", { x: 0, y: 0 }, 600_000) !== null) {
      filledCount += 1;
    }
    const system = new BossTwoSystem({ boss: createBossTwoState() });
    const requests = system.step(0, { x: 1000, y: 360 }).summons;

    const spawned = requests.map(({ position }) => enemies.spawnSummoned("chaser", position, 600_000));
    expect(spawned.every((enemy) => enemy === null)).toBe(true);
    expect(enemies.enemies).toHaveLength(filledCount);
    expect(filledCount).toBe(GAME_BALANCE.waves.preHordeEnemyCap - 15);
  });

  it("keeps shockwave damage on PlayerSystem.takeDamage so dash invulnerability applies", () => {
    const playerSystem = new PlayerSystem(createPlayer());
    playerSystem.step(0, {
      move: { x: 1, y: 0 },
      aimWorld: null,
      shoot: false,
      sword: false,
      dashPressed: true,
      swordStormPressed: false,
      ultimatePressed: false,
    });

    const damage = playerSystem.takeDamage(BOSS_TWO_BALANCE.shockwaveDamage);
    expect(damage.applied).toBe(false);
    expect(damage.player.hp).toBe(100);
  });

  it("restores every stage and cooldown with identical next attack timing", () => {
    const snapshots = [
      createBossTwoState(),
      { ...createBossTwoState(), stage: "mace-arm" as const, parts: { ...createBossTwoState().parts, shield: { hp: 0, destroyed: true } } },
      {
        ...createBossTwoState(),
        stage: "legs" as const,
        parts: {
          ...createBossTwoState().parts,
          shield: { hp: 0, destroyed: true },
          maceArm: { hp: 0, destroyed: true },
        },
      },
      {
        ...createBossTwoState(),
        stage: "core" as const,
        parts: {
          ...createBossTwoState().parts,
          shield: { hp: 0, destroyed: true },
          maceArm: { hp: 0, destroyed: true },
          leftLeg: { hp: 0, destroyed: true },
          rightLeg: { hp: 0, destroyed: true },
        },
      },
    ];

    for (const snapshot of snapshots) {
      const saved = { ...snapshot, attackCooldownMs: 101, summonCooldownMs: 202, shockwaveCooldownMs: 303 };
      const original = new BossTwoSystem({ boss: saved });
      const restored = new BossTwoSystem({ boss: structuredClone(saved) });
      expect(restored.step(100, { x: 900, y: 360 })).toEqual(original.step(100, { x: 900, y: 360 }));
      expect(bossTwoMoveSpeed(restored.boss)).toBe(bossTwoMoveSpeed(original.boss));
    }
  });
});