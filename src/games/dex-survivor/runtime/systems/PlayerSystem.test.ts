import { describe, expect, it } from "vitest";

import { GAME_BALANCE } from "../../domain/constants";
import type { PlayerSnapshot } from "../../domain/types";
import { createEmptyInputFrame } from "../input/types";
import { PlayerSystem } from "./PlayerSystem";

function createPlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
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
    ...overrides,
  };
}

describe("PlayerSystem", () => {
  it("enforces gun interval and sword arc/cooldown", () => {
    const system = new PlayerSystem(createPlayer());
    const attack = { ...createEmptyInputFrame(), shoot: true, sword: true, aimWorld: { x: 700, y: 360 } };

    const first = system.step(0, attack);
    expect(first.actions.map(({ type }) => type)).toEqual(["gun", "sword"]);
    expect(first.actions[1]).toMatchObject({
      type: "sword",
      damage: GAME_BALANCE.player.sword.damage,
      range: GAME_BALANCE.player.sword.range,
      arcRadians: (GAME_BALANCE.player.sword.arcDegrees * Math.PI) / 180,
    });

    expect(system.step(179, attack).actions).toHaveLength(0);
    expect(system.step(1, attack).actions.map(({ type }) => type)).toEqual(["gun"]);
    expect(system.step(270, attack).actions.map(({ type }) => type)).toEqual(["gun", "sword"]);
  });

  it("moves a dash 220px, grants 250ms invulnerability, and restores its charge after 3s", () => {
    const system = new PlayerSystem(createPlayer());
    const dash = { ...createEmptyInputFrame(), move: { x: 1, y: 0 }, dashPressed: true };

    const started = system.step(180, dash);
    expect(started.actions).toContainEqual({
      type: "dash",
      direction: { x: 1, y: 0 },
      distance: 220,
      durationMs: 180,
    });
    expect(started.player.position.x).toBe(860);
    expect(started.player.dashCharges).toBe(0);
    expect(started.player.invulnerableRemainingMs).toBe(70);
    expect(system.takeDamage(10).applied).toBe(false);

    system.step(70, createEmptyInputFrame());
    expect(system.takeDamage(10).applied).toBe(true);
    expect(system.hitCount).toBe(1);
    expect(system.takeDamage(10).applied).toBe(false);

    system.step(2750, createEmptyInputFrame());
    expect(system.snapshot.dashCharges).toBe(1);
  });

  it("charges and spends sword storm and ultimate only when ready", () => {
    const system = new PlayerSystem(createPlayer({ ultimateCharge: 99 }));

    system.step(599, createEmptyInputFrame());
    expect(system.snapshot.ultimateCharge).toBe(99);
    system.step(1, createEmptyInputFrame());
    expect(system.snapshot.ultimateCharge).toBe(100);

    const powers = system.step(0, {
      ...createEmptyInputFrame(),
      swordStormPressed: true,
      ultimatePressed: true,
    });
    expect(powers.actions).toEqual([
      {
        type: "sword-storm",
        origin: { x: 640, y: 360 },
        damage: 60,
        radius: 180,
      },
      { type: "ultimate", damage: 250 },
    ]);
    expect(powers.player.ultimateCharge).toBe(0);
    expect(system.step(7999, { ...createEmptyInputFrame(), swordStormPressed: true }).actions).toHaveLength(0);
    expect(system.step(1, { ...createEmptyInputFrame(), swordStormPressed: true }).actions[0]?.type).toBe("sword-storm");
  });
});