import { describe, expect, it } from "vitest";

import { GAME_BALANCE } from "./constants";
import { advanceTimeline } from "./progression";
import { gameSaveV1Schema, runResultSchema } from "./schemas";
import type {
  ActiveHazardSnapshot,
  EnemySnapshot,
  GameSaveV1,
  PickupSnapshot,
  ProjectileSnapshot,
} from "./types";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000002";
const CITIZEN_ID = "00000000-0000-4000-8000-000000000003";
const ENEMY_ID = "00000000-0000-4000-8000-000000000004";
const PROJECTILE_ID = "00000000-0000-4000-8000-000000000005";
const PICKUP_ID = "00000000-0000-4000-8000-000000000006";

const enemy: EnemySnapshot = {
  id: ENEMY_ID,
  type: "ranged",
  position: { x: 120, y: -40 },
  velocity: { x: 2, y: 3 },
  hp: 45,
  attackCooldownMs: 321,
  contactCooldownMs: 90,
};

const projectile: ProjectileSnapshot = {
  id: PROJECTILE_ID,
  owner: "enemy",
  position: { x: 100, y: 100 },
  velocity: { x: -120, y: 20 },
  damage: 8,
  remainingRange: 350,
  radius: 4,
};

const pickup: PickupSnapshot = {
  id: PICKUP_ID,
  type: "gun-range",
  position: { x: 60, y: 70 },
  ttlMs: 12_345,
};

const hazards: readonly ActiveHazardSnapshot[] = [
  {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "boss1-sweep",
    sourceId: "00000000-0000-4000-8000-000000000012",
    origin: { x: 20, y: 30 },
    angleRadians: 1.2,
    arcRadians: 1.9,
    radius: 220,
    damage: 20,
    telegraphRemainingMs: 225,
    activeRemainingMs: 120,
    hitApplied: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    kind: "boss2-shockwave",
    origin: { x: 0, y: 0 },
    radius: 42,
    maxRadius: 500,
    speed: 140,
    damage: 15,
    telegraphRemainingMs: 333,
    hitPlayer: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    kind: "boss3-edge",
    edges: "horizontal",
    telegraphRemainingMs: 800,
    projectilesSpawned: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    kind: "boss3-safe-zone",
    center: { x: 130, y: -80 },
    radius: 90,
    telegraphRemainingMs: 700,
    activeRemainingMs: 800,
    damage: 20,
    damageApplied: false,
  },
];

function createSave(): GameSaveV1 {
  return {
    version: 1,
    gameId: "dex-survivor",
    ownerObjectId: OWNER_ID,
    savedAtEpochMs: 1_800_000_000_000,
    sessionId: SESSION_ID,
    seed: 1234,
    rngState: 987_654_321,
    phase: "boss3",
    phaseBeforePause: "boss3",
    normalElapsedMs: 900_000,
    currentBossElapsedMs: 45_000,
    citizenUserIds: [CITIZEN_ID],
    rescuedCitizenIds: [CITIZEN_ID],
    enemyKills: 82,
    hitCount: 4,
    bossTimesMs: [100_000, 160_000, null],
    player: {
      position: { x: 10, y: 20 },
      velocity: { x: 1, y: -1 },
      hp: 73,
      maxHp: 100,
      facingRadians: 0.75,
      dashCharges: 2,
      dashRecoveryRemainingMs: [1450],
      dashRemainingMs: 90,
      invulnerableRemainingMs: 140,
      gunCooldownMs: 120,
      swordCooldownMs: 300,
      swordActiveRemainingMs: 60,
      swordStormCooldownMs: 5000,
      swordStormActiveRemainingMs: 80,
      ultimateCharge: 44,
      ultimateChargeTickRemainderMs: 455,
      upgrades: { gunDamage: 2, gunRange: 1, swordPower: 3, dashCapacity: 1, dashRecovery: 2 },
    },
    wave: { spawnCooldownMs: 777, tier: 30 },
    activeHazards: hazards,
    enemies: [enemy],
    projectiles: [projectile],
    pickups: [pickup],
    boss: {
      kind: "boss3",
      position: { x: 0, y: -120 },
      hp: 3200,
      phase: 2,
      patternIndex: 3,
      patternCooldownMs: 650,
      savedHp: 3200,
      finaleTriggered: false,
      resumeCountdownMs: 0,
      finaleBossOne: null,
      finaleBossTwo: null,
    },
  };
}

describe("gameSaveV1Schema", () => {
  it("전체 전투 중간 상태를 JSON roundtrip하고 다음 timeline step도 같게 유지한다", () => {
    const original = createSave();
    const restored = gameSaveV1Schema.parse(JSON.parse(JSON.stringify(original)));

    expect(restored).toEqual(original);
    expect(advanceTimeline(restored, 17)).toEqual(advanceTimeline(original, 17));
  });

  it("NaN, Infinity, 음수 cooldown과 좌표 범위 초과를 거부한다", () => {
    const valid = createSave();
    expect(gameSaveV1Schema.safeParse({ ...valid, player: { ...valid.player, position: { x: Number.NaN, y: 0 } } }).success).toBe(false);
    expect(gameSaveV1Schema.safeParse({ ...valid, player: { ...valid.player, facingRadians: Number.POSITIVE_INFINITY } }).success).toBe(false);
    expect(gameSaveV1Schema.safeParse({ ...valid, wave: { ...valid.wave, spawnCooldownMs: -1 } }).success).toBe(false);
    expect(gameSaveV1Schema.safeParse({ ...valid, player: { ...valid.player, position: { x: 4097, y: 0 } } }).success).toBe(false);
  });

  it("각 엔티티 배열 상한을 초과한 저장을 거부한다", () => {
    const valid = createSave();
    expect(gameSaveV1Schema.safeParse({ ...valid, enemies: Array(GAME_BALANCE.limits.enemies + 1).fill(enemy) }).success).toBe(false);
    expect(
      gameSaveV1Schema.safeParse({ ...valid, projectiles: Array(GAME_BALANCE.limits.projectiles + 1).fill(projectile) }).success,
    ).toBe(false);
    expect(gameSaveV1Schema.safeParse({ ...valid, pickups: Array(GAME_BALANCE.limits.pickups + 1).fill(pickup) }).success).toBe(false);
    expect(
      gameSaveV1Schema.safeParse({ ...valid, activeHazards: Array(GAME_BALANCE.limits.activeHazards + 1).fill(hazards[0]) }).success,
    ).toBe(false);
  });

  it("사진 URL과 다른 정의되지 않은 필드를 거부한다", () => {
    const valid = createSave();
    const withPhoto = { ...valid, player: { ...valid.player, photoUrl: "blob:member-photo" } };
    expect(gameSaveV1Schema.safeParse(withPhoto).success).toBe(false);
  });

  it("hidden 보스는 finale 상태와 생존 보스 또는 resume countdown을 요구한다", () => {
    const valid = createSave();
    const invalidHiddenBoss = {
      kind: "boss3" as const,
      position: { x: 0, y: 0 },
      hp: 700,
      phase: "hidden" as const,
      patternIndex: 0,
      patternCooldownMs: 0,
      savedHp: 700,
      finaleTriggered: false,
      resumeCountdownMs: 0,
      finaleBossOne: null,
      finaleBossTwo: null,
    };
    expect(gameSaveV1Schema.safeParse({ ...valid, phase: "finale-adds", boss: invalidHiddenBoss }).success).toBe(false);

    const validHiddenBoss = { ...invalidHiddenBoss, finaleTriggered: true, resumeCountdownMs: 3000 };
    expect(gameSaveV1Schema.safeParse({ ...valid, phase: "finale-adds", boss: validHiddenBoss }).success).toBe(true);
  });

  it("finale boss1에서 시민 ID를 거부하고 가상 촉수 세 개를 유지한다", () => {
    const valid = createSave();
    const tentacle = {
      id: "00000000-0000-4000-8000-000000000020",
      citizenUserId: CITIZEN_ID,
      hp: 180,
      angleRadians: 0,
      attackCooldownMs: 200,
      destroyed: false,
    };
    const finaleBoss = {
      kind: "boss1" as const,
      variant: "finale" as const,
      hp: 2400,
      position: { x: 0, y: 0 },
      attackCooldownMs: 500,
      tentacles: [tentacle, { ...tentacle, id: "00000000-0000-4000-8000-000000000021" }, { ...tentacle, id: "00000000-0000-4000-8000-000000000022" }],
    };
    expect(gameSaveV1Schema.safeParse({ ...valid, phase: "boss1", boss: finaleBoss }).success).toBe(false);
    expect(
      gameSaveV1Schema.safeParse({
        ...valid,
        phase: "boss1",
        boss: { ...finaleBoss, tentacles: finaleBoss.tentacles.map((entry) => ({ ...entry, citizenUserId: null })) },
      }).success,
    ).toBe(true);
  });
});

describe("runResultSchema", () => {
  it("완결 결과를 검증하고 잘못된 UUID와 non-integer score를 거부한다", () => {
    const result = {
      resultId: "00000000-0000-4000-8000-000000000030",
      ownerObjectId: OWNER_ID,
      outcome: "cleared" as const,
      score: 15_000,
      normalElapsedMs: 900_000,
      totalActiveMs: 1_100_000,
      enemyKills: 50,
      hitCount: 2,
      bossTimesMs: [100_000, 150_000, 250_000] as const,
      completedAtEpochMs: 1_800_000_000_000,
    };
    expect(runResultSchema.parse(result)).toEqual(result);
    expect(runResultSchema.safeParse({ ...result, resultId: "invalid" }).success).toBe(false);
    expect(runResultSchema.safeParse({ ...result, score: 1.5 }).success).toBe(false);
  });
});