import { describe, expect, it } from "vitest";

import { GAME_BALANCE } from "../../domain/constants";
import type { RandomSource } from "../../domain/random";
import type { PickupSnapshot, PlayerSnapshot } from "../../domain/types";
import { PickupSystem } from "./PickupSystem";

class SequenceRandom implements RandomSource {
  readonly #values: readonly number[];
  #index = 0;

  public constructor(values: readonly number[]) {
    this.#values = values;
  }

  public next(): number {
    return this.#values[this.#index++] ?? 0;
  }

  public integer(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  public state(): number {
    return this.#index;
  }
}

function createPlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    position: { x: 0, y: 0 },
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

describe("PickupSystem", () => {
  it("uses the exact 15 percent boundary and excludes maxed permanent upgrades", () => {
    const random = new SequenceRandom([0.149_999, 0, 0.15, 0.149_999, 0]);
    const system = new PickupSystem(random);
    const levels = { gunDamage: 5, gunRange: 0, swordPower: 5, dashCapacity: 2, dashRecovery: 4 };

    expect(system.tryDrop({ x: 10, y: 10 }, levels)?.type).toBe("gun-range");
    expect(system.tryDrop({ x: 20, y: 20 }, levels)).toBeNull();
    expect(
      system.tryDrop(
        { x: 30, y: 30 },
        { gunDamage: 5, gunRange: 4, swordPower: 5, dashCapacity: 2, dashRecovery: 4 },
      )?.type,
    ).toBe("ultimate-charge");
  });

  it("expires pickups at 15 seconds and auto-collects within 48px without exceeding caps", () => {
    const expiring: PickupSnapshot = {
      id: "expiring",
      type: "gun-damage",
      position: { x: 100, y: 0 },
      ttlMs: GAME_BALANCE.enemies.pickupTtlMs,
    };
    const collectible: PickupSnapshot = {
      id: "collectible",
      type: "ultimate-charge",
      position: { x: 48, y: 0 },
      ttlMs: GAME_BALANCE.enemies.pickupTtlMs,
    };
    const system = new PickupSystem(new SequenceRandom([]), [expiring, collectible]);

    const collected = system.step(1, createPlayer({ ultimateCharge: 12 }));
    expect(collected.collected.map(({ id }) => id)).toEqual(["collectible"]);
    expect(collected.player.ultimateCharge).toBe(100);
    expect(system.step(14_999, collected.player).pickups).toHaveLength(0);
  });

  it("never creates more than the pickup cap", () => {
    const pickups = Array.from({ length: GAME_BALANCE.limits.pickups }, (_, index): PickupSnapshot => ({
      id: `pickup-${index}`,
      type: "ultimate-charge",
      position: { x: 100, y: 100 },
      ttlMs: GAME_BALANCE.enemies.pickupTtlMs,
    }));
    const system = new PickupSystem(new SequenceRandom([0]), pickups);

    expect(system.tryDrop({ x: 0, y: 0 }, createPlayer().upgrades)).toBeNull();
    expect(system.pickups).toHaveLength(GAME_BALANCE.limits.pickups);
  });
});