# Task: T03 Enemies and Upgrades

## Status: pending

## Goal
일반 적 4종과 30초 밀도 곡선을 결정론적으로 생성하고, 15% drop·자동 획득·상한형 성장과 플레이어 외형 변화를 완성한다.

## Decision Summary
- 적 AI와 spawn/drop 선택은 저장 가능한 PRNG만 사용한다.
- ultimate charge는 즉시 소비되는 pickup이며 나머지 5종만 영구 단계로 저장한다.

## Implementation

### I01. 적 archetype과 AI
- Related Files:
  - `src/games/dex-survivor/runtime/systems/EnemySystem.ts` :: `EnemySystem` — spawn/update/death/split; new
  - `src/games/dex-survivor/domain/enemies.ts` :: `ENEMY_ARCHETYPES` — 수치 테이블; new
  - `src/games/dex-survivor/runtime/entities/EnemyView.ts` :: `EnemyView` — procedural sprite sync; new

#### Details
- **Archetype Table**:
  - chaser: hp 60, speed 90, contact damage 10, radius 18.
  - ranged: hp 45, speed 70, preferred distance 320, projectile damage 8, speed 360, attack 1600ms, radius 16.
  - splitter: hp 70, speed 80, contact 10, death 시 splitter-small 3개.
  - splitter-small: hp 20, speed 130, contact 6, 추가 분열 없음, 일반 spawn 대상 아님.
  - tank: hp 220, speed 45, contact 20, radius 28.
- AI는 player와의 정규화 방향과 정수 cooldown만 사용한다. ranged는 280~360px band를 유지하고 line-of-fire projectile을 발사한다.
- 적은 arena 바깥 32px의 네 변 중 PRNG 선택 위치에서 생성하며 player 240px 이내에는 생성하지 않는다.
- kill count는 일반 적과 splitter-small 처치만 포함하고 보스·보스 부위·소환된 약화 보스는 제외한다.

### I02. 웨이브 밀도와 상한
- Related Files:
  - `src/games/dex-survivor/domain/waves.ts` :: `getWaveBudget/selectEnemyType` — 순수 spawn 규칙; new

#### Details
- tier는 `floor(normalElapsedMs/30000)`.
- spawn interval은 `max(250, 1200 - tier*50)`ms, 동시 cap은 `min(180, 25 + tier*5)`.
- normal 10분 이후 interval에 0.65를 곱해 정수화하고 cap에 40을 더하되 최종 220을 넘지 않는다.
- type weight:
  - tier 0~3: chaser 80, ranged 20.
  - tier 4~9: chaser 45, ranged 25, splitter 20, tank 10.
  - tier 10+: chaser 30, ranged 25, splitter 25, tank 20.
- boss phase에는 일반 자동 spawn을 정지하되 보스가 명시적으로 소환한 적은 cap 안에서 허용한다.

### I03. drop, pickup과 외형 단계
- Related Files:
  - `src/games/dex-survivor/runtime/systems/PickupSystem.ts` :: `PickupSystem` — 15% drop/auto collect/ttl; new
  - `src/games/dex-survivor/runtime/entities/PlayerView.ts` :: `applyAppearanceLevel` — armor/weapon/trail/core; modify
  - `src/games/dex-survivor/domain/upgrades.ts` :: `eligibleDrops` — 상한 제외; modify

#### Details
- 적 사망마다 PRNG `next()<0.15`; pickup ttl 15,000ms, 자동 획득 반경 48px.
- eligible 영구 upgrade를 동일 weight로 선택하고 모두 max면 ultimate-charge를 선택한다. ultimate-charge도 일반 후보에 weight 1로 포함한다.
- 외형은 각 해당 level을 0~max 구간으로 texture tint/크기/궤적에 반영하되 sprite body 크기는 변경하지 않는다.
- gun: barrel/tint, sword: blade length/trail, dash: trail tint/count, ultimate 100: core pulse를 사용한다.

### I04. 적·성장 테스트
- Related Files:
  - `src/games/dex-survivor/domain/waves.test.ts` :: tier/cap/weights; new
  - `src/games/dex-survivor/runtime/systems/EnemySystem.test.ts` :: AI/split/count; new
  - `src/games/dex-survivor/runtime/systems/PickupSystem.test.ts` :: drop/ttl/cap; new

#### Details
- 30초 경계, 10분 대량 출현, cap, boss 중 정지, splitter 1회 분열을 검증한다.
- 고정 난수열로 정확히 15% 판단 경계와 max upgrade 제외, ultimate 즉시 100을 검증한다.

## Acceptance Criteria
- [ ] 4종 적이 지정 역할과 수치로 행동하고 splitter-small은 재분열하지 않는다.
- [ ] 30초마다 밀도가 증가하며 10분 이후 공식과 동시 적 상한을 지킨다.
- [ ] drop과 upgrade 선택은 seed로 재현되고 상한을 초과하지 않는다.
- [ ] 성장 외형이 충돌 body나 저장 수치를 변경하지 않는다.

## Validation
- `npm run test -- src/games/dex-survivor/domain/waves.test.ts src/games/dex-survivor/runtime/systems/EnemySystem.test.ts src/games/dex-survivor/runtime/systems/PickupSystem.test.ts` — 적·성장 테스트 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(game): add enemy waves and bounded upgrades

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T03-enemies-upgrades

- implement four deterministic enemy archetypes and density scaling
- add capped item drops with visible equipment progression
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending