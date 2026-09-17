import { z } from "zod";

import { GAME_BALANCE } from "./constants";
import type {
  ActiveHazardSnapshot,
  BossOneSnapshot,
  BossThreeSnapshot,
  BossTwoSnapshot,
  GameSaveV1,
  RunResult,
} from "./types";

const uuidSchema = z.uuid();
const finiteNumberSchema = z.number().refine(Number.isFinite, "Must be finite");
const nonnegativeNumberSchema = finiteNumberSchema.nonnegative();
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const uint32Schema = nonnegativeIntegerSchema.max(0xffff_ffff);
const timeSchema = nonnegativeIntegerSchema;
const coordinateSchema = finiteNumberSchema.min(-GAME_BALANCE.limits.coordinate).max(GAME_BALANCE.limits.coordinate);

const vector2Schema = z.strictObject({
  x: coordinateSchema,
  y: coordinateSchema,
});

const upgradeLevelsSchema = z.strictObject({
  gunDamage: nonnegativeIntegerSchema.max(GAME_BALANCE.upgrades.maxLevels.gunDamage),
  gunRange: nonnegativeIntegerSchema.max(GAME_BALANCE.upgrades.maxLevels.gunRange),
  swordPower: nonnegativeIntegerSchema.max(GAME_BALANCE.upgrades.maxLevels.swordPower),
  dashCapacity: nonnegativeIntegerSchema.max(GAME_BALANCE.upgrades.maxLevels.dashCapacity),
  dashRecovery: nonnegativeIntegerSchema.max(GAME_BALANCE.upgrades.maxLevels.dashRecovery),
});

const playerSnapshotSchema = z.strictObject({
  position: vector2Schema,
  velocity: vector2Schema,
  hp: nonnegativeIntegerSchema.max(GAME_BALANCE.player.maxHp),
  maxHp: z.literal(GAME_BALANCE.player.maxHp),
  facingRadians: finiteNumberSchema,
  dashCharges: nonnegativeIntegerSchema.max(
    GAME_BALANCE.player.dash.baseCharges + GAME_BALANCE.upgrades.maxLevels.dashCapacity,
  ),
  dashRecoveryRemainingMs: z
    .array(timeSchema)
    .max(GAME_BALANCE.player.dash.baseCharges + GAME_BALANCE.upgrades.maxLevels.dashCapacity),
  dashRemainingMs: timeSchema,
  invulnerableRemainingMs: timeSchema,
  gunCooldownMs: timeSchema,
  swordCooldownMs: timeSchema,
  swordActiveRemainingMs: timeSchema,
  swordStormCooldownMs: timeSchema,
  swordStormActiveRemainingMs: timeSchema,
  ultimateCharge: nonnegativeIntegerSchema.max(GAME_BALANCE.player.ultimate.maxCharge),
  ultimateChargeTickRemainderMs: timeSchema.max(GAME_BALANCE.player.ultimate.chargeTickMs - 1),
  upgrades: upgradeLevelsSchema,
});

const enemySnapshotSchema = z.strictObject({
  id: uuidSchema,
  type: z.enum(["chaser", "ranged", "splitter", "splitter-small", "tank"]),
  position: vector2Schema,
  velocity: vector2Schema,
  hp: nonnegativeIntegerSchema,
  attackCooldownMs: timeSchema,
  contactCooldownMs: timeSchema,
});

const projectileSnapshotSchema = z.strictObject({
  id: uuidSchema,
  owner: z.enum(["player", "enemy"]),
  position: vector2Schema,
  velocity: vector2Schema,
  damage: nonnegativeNumberSchema,
  remainingRange: nonnegativeNumberSchema,
  radius: nonnegativeNumberSchema,
});

const pickupSnapshotSchema = z.strictObject({
  id: uuidSchema,
  type: z.enum(["gun-damage", "gun-range", "sword-power", "dash-capacity", "dash-recovery", "ultimate-charge"]),
  position: vector2Schema,
  ttlMs: timeSchema,
});

const waveSnapshotSchema = z.strictObject({
  spawnCooldownMs: timeSchema,
  tier: nonnegativeIntegerSchema,
});

const arcHazardSchema = z.strictObject({
  id: uuidSchema,
  kind: z.enum(["boss1-sweep", "boss2-mace"]),
  sourceId: uuidSchema,
  origin: vector2Schema,
  angleRadians: finiteNumberSchema,
  arcRadians: nonnegativeNumberSchema,
  radius: nonnegativeNumberSchema,
  damage: nonnegativeNumberSchema,
  telegraphRemainingMs: timeSchema,
  activeRemainingMs: timeSchema,
  hitApplied: z.boolean(),
});

const shockwaveHazardSchema = z.strictObject({
  id: uuidSchema,
  kind: z.literal("boss2-shockwave"),
  origin: vector2Schema,
  radius: nonnegativeNumberSchema,
  maxRadius: nonnegativeNumberSchema,
  speed: nonnegativeNumberSchema,
  damage: nonnegativeNumberSchema,
  telegraphRemainingMs: timeSchema,
  hitPlayer: z.boolean(),
});

const edgeHazardSchema = z.strictObject({
  id: uuidSchema,
  kind: z.literal("boss3-edge"),
  edges: z.enum(["horizontal", "vertical"]),
  telegraphRemainingMs: timeSchema,
  projectilesSpawned: z.boolean(),
});

const safeZoneHazardSchema = z.strictObject({
  id: uuidSchema,
  kind: z.literal("boss3-safe-zone"),
  center: vector2Schema,
  radius: nonnegativeNumberSchema,
  telegraphRemainingMs: timeSchema,
  activeRemainingMs: timeSchema,
  damage: nonnegativeNumberSchema,
  damageApplied: z.boolean(),
});

const activeHazardSchema: z.ZodType<ActiveHazardSnapshot> = z.union([
  arcHazardSchema,
  shockwaveHazardSchema,
  edgeHazardSchema,
  safeZoneHazardSchema,
]);

const bossOneTentacleSchema = z.strictObject({
  id: uuidSchema,
  citizenUserId: uuidSchema.nullable(),
  hp: nonnegativeIntegerSchema,
  angleRadians: finiteNumberSchema,
  attackCooldownMs: timeSchema,
  destroyed: z.boolean(),
});

const bossOneSnapshotSchema: z.ZodType<BossOneSnapshot> = z
  .strictObject({
    kind: z.literal("boss1"),
    variant: z.enum(["normal", "finale"]),
    hp: nonnegativeIntegerSchema,
    position: vector2Schema,
    attackCooldownMs: timeSchema,
    tentacles: z.array(bossOneTentacleSchema).max(GAME_BALANCE.limits.citizens),
  })
  .superRefine((boss, context) => {
    if (boss.variant !== "finale") {
      return;
    }

    if (boss.tentacles.length !== 3) {
      context.addIssue({ code: "custom", message: "Finale boss one must keep three virtual tentacles", path: ["tentacles"] });
    }
    boss.tentacles.forEach((tentacle, tentacleIndex) => {
      if (tentacle.citizenUserId !== null) {
        context.addIssue({
          code: "custom",
          message: "Finale boss one cannot reference a citizen",
          path: ["tentacles", tentacleIndex, "citizenUserId"],
        });
      }
    });
  });

const bossPartSnapshotSchema = z.strictObject({
  hp: nonnegativeIntegerSchema,
  destroyed: z.boolean(),
});

const bossTwoSnapshotSchema: z.ZodType<BossTwoSnapshot> = z.strictObject({
  kind: z.literal("boss2"),
  variant: z.enum(["normal", "finale"]),
  position: vector2Schema,
  stage: z.enum(["shield", "mace-arm", "legs", "core", "defeated"]),
  attackCooldownMs: timeSchema,
  summonCooldownMs: timeSchema,
  shockwaveCooldownMs: timeSchema,
  parts: z.strictObject({
    shield: bossPartSnapshotSchema,
    maceArm: bossPartSnapshotSchema,
    leftLeg: bossPartSnapshotSchema,
    rightLeg: bossPartSnapshotSchema,
    core: bossPartSnapshotSchema,
  }),
});

const bossThreeSnapshotSchema: z.ZodType<BossThreeSnapshot> = z
  .strictObject({
    kind: z.literal("boss3"),
    position: vector2Schema,
    hp: nonnegativeIntegerSchema,
    phase: z.union([z.literal(1), z.literal(2), z.literal("hidden")]),
    patternIndex: nonnegativeIntegerSchema,
    patternCooldownMs: timeSchema,
    savedHp: nonnegativeIntegerSchema,
    finaleTriggered: z.boolean(),
    resumeCountdownMs: timeSchema,
    finaleBossOne: bossOneSnapshotSchema.nullable(),
    finaleBossTwo: bossTwoSnapshotSchema.nullable(),
  })
  .superRefine((boss, context) => {
    if (boss.phase !== "hidden") {
      return;
    }

    if (!boss.finaleTriggered) {
      context.addIssue({ code: "custom", message: "A hidden boss three must have triggered the finale", path: ["finaleTriggered"] });
    }

    if (boss.finaleBossOne !== null && boss.finaleBossOne.variant !== "finale") {
      context.addIssue({ code: "custom", message: "A hidden boss one snapshot must be a finale variant", path: ["finaleBossOne"] });
    }
    if (boss.finaleBossTwo !== null && boss.finaleBossTwo.variant !== "finale") {
      context.addIssue({ code: "custom", message: "A hidden boss two snapshot must be a finale variant", path: ["finaleBossTwo"] });
    }

    const bossOneAlive = boss.finaleBossOne !== null && boss.finaleBossOne.hp > 0;
    const bossTwoAlive =
      boss.finaleBossTwo !== null &&
      !boss.finaleBossTwo.parts.core.destroyed &&
      boss.finaleBossTwo.parts.core.hp > 0;
    if (!bossOneAlive && !bossTwoAlive && boss.resumeCountdownMs === 0) {
      context.addIssue({
        code: "custom",
        message: "A hidden boss three requires a surviving finale boss or resume countdown",
        path: ["phase"],
      });
    }
  });

const bossSnapshotSchema = z.union([bossOneSnapshotSchema, bossTwoSnapshotSchema, bossThreeSnapshotSchema]);
const bossTimesSchema = z.tuple([timeSchema.nullable(), timeSchema.nullable(), timeSchema.nullable()]);

export const gameSaveV1Schema: z.ZodType<GameSaveV1> = z.strictObject({
  version: z.literal(1),
  gameId: z.literal("dex-survivor"),
  ownerObjectId: uuidSchema,
  savedAtEpochMs: timeSchema,
  sessionId: uuidSchema,
  seed: uint32Schema,
  rngState: uint32Schema,
  phase: z.enum(["normal", "boss1", "boss2", "boss3", "finale-adds", "paused", "defeated", "cleared"]),
  phaseBeforePause: z.enum(["normal", "boss1", "boss2", "boss3", "finale-adds"]),
  normalElapsedMs: timeSchema,
  currentBossElapsedMs: timeSchema,
  citizenUserIds: z.array(uuidSchema).max(GAME_BALANCE.limits.citizens),
  rescuedCitizenIds: z.array(uuidSchema).max(GAME_BALANCE.limits.citizens),
  enemyKills: nonnegativeIntegerSchema,
  hitCount: nonnegativeIntegerSchema,
  bossTimesMs: bossTimesSchema,
  player: playerSnapshotSchema,
  wave: waveSnapshotSchema,
  activeHazards: z.array(activeHazardSchema).max(GAME_BALANCE.limits.activeHazards),
  enemies: z.array(enemySnapshotSchema).max(GAME_BALANCE.limits.enemies),
  projectiles: z.array(projectileSnapshotSchema).max(GAME_BALANCE.limits.projectiles),
  pickups: z.array(pickupSnapshotSchema).max(GAME_BALANCE.limits.pickups),
  boss: bossSnapshotSchema.nullable(),
});

export const runResultSchema: z.ZodType<RunResult> = z.strictObject({
  resultId: uuidSchema,
  ownerObjectId: uuidSchema,
  outcome: z.enum(["cleared", "defeated"]),
  score: z.number().int(),
  normalElapsedMs: timeSchema,
  totalActiveMs: timeSchema,
  enemyKills: nonnegativeIntegerSchema,
  hitCount: nonnegativeIntegerSchema,
  bossTimesMs: bossTimesSchema,
  completedAtEpochMs: timeSchema,
});