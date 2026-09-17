import {
  BOSS_THREE_BALANCE,
  createFinaleBossOneState,
  createFinaleBossTwoState,
} from "../../domain/bosses";
import { GAME_BALANCE } from "../../domain/constants";
import type {
  ActiveHazardSnapshot,
  BossOneSnapshot,
  BossThreeSnapshot,
  BossTwoSnapshot,
  ProjectileSnapshot,
  Vector2,
} from "../../domain/types";
import { createSafeZone, spawnAimedBurst, spawnEdgeCompression, spawnRing } from "./BulletPatterns";

export const BOSS_THREE_TARGET_ID = "boss3-core";

const PLAYER_RADIUS = 20;
const BOSS_RADIUS = 92;
const SAFE_ZONE_DURATION_MS =
  BOSS_THREE_BALANCE.safeZone.positionCount * BOSS_THREE_BALANCE.safeZone.moveIntervalMs;

export interface BossThreeSystemOptions {
  boss: BossThreeSnapshot;
  seed: number;
  activeHazards?: readonly ActiveHazardSnapshot[];
  createId?: () => string;
}

export interface BossThreeDamageTarget {
  id: typeof BOSS_THREE_TARGET_ID;
  position: Vector2;
  radius: number;
}

export interface BossThreeContact {
  sourceId: string;
  damage: number;
}

export interface BossThreeStepResult {
  boss: BossThreeSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  projectiles: readonly ProjectileSnapshot[];
  contacts: readonly BossThreeContact[];
}

export interface BossThreeDamageResult {
  boss: BossThreeSnapshot;
  appliedDamage: number;
  phaseTwoStarted: boolean;
  finaleStarted: boolean;
  completed: boolean;
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `50000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`;
}

function copyBoss(boss: BossThreeSnapshot): BossThreeSnapshot {
  return structuredClone(boss);
}

export class BossThreeSystem {
  readonly #seed: number;
  readonly #createId: () => string;
  #boss: BossThreeSnapshot;
  #activeHazards: ActiveHazardSnapshot[];
  #aimedRemaining = 0;
  #aimedCooldownMs = 0;
  #aimedIntervalMs = 0;

  public constructor(options: BossThreeSystemOptions) {
    this.#boss = copyBoss(options.boss);
    this.#seed = options.seed;
    this.#activeHazards = structuredClone(options.activeHazards ? [...options.activeHazards] : []);
    this.#createId = options.createId ?? createSequentialIdFactory();
    this.#restoreAimedBurst();
  }

  public get boss(): BossThreeSnapshot {
    return copyBoss(this.#boss);
  }

  public get activeHazards(): readonly ActiveHazardSnapshot[] {
    return structuredClone(this.#activeHazards);
  }

  public get damageTargets(): readonly BossThreeDamageTarget[] {
    if (this.#boss.phase === "hidden" || this.#boss.hp === 0) {
      return [];
    }
    return [{ id: BOSS_THREE_TARGET_ID, position: { ...this.#boss.position }, radius: BOSS_RADIUS }];
  }

  public step(deltaMs: number, playerPosition: Vector2): BossThreeStepResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("deltaMs must be a nonnegative finite number");
    }
    if (this.#boss.phase === "hidden" || this.#boss.hp === 0) {
      return { boss: this.boss, activeHazards: this.activeHazards, projectiles: [], contacts: [] };
    }

    const contacts: BossThreeContact[] = [];
    const projectiles: ProjectileSnapshot[] = [];
    this.#stepHazards(deltaMs, playerPosition, contacts, projectiles);
    this.#stepAimedBurst(deltaMs, playerPosition, projectiles);

    const patternCooldownMs = Math.max(0, this.#boss.patternCooldownMs - deltaMs);
    this.#boss = { ...this.#boss, patternCooldownMs };
    if (patternCooldownMs === 0) {
      this.#fireNextPattern(playerPosition, projectiles);
    }
    if (this.#distance(this.#boss.position, playerPosition) <= BOSS_RADIUS + PLAYER_RADIUS) {
      contacts.push({ sourceId: BOSS_THREE_TARGET_ID, damage: BOSS_THREE_BALANCE.contactDamage });
    }
    return { boss: this.boss, activeHazards: this.activeHazards, projectiles, contacts };
  }

  public damageTarget(targetId: string, damage: number): BossThreeDamageResult {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new RangeError("damage must be a nonnegative finite number");
    }
    if (targetId !== BOSS_THREE_TARGET_ID || damage === 0 || this.#boss.phase === "hidden" || this.#boss.hp === 0) {
      return this.#damageResult(0, false, false);
    }

    const previousHp = this.#boss.hp;
    const hp = Math.max(0, previousHp - damage);
    const appliedDamage = previousHp - hp;
    let phaseTwoStarted = false;
    let finaleStarted = false;
    this.#boss = { ...this.#boss, hp };
    if (hp === 0) {
      this.#activeHazards = [];
      this.#aimedRemaining = 0;
      return this.#damageResult(appliedDamage, false, false);
    }
    if (this.#boss.phase === 1 && hp <= BOSS_THREE_BALANCE.phaseTwoHp) {
      phaseTwoStarted = true;
      this.#boss = {
        ...this.#boss,
        phase: 2,
        patternIndex: 0,
        patternCooldownMs: BOSS_THREE_BALANCE.minimumTelegraphMs,
      };
      this.#aimedRemaining = 0;
    }
    if (!this.#boss.finaleTriggered && hp <= BOSS_THREE_BALANCE.finaleHp) {
      finaleStarted = true;
      this.#boss = {
        ...this.#boss,
        phase: "hidden",
        savedHp: Math.max(1, hp),
        finaleTriggered: true,
        resumeCountdownMs: 0,
        finaleBossOne: createFinaleBossOneState({ x: GAME_BALANCE.arena.width * 0.27, y: GAME_BALANCE.arena.height / 2 }),
        finaleBossTwo: createFinaleBossTwoState({ x: GAME_BALANCE.arena.width * 0.73, y: GAME_BALANCE.arena.height / 2 }),
      };
      this.#activeHazards = [];
      this.#aimedRemaining = 0;
    }
    return this.#damageResult(appliedDamage, phaseTwoStarted, finaleStarted);
  }

  public syncFinaleAdds(bossOne: BossOneSnapshot, bossTwo: BossTwoSnapshot): BossThreeSnapshot {
    this.#boss = { ...this.#boss, finaleBossOne: structuredClone(bossOne), finaleBossTwo: structuredClone(bossTwo) };
    return this.boss;
  }

  public beginResumeCountdown(bossOne: BossOneSnapshot, bossTwo: BossTwoSnapshot): BossThreeSnapshot {
    this.#boss = {
      ...this.#boss,
      finaleBossOne: structuredClone(bossOne),
      finaleBossTwo: structuredClone(bossTwo),
      resumeCountdownMs: BOSS_THREE_BALANCE.resumeCountdownMs,
    };
    this.#activeHazards = [];
    this.#aimedRemaining = 0;
    return this.boss;
  }

  public setResumeCountdown(remainingMs: number): BossThreeSnapshot {
    this.#boss = { ...this.#boss, resumeCountdownMs: Math.max(0, remainingMs) };
    return this.boss;
  }

  public resumeAfterFinale(): BossThreeSnapshot {
    if (this.#boss.phase !== "hidden" || !this.#boss.finaleTriggered) {
      return this.boss;
    }
    this.#boss = {
      ...this.#boss,
      hp: Math.max(1, this.#boss.savedHp),
      phase: 2,
      patternCooldownMs: BOSS_THREE_BALANCE.minimumTelegraphMs,
      resumeCountdownMs: 0,
      finaleBossOne: null,
      finaleBossTwo: null,
    };
    return this.boss;
  }

  #fireNextPattern(playerPosition: Vector2, projectiles: ProjectileSnapshot[]): void {
    const patternIndex = this.#boss.patternIndex;
    if (this.#boss.phase === 1) {
      if (patternIndex % 2 === 0) {
        projectiles.push(...this.#ringProjectiles(1, patternIndex));
        this.#advancePattern(BOSS_THREE_BALANCE.ring.phaseOne.intervalMs);
      } else {
        this.#queueAimedBurst(playerPosition, 1);
        this.#stepAimedBurst(0, playerPosition, projectiles);
        const burstDuration = BOSS_THREE_BALANCE.aimedBurst.phaseOne.projectileCount * BOSS_THREE_BALANCE.aimedBurst.phaseOne.projectileIntervalMs;
        this.#advancePattern(Math.max(BOSS_THREE_BALANCE.minimumTelegraphMs, burstDuration));
      }
      return;
    }

    if (patternIndex % 2 === 0) {
      projectiles.push(...this.#ringProjectiles(2, patternIndex));
      this.#queueAimedBurst(playerPosition, 2);
      this.#stepAimedBurst(0, playerPosition, projectiles);
      this.#advancePattern(BOSS_THREE_BALANCE.ring.phaseTwo.intervalMs);
      return;
    }

    const edges = patternIndex % 4 === 1 ? "horizontal" : "vertical";
    this.#activeHazards.push(
      {
        id: this.#createId(),
        kind: "boss3-edge",
        edges,
        telegraphRemainingMs: BOSS_THREE_BALANCE.edgeCompression.telegraphMs,
        projectilesSpawned: false,
      },
      {
        id: this.#createId(),
        kind: "boss3-safe-zone",
        center: createSafeZone(this.#seed, patternIndex, 0),
        radius: BOSS_THREE_BALANCE.safeZone.radius,
        telegraphRemainingMs: BOSS_THREE_BALANCE.safeZone.damageDelayMs,
        activeRemainingMs: SAFE_ZONE_DURATION_MS,
        damage: BOSS_THREE_BALANCE.safeZone.damage,
        damageApplied: false,
      },
    );
    this.#advancePattern(BOSS_THREE_BALANCE.safeZone.damageDelayMs + SAFE_ZONE_DURATION_MS);
  }

  #advancePattern(cooldownMs: number): void {
    this.#boss = {
      ...this.#boss,
      patternIndex: this.#boss.patternIndex + 1,
      patternCooldownMs: Math.max(BOSS_THREE_BALANCE.minimumTelegraphMs, cooldownMs),
    };
  }

  #ringProjectiles(phase: 1 | 2, patternIndex: number): readonly ProjectileSnapshot[] {
    const balance = phase === 1 ? BOSS_THREE_BALANCE.ring.phaseOne : BOSS_THREE_BALANCE.ring.phaseTwo;
    const damage = phase === 1 ? BOSS_THREE_BALANCE.aimedBurst.phaseOne.damage : BOSS_THREE_BALANCE.aimedBurst.phaseTwo.damage;
    return spawnRing({
      origin: this.#boss.position,
      projectileCount: balance.projectileCount,
      speed: balance.speed,
      damage,
      seed: this.#seed,
      patternIndex,
      rotationDirection: phase === 2 && patternIndex % 4 === 2 ? -1 : 1,
      createId: this.#createId,
    });
  }

  #queueAimedBurst(_playerPosition: Vector2, phase: 1 | 2): void {
    const balance = phase === 1 ? BOSS_THREE_BALANCE.aimedBurst.phaseOne : BOSS_THREE_BALANCE.aimedBurst.phaseTwo;
    this.#aimedRemaining = balance.projectileCount;
    this.#aimedCooldownMs = 0;
    this.#aimedIntervalMs = balance.projectileIntervalMs;
  }

  #stepAimedBurst(deltaMs: number, playerPosition: Vector2, projectiles: ProjectileSnapshot[]): void {
    let remainingDeltaMs = deltaMs;
    while (this.#aimedRemaining > 0) {
      if (this.#aimedCooldownMs > remainingDeltaMs) {
        this.#aimedCooldownMs -= remainingDeltaMs;
        break;
      }
      remainingDeltaMs -= this.#aimedCooldownMs;
      projectiles.push(...spawnAimedBurst({
        origin: this.#boss.position,
        target: playerPosition,
        projectileCount: 1,
        speed: BOSS_THREE_BALANCE.aimedBurst.speed,
        damage: this.#boss.phase === 1
          ? BOSS_THREE_BALANCE.aimedBurst.phaseOne.damage
          : BOSS_THREE_BALANCE.aimedBurst.phaseTwo.damage,
        createId: this.#createId,
      }));
      this.#aimedRemaining -= 1;
      this.#aimedCooldownMs = this.#aimedIntervalMs;
      if (remainingDeltaMs === 0) {
        break;
      }
    }
  }

  #restoreAimedBurst(): void {
    if (this.#boss.phase === "hidden" || this.#boss.patternIndex === 0) {
      return;
    }
    const phaseOneBurst = this.#boss.phase === 1 && this.#boss.patternIndex % 2 === 0;
    const phaseTwoBurst = this.#boss.phase === 2 && this.#boss.patternIndex % 2 === 1;
    if (!phaseOneBurst && !phaseTwoBurst) {
      return;
    }
    const balance = phaseOneBurst
      ? BOSS_THREE_BALANCE.aimedBurst.phaseOne
      : BOSS_THREE_BALANCE.aimedBurst.phaseTwo;
    const patternDurationMs = phaseOneBurst
      ? Math.max(BOSS_THREE_BALANCE.minimumTelegraphMs, balance.projectileCount * balance.projectileIntervalMs)
      : BOSS_THREE_BALANCE.ring.phaseTwo.intervalMs;
    const elapsedMs = Math.max(0, patternDurationMs - this.#boss.patternCooldownMs);
    const emittedCount = Math.min(balance.projectileCount, Math.floor(elapsedMs / balance.projectileIntervalMs) + 1);
    this.#aimedRemaining = balance.projectileCount - emittedCount;
    this.#aimedIntervalMs = balance.projectileIntervalMs;
    this.#aimedCooldownMs = this.#aimedRemaining === 0
      ? 0
      : balance.projectileIntervalMs - (elapsedMs % balance.projectileIntervalMs);
  }

  #stepHazards(
    deltaMs: number,
    playerPosition: Vector2,
    contacts: BossThreeContact[],
    projectiles: ProjectileSnapshot[],
  ): void {
    const nextHazards: ActiveHazardSnapshot[] = [];
    for (const hazard of this.#activeHazards) {
      if (hazard.kind === "boss3-edge") {
        const telegraphRemainingMs = Math.max(0, hazard.telegraphRemainingMs - deltaMs);
        if (!hazard.projectilesSpawned && telegraphRemainingMs === 0) {
          projectiles.push(...spawnEdgeCompression({
            edges: hazard.edges,
            projectileCount: BOSS_THREE_BALANCE.edgeCompression.projectileCount,
            speed: BOSS_THREE_BALANCE.edgeCompression.speed,
            damage: BOSS_THREE_BALANCE.edgeCompression.damage,
            createId: this.#createId,
          }));
        } else if (telegraphRemainingMs > 0) {
          nextHazards.push({ ...hazard, telegraphRemainingMs });
        }
        continue;
      }
      if (hazard.kind === "boss3-safe-zone") {
        const telegraphRemainingMs = Math.max(0, hazard.telegraphRemainingMs - deltaMs);
        const activeDeltaMs = Math.max(0, deltaMs - hazard.telegraphRemainingMs);
        const activeRemainingMs = Math.max(0, hazard.activeRemainingMs - activeDeltaMs);
        const elapsedActiveMs = SAFE_ZONE_DURATION_MS - activeRemainingMs;
        const positionIndex = Math.min(
          BOSS_THREE_BALANCE.safeZone.positionCount - 1,
          Math.floor(elapsedActiveMs / BOSS_THREE_BALANCE.safeZone.moveIntervalMs),
        );
        const center = createSafeZone(this.#seed, Math.max(0, this.#boss.patternIndex - 1), positionIndex);
        let damageApplied = hazard.damageApplied;
        if (!damageApplied && telegraphRemainingMs === 0 && this.#distance(playerPosition, center) > hazard.radius) {
          contacts.push({ sourceId: hazard.id, damage: hazard.damage });
          damageApplied = true;
        }
        if (telegraphRemainingMs > 0 || activeRemainingMs > 0) {
          nextHazards.push({ ...hazard, center, telegraphRemainingMs, activeRemainingMs, damageApplied });
        }
        continue;
      }
      nextHazards.push(structuredClone(hazard));
    }
    this.#activeHazards = nextHazards;
  }

  #damageResult(appliedDamage: number, phaseTwoStarted: boolean, finaleStarted: boolean): BossThreeDamageResult {
    return {
      boss: this.boss,
      appliedDamage,
      phaseTwoStarted,
      finaleStarted,
      completed: this.#boss.hp === 0,
    };
  }

  #distance(left: Vector2, right: Vector2): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }
}