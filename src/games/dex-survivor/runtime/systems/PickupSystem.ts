import { GAME_BALANCE } from "../../domain/constants";
import type { RandomSource } from "../../domain/random";
import type { PickupSnapshot, PlayerSnapshot, UpgradeLevels, Vector2 } from "../../domain/types";
import { applyUpgrade, eligibleDrops } from "../../domain/upgrades";

export interface PickupStepResult {
  pickups: readonly PickupSnapshot[];
  player: PlayerSnapshot;
  collected: readonly PickupSnapshot[];
}

function copyPickup(pickup: PickupSnapshot): PickupSnapshot {
  return { ...pickup, position: { ...pickup.position } };
}

function copyPlayer(player: PlayerSnapshot): PlayerSnapshot {
  return {
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
    dashRecoveryRemainingMs: [...player.dashRecoveryRemainingMs],
    upgrades: { ...player.upgrades },
  };
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `10000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`;
}

export class PickupSystem {
  readonly #random: RandomSource;
  readonly #createId: () => string;
  #pickups: PickupSnapshot[];

  public constructor(
    random: RandomSource,
    initialPickups: readonly PickupSnapshot[] = [],
    createId: () => string = createSequentialIdFactory(),
  ) {
    this.#random = random;
    this.#pickups = initialPickups.slice(0, GAME_BALANCE.limits.pickups).map(copyPickup);
    this.#createId = createId;
  }

  public get pickups(): readonly PickupSnapshot[] {
    return this.#pickups.map(copyPickup);
  }

  public tryDrop(position: Vector2, levels: UpgradeLevels): PickupSnapshot | null {
    const shouldDrop = this.#random.next() < GAME_BALANCE.enemies.dropChance;
    if (!shouldDrop || this.#pickups.length >= GAME_BALANCE.limits.pickups) {
      return null;
    }

    const candidates = eligibleDrops(levels);
    const candidateIndex = Math.floor(this.#random.next() * candidates.length);
    const pickup: PickupSnapshot = {
      id: this.#createId(),
      type: candidates[Math.min(candidateIndex, candidates.length - 1)] ?? "ultimate-charge",
      position: { ...position },
      ttlMs: GAME_BALANCE.enemies.pickupTtlMs,
    };
    this.#pickups.push(pickup);
    return copyPickup(pickup);
  }

  public step(deltaMs: number, player: PlayerSnapshot): PickupStepResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("deltaMs must be a nonnegative finite number");
    }

    const elapsedMs = Math.max(0, Math.round(deltaMs));
    let nextPlayer = copyPlayer(player);
    const collected: PickupSnapshot[] = [];
    const remaining: PickupSnapshot[] = [];
    for (const pickup of this.#pickups) {
      const nextPickup = copyPickup(pickup);
      nextPickup.ttlMs = Math.max(0, nextPickup.ttlMs - elapsedMs);
      if (nextPickup.ttlMs === 0) {
        continue;
      }

      const distance = Math.hypot(
        nextPickup.position.x - nextPlayer.position.x,
        nextPickup.position.y - nextPlayer.position.y,
      );
      if (distance <= GAME_BALANCE.enemies.pickupRadius) {
        nextPlayer = applyUpgrade(nextPlayer, nextPickup.type);
        collected.push(copyPickup(nextPickup));
      } else {
        remaining.push(nextPickup);
      }
    }
    this.#pickups = remaining;
    return { pickups: this.pickups, player: copyPlayer(nextPlayer), collected };
  }
}