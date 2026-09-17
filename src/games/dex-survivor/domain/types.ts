export interface Vector2 {
  x: number;
  y: number;
}

export type RunOutcome = "cleared" | "defeated";

export type GamePhase =
  | "normal"
  | "boss1"
  | "boss2"
  | "boss3"
  | "finale-adds"
  | "paused"
  | "defeated"
  | "cleared";

export type ActiveGamePhase = Exclude<GamePhase, "paused" | "defeated" | "cleared">;

export type EnemyType = "chaser" | "ranged" | "splitter" | "splitter-small" | "tank";

export type UpgradeType =
  | "gun-damage"
  | "gun-range"
  | "sword-power"
  | "dash-capacity"
  | "dash-recovery"
  | "ultimate-charge";

export interface UpgradeLevels {
  gunDamage: number;
  gunRange: number;
  swordPower: number;
  dashCapacity: number;
  dashRecovery: number;
}

export interface PlayerSnapshot {
  position: Vector2;
  velocity: Vector2;
  hp: number;
  maxHp: 100;
  facingRadians: number;
  dashCharges: number;
  dashRecoveryRemainingMs: readonly number[];
  dashRemainingMs: number;
  invulnerableRemainingMs: number;
  gunCooldownMs: number;
  swordCooldownMs: number;
  swordActiveRemainingMs: number;
  swordStormCooldownMs: number;
  swordStormActiveRemainingMs: number;
  ultimateCharge: number;
  ultimateChargeTickRemainderMs: number;
  upgrades: UpgradeLevels;
}

export interface EnemySnapshot {
  id: string;
  type: EnemyType;
  position: Vector2;
  velocity: Vector2;
  hp: number;
  attackCooldownMs: number;
  contactCooldownMs: number;
}

export interface ProjectileSnapshot {
  id: string;
  owner: "player" | "enemy";
  position: Vector2;
  velocity: Vector2;
  damage: number;
  remainingRange: number;
  radius: number;
}

export interface PickupSnapshot {
  id: string;
  type: UpgradeType;
  position: Vector2;
  ttlMs: number;
}

export interface WaveSnapshot {
  spawnCooldownMs: number;
  tier: number;
}

export type ActiveHazardSnapshot =
  | {
      id: string;
      kind: "boss1-sweep" | "boss2-mace";
      sourceId: string;
      origin: Vector2;
      angleRadians: number;
      arcRadians: number;
      radius: number;
      damage: number;
      telegraphRemainingMs: number;
      activeRemainingMs: number;
      hitApplied: boolean;
    }
  | {
      id: string;
      kind: "boss2-shockwave";
      origin: Vector2;
      radius: number;
      maxRadius: number;
      speed: number;
      damage: number;
      telegraphRemainingMs: number;
      hitPlayer: boolean;
    }
  | {
      id: string;
      kind: "boss3-edge";
      edges: "horizontal" | "vertical";
      telegraphRemainingMs: number;
      projectilesSpawned: boolean;
    }
  | {
      id: string;
      kind: "boss3-safe-zone";
      center: Vector2;
      radius: number;
      telegraphRemainingMs: number;
      activeRemainingMs: number;
      damage: number;
      damageApplied: boolean;
    };

export interface BossOneTentacleSnapshot {
  id: string;
  citizenUserId: string | null;
  hp: number;
  angleRadians: number;
  attackCooldownMs: number;
  destroyed: boolean;
}

export interface BossOneSnapshot {
  kind: "boss1";
  variant: "normal" | "finale";
  hp: number;
  position: Vector2;
  attackCooldownMs: number;
  tentacles: readonly BossOneTentacleSnapshot[];
}

export type BossTwoStage = "shield" | "mace-arm" | "legs" | "core" | "defeated";

export interface BossPartSnapshot {
  hp: number;
  destroyed: boolean;
}

export interface BossTwoPartsSnapshot {
  shield: BossPartSnapshot;
  maceArm: BossPartSnapshot;
  leftLeg: BossPartSnapshot;
  rightLeg: BossPartSnapshot;
  core: BossPartSnapshot;
}

export interface BossTwoSnapshot {
  kind: "boss2";
  variant: "normal" | "finale";
  position: Vector2;
  stage: BossTwoStage;
  attackCooldownMs: number;
  summonCooldownMs: number;
  shockwaveCooldownMs: number;
  parts: BossTwoPartsSnapshot;
}

export interface BossThreeSnapshot {
  kind: "boss3";
  position: Vector2;
  hp: number;
  phase: 1 | 2 | "hidden";
  patternIndex: number;
  patternCooldownMs: number;
  savedHp: number;
  finaleTriggered: boolean;
  resumeCountdownMs: number;
  finaleBossOne: BossOneSnapshot | null;
  finaleBossTwo: BossTwoSnapshot | null;
}

export type BossSnapshot = BossOneSnapshot | BossTwoSnapshot | BossThreeSnapshot;

export interface GameSaveV1 {
  version: 1;
  gameId: "dex-survivor";
  ownerObjectId: string;
  savedAtEpochMs: number;
  sessionId: string;
  seed: number;
  rngState: number;
  phase: GamePhase;
  phaseBeforePause: ActiveGamePhase;
  normalElapsedMs: number;
  currentBossElapsedMs: number;
  citizenUserIds: readonly string[];
  rescuedCitizenIds: readonly string[];
  enemyKills: number;
  hitCount: number;
  bossTimesMs: readonly [number | null, number | null, number | null];
  player: PlayerSnapshot;
  wave: WaveSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  enemies: readonly EnemySnapshot[];
  projectiles: readonly ProjectileSnapshot[];
  pickups: readonly PickupSnapshot[];
  boss: BossSnapshot | null;
}

export type GameState = GameSaveV1;

export interface RunResult {
  resultId: string;
  ownerObjectId: string;
  outcome: RunOutcome;
  score: number;
  normalElapsedMs: number;
  totalActiveMs: number;
  enemyKills: number;
  hitCount: number;
  bossTimesMs: readonly [number | null, number | null, number | null];
  completedAtEpochMs: number;
}