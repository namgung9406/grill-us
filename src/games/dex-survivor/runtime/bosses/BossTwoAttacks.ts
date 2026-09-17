import { BOSS_TWO_BALANCE } from "../../domain/bosses";
import { GAME_BALANCE } from "../../domain/constants";
import type { ActiveHazardSnapshot, BossTwoSnapshot, Vector2 } from "../../domain/types";

const PLAYER_RADIUS = 20;
const MACE_ACTIVE_MS = 180;
const SHOCKWAVE_MAX_RADIUS = Math.hypot(GAME_BALANCE.arena.width, GAME_BALANCE.arena.height);

type ArcHazard = Extract<ActiveHazardSnapshot, { kind: "boss1-sweep" | "boss2-mace" }>;
type MaceHazard = ArcHazard & { kind: "boss2-mace" };
type ShockwaveHazard = Extract<ActiveHazardSnapshot, { kind: "boss2-shockwave" }>;

export interface BossTwoAttackContact {
  sourceId: string;
  damage: number;
}

export interface BossTwoAttackUpdateOptions {
  boss: BossTwoSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  deltaMs: number;
  playerPosition: Vector2;
  createId: () => string;
}

export interface BossTwoAttackUpdateResult {
  boss: BossTwoSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  contacts: readonly BossTwoAttackContact[];
  summonCount: number;
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

function angularDistance(left: number, right: number): number {
  const turn = Math.PI * 2;
  return Math.abs(((left - right + Math.PI) % turn + turn) % turn - Math.PI);
}

function playerInMace(hazard: MaceHazard, playerPosition: Vector2): boolean {
  const offset = { x: playerPosition.x - hazard.origin.x, y: playerPosition.y - hazard.origin.y };
  const distance = Math.hypot(offset.x, offset.y);
  if (distance > hazard.radius + PLAYER_RADIUS || distance === 0) {
    return false;
  }
  return angularDistance(Math.atan2(offset.y, offset.x), hazard.angleRadians) <= hazard.arcRadians / 2;
}

function shockwaveCrossesPlayer(
  hazard: ShockwaveHazard,
  nextRadius: number,
  playerPosition: Vector2,
): boolean {
  const distance = Math.hypot(playerPosition.x - hazard.origin.x, playerPosition.y - hazard.origin.y);
  return hazard.radius <= distance + PLAYER_RADIUS && nextRadius >= Math.max(0, distance - PLAYER_RADIUS);
}

export function updateBossTwoAttacks(options: BossTwoAttackUpdateOptions): BossTwoAttackUpdateResult {
  if (!Number.isFinite(options.deltaMs) || options.deltaMs < 0) {
    throw new RangeError("deltaMs must be a nonnegative finite number");
  }

  const cooldownDeltaMs = Math.max(0, Math.round(options.deltaMs));
  const maceEnabled = !options.boss.parts.maceArm.destroyed && options.boss.stage !== "defeated";
  const shockwaveEnabled =
    (!options.boss.parts.leftLeg.destroyed || !options.boss.parts.rightLeg.destroyed) &&
    options.boss.stage !== "defeated";
  const contacts: BossTwoAttackContact[] = [];
  const activeHazards: ActiveHazardSnapshot[] = [];

  for (const existing of options.activeHazards) {
    if (existing.kind === "boss2-mace") {
      if (!maceEnabled) {
        continue;
      }
      const telegraphRemainingMs = Math.max(0, existing.telegraphRemainingMs - cooldownDeltaMs);
      const activeDeltaMs = Math.max(0, cooldownDeltaMs - existing.telegraphRemainingMs);
      const activeRemainingMs = Math.max(0, existing.activeRemainingMs - activeDeltaMs);
      let hitApplied = existing.hitApplied;
      if (
        !hitApplied &&
        telegraphRemainingMs === 0 &&
        activeRemainingMs > 0 &&
        playerInMace({ ...existing, kind: "boss2-mace" }, options.playerPosition)
      ) {
        contacts.push({ sourceId: existing.sourceId, damage: existing.damage });
        hitApplied = true;
      }
      if (telegraphRemainingMs > 0 || activeRemainingMs > 0) {
        activeHazards.push({ ...existing, telegraphRemainingMs, activeRemainingMs, hitApplied });
      }
      continue;
    }

    if (existing.kind === "boss2-shockwave") {
      if (!shockwaveEnabled) {
        continue;
      }
      const telegraphRemainingMs = Math.max(0, existing.telegraphRemainingMs - cooldownDeltaMs);
      const activeDeltaMs = Math.max(0, cooldownDeltaMs - existing.telegraphRemainingMs);
      const radius = Math.min(existing.maxRadius, existing.radius + (existing.speed * activeDeltaMs) / 1000);
      let hitPlayer = existing.hitPlayer;
      if (
        !hitPlayer &&
        telegraphRemainingMs === 0 &&
        shockwaveCrossesPlayer(existing, radius, options.playerPosition)
      ) {
        contacts.push({ sourceId: existing.id, damage: existing.damage });
        hitPlayer = true;
      }
      if (telegraphRemainingMs > 0 || radius < existing.maxRadius) {
        activeHazards.push({ ...existing, radius, telegraphRemainingMs, hitPlayer });
      }
      continue;
    }

    activeHazards.push(copyHazard(existing));
  }

  let attackCooldownMs = maceEnabled
    ? Math.max(0, options.boss.attackCooldownMs - cooldownDeltaMs)
    : 0;
  if (maceEnabled && attackCooldownMs === 0) {
    const angleRadians = Math.atan2(
      options.playerPosition.y - options.boss.position.y,
      options.playerPosition.x - options.boss.position.x,
    );
    activeHazards.push({
      id: options.createId(),
      kind: "boss2-mace",
      sourceId: "boss2-mace-arm",
      origin: { ...options.boss.position },
      angleRadians,
      arcRadians: (BOSS_TWO_BALANCE.maceArcDegrees * Math.PI) / 180,
      radius: BOSS_TWO_BALANCE.maceRadius,
      damage: BOSS_TWO_BALANCE.maceDamage,
      telegraphRemainingMs: BOSS_TWO_BALANCE.maceTelegraphMs,
      activeRemainingMs: MACE_ACTIVE_MS,
      hitApplied: false,
    });
    attackCooldownMs = BOSS_TWO_BALANCE.maceIntervalMs;
  }

  let shockwaveCooldownMs = shockwaveEnabled
    ? Math.max(0, options.boss.shockwaveCooldownMs - cooldownDeltaMs)
    : 0;
  if (shockwaveEnabled && shockwaveCooldownMs === 0) {
    activeHazards.push({
      id: options.createId(),
      kind: "boss2-shockwave",
      origin: { ...options.boss.position },
      radius: 0,
      maxRadius: SHOCKWAVE_MAX_RADIUS,
      speed: BOSS_TWO_BALANCE.shockwaveSpeed,
      damage: BOSS_TWO_BALANCE.shockwaveDamage,
      telegraphRemainingMs: BOSS_TWO_BALANCE.shockwaveTelegraphMs,
      hitPlayer: false,
    });
    shockwaveCooldownMs = BOSS_TWO_BALANCE.shockwaveIntervalMs;
  }

  let summonCount = 0;
  let summonCooldownMs = Math.max(0, options.boss.summonCooldownMs - cooldownDeltaMs);
  if (options.boss.stage !== "defeated" && summonCooldownMs === 0) {
    const summon = options.boss.parts.shield.destroyed
      ? BOSS_TWO_BALANCE.summonAfterShieldDestroyed
      : BOSS_TWO_BALANCE.summonBeforeShieldDestroyed;
    summonCount = summon.count;
    summonCooldownMs = summon.intervalMs;
  }

  return {
    boss: { ...options.boss, attackCooldownMs, summonCooldownMs, shockwaveCooldownMs },
    activeHazards,
    contacts,
    summonCount,
  };
}