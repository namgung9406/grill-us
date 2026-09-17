import { BOSS_ONE_BALANCE, bossOneTentaclePosition } from "../../domain/bosses";
import { rescueCitizen, rescueRemainingCitizens } from "../../domain/rescue";
import type {
  ActiveHazardSnapshot,
  BossOneSnapshot,
  BossOneTentacleSnapshot,
  Vector2,
} from "../../domain/types";

const BODY_TARGET_ID = "boss1-body";
const PLAYER_RADIUS = 20;
const TENTACLE_HIT_RADIUS = 18;
const SWEEP_ARC_RADIANS = Math.PI / 3;
const SWEEP_ACTIVE_MS = 180;

type ArcHazardSnapshot = Extract<ActiveHazardSnapshot, { kind: "boss1-sweep" | "boss2-mace" }>;

export interface BossOneSystemOptions {
  boss: BossOneSnapshot;
  activeHazards?: readonly ActiveHazardSnapshot[];
  rescuedCitizenIds?: readonly string[];
  createId?: () => string;
}

export interface BossOneDamageTarget {
  id: string;
  kind: "body" | "tentacle";
  position: Vector2;
  radius: number;
}

export interface BossOneContactHit {
  sourceId: string;
  damage: number;
}

export interface BossOneStepResult {
  boss: BossOneSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  rescuedCitizenIds: readonly string[];
  contacts: readonly BossOneContactHit[];
}

export interface BossOneDamageResult {
  boss: BossOneSnapshot;
  rescuedCitizenIds: readonly string[];
  rescuedCitizenId: string | null;
  completed: boolean;
}

function copyTentacle(tentacle: BossOneTentacleSnapshot): BossOneTentacleSnapshot {
  return { ...tentacle };
}

function copyBoss(boss: BossOneSnapshot): BossOneSnapshot {
  return {
    ...boss,
    position: { ...boss.position },
    tentacles: boss.tentacles.map(copyTentacle),
  };
}

function copyHazard(hazard: ActiveHazardSnapshot): ActiveHazardSnapshot {
  if (hazard.kind === "boss1-sweep" || hazard.kind === "boss2-mace") {
    return { ...hazard, origin: { ...hazard.origin } };
  }
  if (hazard.kind === "boss2-shockwave") {
    return { ...hazard, origin: { ...hazard.origin } };
  }
  if (hazard.kind === "boss3-safe-zone") {
    return { ...hazard, center: { ...hazard.center } };
  }
  return { ...hazard };
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `30000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`;
}

function angularDistance(left: number, right: number): number {
  const turn = Math.PI * 2;
  return Math.abs(((left - right + Math.PI) % turn + turn) % turn - Math.PI);
}

export class BossOneSystem {
  readonly #createId: () => string;
  #boss: BossOneSnapshot;
  #activeHazards: ActiveHazardSnapshot[];
  #rescuedCitizenIds: readonly string[];

  public constructor(options: BossOneSystemOptions) {
    this.#boss = copyBoss(options.boss);
    this.#activeHazards = (options.activeHazards ?? []).map(copyHazard);
    this.#rescuedCitizenIds = [...new Set(options.rescuedCitizenIds ?? [])];
    this.#createId = options.createId ?? createSequentialIdFactory();
  }

  public get boss(): BossOneSnapshot {
    return copyBoss(this.#boss);
  }

  public get activeHazards(): readonly ActiveHazardSnapshot[] {
    return this.#activeHazards.map(copyHazard);
  }

  public get rescuedCitizenIds(): readonly string[] {
    return [...this.#rescuedCitizenIds];
  }

  public get damageTargets(): readonly BossOneDamageTarget[] {
    const tentacles = this.#boss.tentacles
      .filter(({ destroyed }) => !destroyed)
      .map((tentacle) => ({
        id: tentacle.id,
        kind: "tentacle" as const,
        position: bossOneTentaclePosition(this.#boss, tentacle.angleRadians),
        radius: TENTACLE_HIT_RADIUS,
      }));
    return [
      ...tentacles,
      { id: BODY_TARGET_ID, kind: "body", position: { ...this.#boss.position }, radius: BOSS_ONE_BALANCE.radius },
    ];
  }

  public step(deltaMs: number, playerPosition: Vector2): BossOneStepResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("deltaMs must be a nonnegative finite number");
    }

    const contacts: BossOneContactHit[] = [];
    const cooldownDeltaMs = Math.max(0, Math.round(deltaMs));
    this.#boss = {
      ...this.#boss,
      attackCooldownMs: Math.max(0, this.#boss.attackCooldownMs - cooldownDeltaMs),
      tentacles: this.#boss.tentacles.map((tentacle) => ({
        ...tentacle,
        attackCooldownMs: Math.max(0, tentacle.attackCooldownMs - cooldownDeltaMs),
      })),
    };

    if (this.#boss.hp > 0 && this.#distance(this.#boss.position, playerPosition) <= BOSS_ONE_BALANCE.radius + PLAYER_RADIUS) {
      if (this.#boss.attackCooldownMs === 0) {
        contacts.push({ sourceId: BODY_TARGET_ID, damage: BOSS_ONE_BALANCE.contactDamage });
        this.#boss = { ...this.#boss, attackCooldownMs: BOSS_ONE_BALANCE.contactCooldownMs };
      }
    }

    const nextHazards: ActiveHazardSnapshot[] = [];
    for (const hazard of this.#activeHazards) {
      if (hazard.kind !== "boss1-sweep") {
        nextHazards.push(copyHazard(hazard));
        continue;
      }
      const telegraphRemainingMs = Math.max(0, hazard.telegraphRemainingMs - cooldownDeltaMs);
      const activeDeltaMs = Math.max(0, cooldownDeltaMs - hazard.telegraphRemainingMs);
      const activeRemainingMs = Math.max(0, hazard.activeRemainingMs - activeDeltaMs);
      let hitApplied = hazard.hitApplied;
      if (!hitApplied && telegraphRemainingMs === 0 && activeRemainingMs > 0 && this.#isPlayerInSweep(hazard, playerPosition)) {
        contacts.push({ sourceId: hazard.sourceId, damage: hazard.damage });
        hitApplied = true;
      }
      if (telegraphRemainingMs > 0 || activeRemainingMs > 0) {
        nextHazards.push({ ...hazard, telegraphRemainingMs, activeRemainingMs, hitApplied });
      }
    }

    this.#boss = {
      ...this.#boss,
      tentacles: this.#boss.tentacles.map((tentacle) => {
        if (tentacle.destroyed || tentacle.attackCooldownMs > 0) {
          return tentacle;
        }
        nextHazards.push({
          id: this.#createId(),
          kind: "boss1-sweep",
          sourceId: tentacle.id,
          origin: { ...this.#boss.position },
          angleRadians: tentacle.angleRadians,
          arcRadians: SWEEP_ARC_RADIANS,
          radius: BOSS_ONE_BALANCE.sweepReach,
          damage: BOSS_ONE_BALANCE.sweepDamage,
          telegraphRemainingMs: BOSS_ONE_BALANCE.sweepTelegraphMs,
          activeRemainingMs: SWEEP_ACTIVE_MS,
          hitApplied: false,
        });
        return { ...tentacle, attackCooldownMs: BOSS_ONE_BALANCE.sweepIntervalMs };
      }),
    };
    this.#activeHazards = nextHazards;

    return {
      boss: this.boss,
      activeHazards: this.activeHazards,
      rescuedCitizenIds: this.rescuedCitizenIds,
      contacts,
    };
  }

  public damageTarget(targetId: string, damage: number): BossOneDamageResult {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new RangeError("damage must be a nonnegative finite number");
    }
    if (damage === 0 || this.#boss.hp === 0) {
      return this.#damageResult(null);
    }

    if (targetId === BODY_TARGET_ID) {
      this.#boss = { ...this.#boss, hp: Math.max(0, this.#boss.hp - damage) };
      if (this.#boss.hp === 0) {
        const citizenUserIds = this.#boss.tentacles.flatMap(({ citizenUserId }) =>
          citizenUserId === null ? [] : [citizenUserId],
        );
        this.#rescuedCitizenIds = rescueRemainingCitizens(this.#rescuedCitizenIds, citizenUserIds);
        this.#activeHazards = this.#activeHazards.filter(({ kind }) => kind !== "boss1-sweep");
      }
      return this.#damageResult(null);
    }

    let rescuedCitizenId: string | null = null;
    this.#boss = {
      ...this.#boss,
      tentacles: this.#boss.tentacles.map((tentacle) => {
        if (tentacle.id !== targetId || tentacle.destroyed) {
          return tentacle;
        }
        const hp = Math.max(0, tentacle.hp - damage);
        if (hp > 0) {
          return { ...tentacle, hp };
        }
        rescuedCitizenId = tentacle.citizenUserId;
        return { ...tentacle, hp: 0, destroyed: true };
      }),
    };
    if (rescuedCitizenId !== null) {
      this.#rescuedCitizenIds = rescueCitizen(this.#rescuedCitizenIds, rescuedCitizenId);
      this.#activeHazards = this.#activeHazards.filter(
        (hazard) => hazard.kind !== "boss1-sweep" || hazard.sourceId !== targetId,
      );
    }
    return this.#damageResult(rescuedCitizenId);
  }

  #damageResult(rescuedCitizenId: string | null): BossOneDamageResult {
    return {
      boss: this.boss,
      rescuedCitizenIds: this.rescuedCitizenIds,
      rescuedCitizenId,
      completed: this.#boss.hp === 0,
    };
  }

  #isPlayerInSweep(hazard: ArcHazardSnapshot, playerPosition: Vector2): boolean {
    const offset = { x: playerPosition.x - hazard.origin.x, y: playerPosition.y - hazard.origin.y };
    const distance = Math.hypot(offset.x, offset.y);
    if (distance > hazard.radius + PLAYER_RADIUS || distance === 0) {
      return false;
    }
    return angularDistance(Math.atan2(offset.y, offset.x), hazard.angleRadians) <= hazard.arcRadians / 2;
  }

  #distance(left: Vector2, right: Vector2): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }
}