import { GAME_BALANCE } from "./constants";
import type { BossOneSnapshot, BossOneTentacleSnapshot, Vector2 } from "./types";

export const BOSS_ONE_BALANCE = GAME_BALANCE.bosses.bossOne;

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