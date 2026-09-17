import { ENEMY_ARCHETYPES, enemyRadius, type SpawnableEnemyType } from "../../domain/enemies";
import { GAME_BALANCE } from "../../domain/constants";
import type { RandomSource } from "../../domain/random";
import type {
  EnemySnapshot,
  GamePhase,
  ProjectileSnapshot,
  Vector2,
  WaveSnapshot,
} from "../../domain/types";
import { getWaveBudget, selectEnemyType } from "../../domain/waves";

export interface EnemySystemOptions {
  random: RandomSource;
  enemies?: readonly EnemySnapshot[];
  wave?: WaveSnapshot;
  enemyKills?: number;
  createId?: () => string;
}

export interface EnemyContactHit {
  enemyId: string;
  damage: number;
}

export interface EnemyStepResult {
  enemies: readonly EnemySnapshot[];
  projectiles: readonly ProjectileSnapshot[];
  contacts: readonly EnemyContactHit[];
  wave: WaveSnapshot;
  enemyKills: number;
}

export interface EnemyDamageResult {
  killed: EnemySnapshot | null;
  spawnedChildren: readonly EnemySnapshot[];
  enemies: readonly EnemySnapshot[];
  enemyKills: number;
}

function copyEnemy(enemy: EnemySnapshot): EnemySnapshot {
  return {
    ...enemy,
    position: { ...enemy.position },
    velocity: { ...enemy.velocity },
  };
}

function direction(from: Vector2, to: Vector2): { vector: Vector2; distance: number } {
  const offset = { x: to.x - from.x, y: to.y - from.y };
  const distance = Math.hypot(offset.x, offset.y);
  return {
    vector: distance === 0 ? { x: 0, y: 0 } : { x: offset.x / distance, y: offset.y / distance },
    distance,
  };
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `00000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`;
}

function createEnemy(type: EnemySnapshot["type"], position: Vector2, id: string): EnemySnapshot {
  const archetype = ENEMY_ARCHETYPES[type];
  return {
    id,
    type,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    hp: archetype.hp,
    attackCooldownMs: type === "ranged" ? ENEMY_ARCHETYPES.ranged.attackCooldownMs : 0,
    contactCooldownMs: 0,
  };
}

export class EnemySystem {
  readonly #random: RandomSource;
  readonly #createId: () => string;
  #enemies: EnemySnapshot[];
  #wave: WaveSnapshot;
  #enemyKills: number;

  public constructor(options: EnemySystemOptions) {
    this.#random = options.random;
    this.#createId = options.createId ?? createSequentialIdFactory();
    this.#enemies = (options.enemies ?? []).map(copyEnemy);
    this.#wave = { ...(options.wave ?? { spawnCooldownMs: 0, tier: 0 }) };
    this.#enemyKills = options.enemyKills ?? 0;
  }

  public get enemies(): readonly EnemySnapshot[] {
    return this.#enemies.map(copyEnemy);
  }

  public get wave(): WaveSnapshot {
    return { ...this.#wave };
  }

  public get enemyKills(): number {
    return this.#enemyKills;
  }

  public spawn(type: EnemySnapshot["type"], position: Vector2): EnemySnapshot | null {
    if (this.#enemies.length >= GAME_BALANCE.limits.enemies) {
      return null;
    }
    const enemy = createEnemy(type, position, this.#createId());
    this.#enemies.push(enemy);
    return copyEnemy(enemy);
  }

  public spawnSummoned(type: SpawnableEnemyType, position: Vector2, normalElapsedMs: number): EnemySnapshot | null {
    if (this.#enemies.length >= getWaveBudget(normalElapsedMs).enemyCap) {
      return null;
    }
    return this.spawn(type, position);
  }

  public step(
    deltaMs: number,
    context: { phase: GamePhase; normalElapsedMs: number; playerPosition: Vector2 },
  ): EnemyStepResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("deltaMs must be a nonnegative finite number");
    }

    const cooldownDeltaMs = Math.max(0, Math.round(deltaMs));
    const projectiles: ProjectileSnapshot[] = [];
    const contacts: EnemyContactHit[] = [];
    this.#enemies = this.#enemies.map((enemy) => {
      const next = copyEnemy(enemy);
      const towardPlayer = direction(next.position, context.playerPosition);
      const archetype = ENEMY_ARCHETYPES[next.type];
      let movementDirection = towardPlayer.vector;

      if (next.type === "ranged") {
        const ranged = ENEMY_ARCHETYPES.ranged;
        if (towardPlayer.distance < ranged.minimumDistance) {
          movementDirection = { x: -towardPlayer.vector.x, y: -towardPlayer.vector.y };
        } else if (towardPlayer.distance <= ranged.maximumDistance) {
          movementDirection = { x: 0, y: 0 };
        }

        next.attackCooldownMs = Math.max(0, next.attackCooldownMs - cooldownDeltaMs);
        if (next.attackCooldownMs === 0 && towardPlayer.distance > 0) {
          projectiles.push({
            id: this.#createId(),
            owner: "enemy",
            position: { ...next.position },
            velocity: {
              x: towardPlayer.vector.x * ranged.projectileSpeed,
              y: towardPlayer.vector.y * ranged.projectileSpeed,
            },
            damage: ranged.projectileDamage,
            remainingRange: towardPlayer.distance,
            radius: 6,
          });
          next.attackCooldownMs = ranged.attackCooldownMs;
        }
      }

      next.velocity = { x: movementDirection.x * archetype.speed, y: movementDirection.y * archetype.speed };
      next.position = {
        x: next.position.x + (next.velocity.x * deltaMs) / 1000,
        y: next.position.y + (next.velocity.y * deltaMs) / 1000,
      };
      next.contactCooldownMs = Math.max(0, next.contactCooldownMs - cooldownDeltaMs);

      if (next.type !== "ranged") {
        const afterMovement = direction(next.position, context.playerPosition);
        if (afterMovement.distance <= enemyRadius(next.type) + 20 && next.contactCooldownMs === 0) {
          contacts.push({ enemyId: next.id, damage: ENEMY_ARCHETYPES[next.type].contactDamage });
          next.contactCooldownMs = GAME_BALANCE.player.hitInvulnerabilityMs;
        }
      }
      return next;
    });

    this.#advanceWave(deltaMs, context.phase, context.normalElapsedMs, context.playerPosition);
    return {
      enemies: this.enemies,
      projectiles,
      contacts,
      wave: this.wave,
      enemyKills: this.#enemyKills,
    };
  }

  public damageEnemy(enemyId: string, damage: number): EnemyDamageResult {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new RangeError("damage must be a nonnegative finite number");
    }

    const enemyIndex = this.#enemies.findIndex(({ id }) => id === enemyId);
    if (enemyIndex < 0 || damage === 0) {
      return { killed: null, spawnedChildren: [], enemies: this.enemies, enemyKills: this.#enemyKills };
    }

    const existing = this.#enemies[enemyIndex];
    if (existing === undefined) {
      return { killed: null, spawnedChildren: [], enemies: this.enemies, enemyKills: this.#enemyKills };
    }
    const damaged = copyEnemy(existing);
    damaged.hp = Math.max(0, damaged.hp - damage);
    if (damaged.hp > 0) {
      this.#enemies[enemyIndex] = damaged;
      return { killed: null, spawnedChildren: [], enemies: this.enemies, enemyKills: this.#enemyKills };
    }

    this.#enemies.splice(enemyIndex, 1);
    this.#enemyKills += 1;
    const spawnedChildren: EnemySnapshot[] = [];
    if (damaged.type === "splitter") {
      for (let childIndex = 0; childIndex < ENEMY_ARCHETYPES.splitter.children; childIndex += 1) {
        if (this.#enemies.length >= GAME_BALANCE.limits.enemies) {
          break;
        }
        const angle = (childIndex * Math.PI * 2) / ENEMY_ARCHETYPES.splitter.children;
        const child = createEnemy(
          "splitter-small",
          { x: damaged.position.x + Math.cos(angle) * 24, y: damaged.position.y + Math.sin(angle) * 24 },
          this.#createId(),
        );
        this.#enemies.push(child);
        spawnedChildren.push(copyEnemy(child));
      }
    }

    return { killed: damaged, spawnedChildren, enemies: this.enemies, enemyKills: this.#enemyKills };
  }

  #advanceWave(deltaMs: number, phase: GamePhase, normalElapsedMs: number, playerPosition: Vector2): void {
    const budget = getWaveBudget(normalElapsedMs);
    this.#wave.tier = budget.tier;
    if (phase !== "normal" || this.#enemies.length >= budget.enemyCap) {
      return;
    }

    let elapsedMs = Math.max(0, Math.round(deltaMs));
    let cooldownMs = this.#wave.spawnCooldownMs;
    while (this.#enemies.length < budget.enemyCap) {
      if (cooldownMs > elapsedMs) {
        cooldownMs -= elapsedMs;
        break;
      }
      elapsedMs -= cooldownMs;
      const type = selectEnemyType(budget.tier, this.#random);
      this.spawn(type, this.#randomEdgePosition(playerPosition));
      cooldownMs = budget.spawnIntervalMs;
      if (elapsedMs === 0) {
        break;
      }
    }
    this.#wave.spawnCooldownMs = cooldownMs;
  }

  #randomEdgePosition(playerPosition: Vector2): Vector2 {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const edge = this.#random.integer(0, 3);
      const horizontal = edge <= 1;
      const candidate = horizontal
        ? {
            x: this.#random.integer(0, GAME_BALANCE.arena.width),
            y: edge === 0 ? -GAME_BALANCE.arena.spawnMargin : GAME_BALANCE.arena.height + GAME_BALANCE.arena.spawnMargin,
          }
        : {
            x: edge === 2 ? -GAME_BALANCE.arena.spawnMargin : GAME_BALANCE.arena.width + GAME_BALANCE.arena.spawnMargin,
            y: this.#random.integer(0, GAME_BALANCE.arena.height),
          };
      const candidateDistance = Math.hypot(candidate.x - playerPosition.x, candidate.y - playerPosition.y);
      if (candidateDistance >= GAME_BALANCE.arena.minimumSpawnDistanceFromPlayer) {
        return candidate;
      }
    }

    const { width, height, spawnMargin } = GAME_BALANCE.arena;
    const perimeterEndpoints: readonly Vector2[] = [
      { x: 0, y: -spawnMargin },
      { x: width, y: -spawnMargin },
      { x: 0, y: height + spawnMargin },
      { x: width, y: height + spawnMargin },
      { x: -spawnMargin, y: 0 },
      { x: -spawnMargin, y: height },
      { x: width + spawnMargin, y: 0 },
      { x: width + spawnMargin, y: height },
    ];
    return perimeterEndpoints.reduce((farthest, candidate) =>
      Math.hypot(candidate.x - playerPosition.x, candidate.y - playerPosition.y) >
      Math.hypot(farthest.x - playerPosition.x, farthest.y - playerPosition.y)
        ? candidate
        : farthest,
    );
  }
}