import { GAME_BALANCE } from "./constants";
import type { EnemyType } from "./types";

export type EnemyArchetype =
  | {
      readonly type: "chaser" | "tank";
      readonly hp: number;
      readonly speed: number;
      readonly contactDamage: number;
      readonly radius: number;
    }
  | {
      readonly type: "ranged";
      readonly hp: number;
      readonly speed: number;
      readonly preferredDistance: number;
      readonly minimumDistance: number;
      readonly maximumDistance: number;
      readonly projectileDamage: number;
      readonly projectileSpeed: number;
      readonly attackCooldownMs: number;
      readonly radius: number;
    }
  | {
      readonly type: "splitter";
      readonly hp: number;
      readonly speed: number;
      readonly contactDamage: number;
      readonly children: number;
    }
  | {
      readonly type: "splitter-small";
      readonly hp: number;
      readonly speed: number;
      readonly contactDamage: number;
    };

export const ENEMY_ARCHETYPES = {
  chaser: { type: "chaser", ...GAME_BALANCE.enemies.chaser },
  ranged: { type: "ranged", ...GAME_BALANCE.enemies.ranged },
  splitter: { type: "splitter", ...GAME_BALANCE.enemies.splitter },
  "splitter-small": { type: "splitter-small", ...GAME_BALANCE.enemies.splitterSmall },
  tank: { type: "tank", ...GAME_BALANCE.enemies.tank },
} as const satisfies Record<EnemyType, EnemyArchetype>;

export const SPAWNABLE_ENEMY_TYPES = ["chaser", "ranged", "splitter", "tank"] as const;
export type SpawnableEnemyType = (typeof SPAWNABLE_ENEMY_TYPES)[number];

export function enemyRadius(type: EnemyType): number {
  if (type === "splitter") {
    return 18;
  }
  if (type === "splitter-small") {
    return 11;
  }
  return ENEMY_ARCHETYPES[type].radius;
}