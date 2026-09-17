import { GAME_BALANCE } from "./constants";
import type {
  BossOneSnapshot,
  BossOneTentacleSnapshot,
  BossThreeSnapshot,
  BossTwoPartsSnapshot,
  BossTwoSnapshot,
  BossTwoStage,
  Vector2,
} from "./types";

export const BOSS_ONE_BALANCE = GAME_BALANCE.bosses.bossOne;
export const BOSS_TWO_BALANCE = GAME_BALANCE.bosses.bossTwo;
export const BOSS_THREE_BALANCE = GAME_BALANCE.bosses.bossThree;

export type BossTwoPartKey = keyof BossTwoPartsSnapshot;
export type BossThreePhase = BossThreeSnapshot["phase"];

export const BOSS_TWO_PART_LAYOUT = {
  shield: { offset: { x: -104, y: 0 }, radius: 48 },
  maceArm: { offset: { x: 108, y: -4 }, radius: 40 },
  leftLeg: { offset: { x: -48, y: 100 }, radius: 36 },
  rightLeg: { offset: { x: 48, y: 100 }, radius: 36 },
  core: { offset: { x: 0, y: 0 }, radius: 70 },
} as const satisfies Record<BossTwoPartKey, { offset: Vector2; radius: number }>;

function tentacleId(index: number): string {
  return `10000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`;
}

export function createBossOneState(citizenUserIds: readonly string[]): BossOneSnapshot {
  const uniqueCitizenUserIds = [...new Set(citizenUserIds)];
  if (uniqueCitizenUserIds.length > GAME_BALANCE.limits.citizens) {
    throw new RangeError(`Boss one supports at most ${GAME_BALANCE.limits.citizens} citizens`);
  }

  const tentacles: BossOneTentacleSnapshot[] = uniqueCitizenUserIds.map((citizenUserId, index) => ({
    id: tentacleId(index),
    citizenUserId,
    hp: BOSS_ONE_BALANCE.tentacleHp,
    angleRadians: (index * Math.PI * 2) / uniqueCitizenUserIds.length,
    attackCooldownMs: 0,
    destroyed: false,
  }));

  return {
    kind: "boss1",
    variant: "normal",
    hp: BOSS_ONE_BALANCE.hp,
    position: { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 },
    attackCooldownMs: 0,
    tentacles,
  };
}

export function bossOneTentaclePosition(boss: BossOneSnapshot, angleRadians: number): Vector2 {
  const distance = BOSS_ONE_BALANCE.radius + BOSS_ONE_BALANCE.sweepReach / 2;
  return {
    x: boss.position.x + Math.cos(angleRadians) * distance,
    y: boss.position.y + Math.sin(angleRadians) * distance,
  };
}

export function bossOneCitizenPosition(boss: BossOneSnapshot, angleRadians: number): Vector2 {
  const distance = BOSS_ONE_BALANCE.radius + BOSS_ONE_BALANCE.sweepReach + 32;
  return {
    x: boss.position.x + Math.cos(angleRadians) * distance,
    y: boss.position.y + Math.sin(angleRadians) * distance,
  };
}

export function createBossTwoState(variant: BossTwoSnapshot["variant"] = "normal"): BossTwoSnapshot {
  return {
    kind: "boss2",
    variant,
    position: { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 },
    stage: "shield",
    attackCooldownMs: 0,
    summonCooldownMs: 0,
    shockwaveCooldownMs: 0,
    parts: {
      shield: { hp: BOSS_TWO_BALANCE.partHp.shield, destroyed: false },
      maceArm: { hp: BOSS_TWO_BALANCE.partHp.maceArm, destroyed: false },
      leftLeg: { hp: BOSS_TWO_BALANCE.partHp.leftLeg, destroyed: false },
      rightLeg: { hp: BOSS_TWO_BALANCE.partHp.rightLeg, destroyed: false },
      core: { hp: BOSS_TWO_BALANCE.partHp.core, destroyed: false },
    },
  };
}

export function createBossThreeState(): BossThreeSnapshot {
  return {
    kind: "boss3",
    position: { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 },
    hp: BOSS_THREE_BALANCE.hp,
    phase: 1,
    patternIndex: 0,
    patternCooldownMs: BOSS_THREE_BALANCE.minimumTelegraphMs,
    savedHp: 0,
    finaleTriggered: false,
    resumeCountdownMs: 0,
    finaleBossOne: null,
    finaleBossTwo: null,
  };
}

export function createFinaleBossOneState(position: Vector2): BossOneSnapshot {
  const tentacles: BossOneTentacleSnapshot[] = Array.from({ length: 3 }, (_, index) => ({
    id: tentacleId(index),
    citizenUserId: null,
    hp: BOSS_ONE_BALANCE.tentacleHp * BOSS_THREE_BALANCE.weakenedHpMultiplier,
    angleRadians: (index * Math.PI * 2) / 3,
    attackCooldownMs: 0,
    destroyed: false,
  }));
  return {
    kind: "boss1",
    variant: "finale",
    hp: BOSS_ONE_BALANCE.hp * BOSS_THREE_BALANCE.weakenedHpMultiplier,
    position: { ...position },
    attackCooldownMs: 0,
    tentacles,
  };
}

export function createFinaleBossTwoState(position: Vector2): BossTwoSnapshot {
  const boss = createBossTwoState("finale");
  return {
    ...boss,
    position: { ...position },
    parts: {
      shield: { hp: boss.parts.shield.hp * BOSS_THREE_BALANCE.weakenedHpMultiplier, destroyed: false },
      maceArm: { hp: boss.parts.maceArm.hp * BOSS_THREE_BALANCE.weakenedHpMultiplier, destroyed: false },
      leftLeg: { hp: boss.parts.leftLeg.hp * BOSS_THREE_BALANCE.weakenedHpMultiplier, destroyed: false },
      rightLeg: { hp: boss.parts.rightLeg.hp * BOSS_THREE_BALANCE.weakenedHpMultiplier, destroyed: false },
      core: { hp: boss.parts.core.hp * BOSS_THREE_BALANCE.weakenedHpMultiplier, destroyed: false },
    },
  };
}

export function activeBossTwoParts(boss: BossTwoSnapshot): readonly BossTwoPartKey[] {
  if (boss.stage === "shield") {
    return ["shield"];
  }
  if (boss.stage === "mace-arm") {
    return ["maceArm"];
  }
  if (boss.stage === "legs") {
    return (["leftLeg", "rightLeg"] as const).filter((part) => !boss.parts[part].destroyed);
  }
  if (boss.stage === "core") {
    return ["core"];
  }
  return [];
}

export function bossTwoPartPosition(boss: BossTwoSnapshot, part: BossTwoPartKey): Vector2 {
  const { offset } = BOSS_TWO_PART_LAYOUT[part];
  return { x: boss.position.x + offset.x, y: boss.position.y + offset.y };
}

export function advanceBossTwoStage(boss: BossTwoSnapshot): BossTwoSnapshot {
  const parts: BossTwoPartsSnapshot = {
    shield: normalizePart(boss.parts.shield),
    maceArm: normalizePart(boss.parts.maceArm),
    leftLeg: normalizePart(boss.parts.leftLeg),
    rightLeg: normalizePart(boss.parts.rightLeg),
    core: normalizePart(boss.parts.core),
  };
  let stage: BossTwoStage;
  if (!parts.shield.destroyed) {
    stage = "shield";
  } else if (!parts.maceArm.destroyed) {
    stage = "mace-arm";
  } else if (!parts.leftLeg.destroyed || !parts.rightLeg.destroyed) {
    stage = "legs";
  } else if (!parts.core.destroyed) {
    stage = "core";
  } else {
    stage = "defeated";
  }
  return { ...boss, stage, parts };
}

function normalizePart(part: BossTwoPartsSnapshot[BossTwoPartKey]): BossTwoPartsSnapshot[BossTwoPartKey] {
  const hp = Math.max(0, part.hp);
  return { hp, destroyed: part.destroyed || hp === 0 };
}