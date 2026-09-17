# Task: T01 Game Domain Contracts

## Status: pending

## Goal
Phaser와 브라우저 API 없이도 시간 진행, 난수, 점수, 업그레이드 상한과 전체 게임 스냅샷을 검증할 수 있는 단일 순수 도메인 계약을 만든다.

## Decision Summary
- 모든 시간은 pause를 제외한 정수 밀리초이고 PRNG state를 저장해 복원 후에도 같은 난수열을 유지한다.
- 전체 전투 상태를 500ms 스냅샷으로 복원하되 사진 Blob은 저장하지 않고 시민 object ID만 저장한다.

## Implementation

### I01. 도메인 타입과 상수
- Related Files:
  - `src/games/dex-survivor/domain/types.ts` :: `GameState/entity snapshots/RunResult` — canonical 모델; new
  - `src/games/dex-survivor/domain/constants.ts` :: `GAME_BALANCE` — 모든 전투 상수; new
  - `src/games/dex-survivor/domain/schemas.ts` :: `gameSaveV1Schema/runResultSchema` — runtime 검증; new

#### Details
- **Core Types**:
  ```typescript
  export interface Vector2 { x: number; y: number }
  export type RunOutcome = "cleared" | "defeated";
  export type GamePhase = "normal" | "boss1" | "boss2" | "boss3" | "finale-adds" | "paused" | "defeated" | "cleared";
  export type EnemyType = "chaser" | "ranged" | "splitter" | "splitter-small" | "tank";
  export type UpgradeType = "gun-damage" | "gun-range" | "sword-power" | "dash-capacity" | "dash-recovery" | "ultimate-charge";
  export interface UpgradeLevels {
    gunDamage: number; gunRange: number; swordPower: number;
    dashCapacity: number; dashRecovery: number;
  }
  export interface PlayerSnapshot {
    position: Vector2; velocity: Vector2; hp: number; maxHp: 100;
    facingRadians: number; dashCharges: number; dashRecoveryRemainingMs: readonly number[];
    dashRemainingMs: number; invulnerableRemainingMs: number;
    gunCooldownMs: number; swordCooldownMs: number; swordActiveRemainingMs: number;
    swordStormCooldownMs: number; swordStormActiveRemainingMs: number;
    ultimateCharge: number; ultimateChargeTickRemainderMs: number; upgrades: UpgradeLevels;
  }
  export interface EnemySnapshot {
    id: string; type: EnemyType; position: Vector2; velocity: Vector2;
    hp: number; attackCooldownMs: number; contactCooldownMs: number;
  }
  export interface ProjectileSnapshot {
    id: string; owner: "player" | "enemy"; position: Vector2; velocity: Vector2;
    damage: number; remainingRange: number; radius: number;
  }
  export interface PickupSnapshot {
    id: string; type: UpgradeType; position: Vector2; ttlMs: number;
  }
  export interface WaveSnapshot { spawnCooldownMs: number; tier: number }
  export type ActiveHazardSnapshot =
    | { id: string; kind: "boss1-sweep" | "boss2-mace"; sourceId: string; origin: Vector2; angleRadians: number; arcRadians: number; radius: number; damage: number; telegraphRemainingMs: number; activeRemainingMs: number; hitApplied: boolean }
    | { id: string; kind: "boss2-shockwave"; origin: Vector2; radius: number; maxRadius: number; speed: number; damage: number; telegraphRemainingMs: number; hitPlayer: boolean }
    | { id: string; kind: "boss3-edge"; edges: "horizontal" | "vertical"; telegraphRemainingMs: number; projectilesSpawned: boolean }
    | { id: string; kind: "boss3-safe-zone"; center: Vector2; radius: number; telegraphRemainingMs: number; activeRemainingMs: number; damage: number; damageApplied: boolean };
  ```
- **Boss Snapshot Union**:
  - `BossOneSnapshot`: `kind`, `variant:"normal"|"finale"`, `hp`, `position`, `attackCooldownMs`, `tentacles[]` (`id`, `citizenUserId:string|null`, `hp`, `angleRadians`, `attackCooldownMs`, `destroyed`).
  - `BossTwoSnapshot`: `kind`, `variant:"normal"|"finale"`, `position`, `stage`, `attackCooldownMs`, `summonCooldownMs`, `shockwaveCooldownMs`, parts `{shield,maceArm,leftLeg,rightLeg,core}` each `{hp,destroyed}`.
  - `BossThreeSnapshot`: `kind`, `position`, `hp`, `phase:1|2|"hidden"`, `patternIndex`, `patternCooldownMs`, `savedHp`, `finaleTriggered:boolean`, `resumeCountdownMs`, `finaleBossOne:BossOneSnapshot|null`, `finaleBossTwo:BossTwoSnapshot|null`.
- **GameSaveV1 Fields**:
  ```typescript
  export interface GameSaveV1 {
    version: 1; gameId: "dex-survivor"; ownerObjectId: string; savedAtEpochMs: number;
    sessionId: string; seed: number; rngState: number; phase: GamePhase;
    phaseBeforePause: Exclude<GamePhase, "paused" | "defeated" | "cleared">;
    normalElapsedMs: number; currentBossElapsedMs: number;
    citizenUserIds: readonly string[]; rescuedCitizenIds: readonly string[];
    enemyKills: number; hitCount: number; bossTimesMs: readonly [number | null, number | null, number | null];
    player: PlayerSnapshot; wave: WaveSnapshot; activeHazards: readonly ActiveHazardSnapshot[];
    enemies: readonly EnemySnapshot[];
    projectiles: readonly ProjectileSnapshot[]; pickups: readonly PickupSnapshot[];
    boss: BossOneSnapshot | BossTwoSnapshot | BossThreeSnapshot | null;
  }
  export interface RunResult {
    resultId: string; ownerObjectId: string; outcome: RunOutcome;
    score: number; normalElapsedMs: number; totalActiveMs: number;
    enemyKills: number; hitCount: number;
    bossTimesMs: readonly [number | null, number | null, number | null];
    completedAtEpochMs: number;
  }
  ```
- Zod는 UUID, 유한 수, 좌표 범위 `[-4096,4096]`, hp/cooldown/시간 nonnegative integer, citizen 최대 9명, 엔티티 배열 상한(적 220, 투사체 1000, pickup 100, active hazard 32)을 검증한다.
- `variant="finale"`인 BossOne의 `citizenUserId`는 반드시 null이고 구조 수를 변경하지 않는다. BossThree가 hidden이면 `finaleTriggered=true`이며 약화 보스 둘 중 생존한 snapshot 또는 `resumeCountdownMs>0` 중 하나가 존재해야 한다.

### I02. 결정론적 시간과 난수
- Related Files:
  - `src/games/dex-survivor/domain/random.ts` :: `RandomSource/XorShift32` — 저장 가능한 PRNG; new
  - `src/games/dex-survivor/domain/clock.ts` :: `SimulationClock` — pause 제외 시간; new
  - `src/games/dex-survivor/domain/progression.ts` :: `advanceTimeline` — 5/10/15분 보스 전환; new

#### Details
- **Signatures**:
  ```typescript
  export interface RandomSource { next(): number; integer(min: number, max: number): number; state(): number }
  export class XorShift32 implements RandomSource { constructor(seedOrState: number) }
  export function advanceTimeline(state: GameState, deltaMs: number): GameState;
  ```
- seed/state는 unsigned 32-bit이며 0 입력은 고정 nonzero seed로 치환한다.
- simulation은 정확히 `1000/60`ms step만 받고 한 프레임 catch-up은 최대 5 step; 초과 누적 시간은 버린다.
- `normalElapsedMs`는 normal phase에서만 증가하고 `currentBossElapsedMs`는 boss phase에서만 증가한다. paused/hidden countdown은 둘 다 증가시키지 않는다.
- normal 300,000/600,000/900,000ms 도달 시 해당 보스가 아직 미처치면 phase를 전환한다.

### I03. 점수와 업그레이드 규칙
- Related Files:
  - `src/games/dex-survivor/domain/score.ts` :: `calculateScore/createRunResult` — 클라이언트·서버 공유 가능한 계산; new
  - `src/games/dex-survivor/domain/upgrades.ts` :: `applyUpgrade/derivedStats` — 상한과 파생 수치; new

#### Details
- **Score**: `enemyKills*100 - hitCount*50 + boss bonuses + (cleared ? 10000 : 0)`; 전체 점수는 floor한 정수이며 음수도 허용한다.
- boss bonus threshold는 `[120000,180000,300000]`, 배율은 초당 20점이며 `floor(max(0,(threshold-time)/1000)*20)`이다.
- 업그레이드:
  - gun damage: 최대 5단계, 단계당 기본 피해의 +25%.
  - gun range: 최대 4단계, 단계당 +80px.
  - sword power: 최대 5단계, 피해 +25% 및 범위 +12px/단계.
  - dash capacity: 최대 2단계, 최대 charge `1+level`.
  - dash recovery: 최대 4단계, 회복시간 `max(1500, 3000*0.85^level)`.
  - ultimate charge는 누적 레벨이 아닌 소비성 pickup 예외로 획득 즉시 charge를 100으로 설정한다.
- 상한 도달 영구 업그레이드는 drop 후보에서 제외하고 모든 영구 상한 도달 시 ultimate charge만 drop한다.

### I04. 순수 도메인 테스트
- Related Files:
  - `src/games/dex-survivor/domain/random.test.ts` :: `XorShift32` — state 복원; new
  - `src/games/dex-survivor/domain/progression.test.ts` :: `timeline` — pause와 보스 경계; new
  - `src/games/dex-survivor/domain/score.test.ts` :: `score` — 모든 공식; new
  - `src/games/dex-survivor/domain/schemas.test.ts` :: `GameSaveV1` — 손상·상한·roundtrip; new
  - `src/games/dex-survivor/domain/upgrades.test.ts` :: `upgrades` — 상한·파생값; new

#### Details
- 같은 seed/state의 난수열 일치, 5/10/15분 경계, 보스 중 normal timer 정지, pause 중 전 시간 정지를 검증한다.
- 결정 문서의 점수 예시와 null boss time, 음수 총점, clear bonus를 검증한다.
- JSON stringify/parse 후 schema 결과가 동일하고 NaN/Infinity/과대 배열/사진 URL 필드가 거부됨을 검증한다. wave spawn remainder, ultimate tick remainder, sword active frame, boss telegraph·shockwave·safe-zone 중간 상태를 roundtrip한 뒤 다음 simulation step이 원본과 동일해야 한다.

## Acceptance Criteria
- [ ] Phaser 없이 seed와 입력 delta만으로 동일한 timeline·점수·업그레이드 결과를 재현한다.
- [ ] `GameSaveV1`은 사진 데이터를 포함하지 않고 전체 전투 상태를 roundtrip한다.
- [ ] 보스전과 pause 동안 일반 5/10/15분 타이머가 증가하지 않는다.
- [ ] 모든 업그레이드 상한과 ultimate 소비성 예외가 테스트된다.

## Validation
- `npm run test -- src/games/dex-survivor/domain` — 순수 도메인 테스트 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(game): define deterministic DEX Survivor domain

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T01-game-domain-contracts

- add serializable game state, seeded random, and timeline rules
- codify scoring and bounded upgrade progression
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
