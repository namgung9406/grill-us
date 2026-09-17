# Task: T05 Boss Two Parts

## Status: done

## Goal
일반 타이머 10분에 `동그라미 재단`이 표시된 건물형 로봇을 생성하고 방패, 철퇴 팔, 양쪽 다리, 가슴 코어의 강제 순서에 따라 공격·이동 능력이 약화되는 전투를 구현한다.

## Decision Summary
- 파괴 순서 밖의 부위는 damage를 받지 않으며 현재 공격 가능한 부위를 시각적으로 강조한다.
- 문구는 sprite texture에 묻지 않고 고해상도 Phaser Text로 선명하게 표시한다.

## Implementation

### I01. 부위 상태기계와 damage routing
- Related Files:
  - `src/games/dex-survivor/domain/bosses.ts` :: `BOSS_TWO_BALANCE/advanceBossTwoStage` — hp와 순서; modify
  - `src/games/dex-survivor/runtime/bosses/BossTwoSystem.ts` :: `BossTwoSystem` — target/damage/attack; new
  - `src/games/dex-survivor/runtime/bosses/BossTwoView.ts` :: `BossTwoView` — building robot, labels, telegraphs; new

#### Details
- **Parts and HP**:
  - shield 1,800; maceArm 1,400; leftLeg 1,200; rightLeg 1,200; core 3,500.
  - stage: `shield -> mace-arm -> legs -> core -> defeated`.
- shield stage에서 shield 외 damage 0. mace stage에서 maceArm 외 0. legs stage에서 양쪽 다리는 어느 순서든 damage 가능하지만 둘 다 파괴되어야 core stage로 전환. core는 마지막에만 damage 가능하다.
- shield는 정면 projectile을 body에 닿기 전 intercept한다. active target은 amber outline, inactive는 `blocked` hit feedback을 표시한다.
- `동그라미 재단`은 core 전면 중앙에 contrast ratio 4.5:1 이상의 text로 렌더하고 viewport 축소에도 읽히도록 최소 화면상 14px을 유지한다.

### I02. 공격 패턴과 단계별 약화
- Related Files:
  - `src/games/dex-survivor/runtime/bosses/BossTwoAttacks.ts` :: `updateBossTwoAttacks` — mace/summon/shockwave; new
  - `src/games/dex-survivor/runtime/GameScene.ts` :: `boss2 phase integration`; modify

#### Details
- 기본 이동 55px/s, contact damage 20.
- mace sweep: damage 25, interval 2,200ms, telegraph 600ms, 150도 arc, radius 190. maceArm 파괴 후 비활성.
- summon: shield 파괴 전 interval 10,000ms 2마리, shield 파괴 후 8,000ms 4마리; 현재 wave eligible 일반 적을 cap 안에서 소환.
- shockwave: damage 15, interval 6,000ms, telegraph 700ms, expanding ring 140px/s; dash invulnerability로 회피 가능.
- 양쪽 다리 생존 55px/s, 한쪽 35px/s, 둘 다 파괴 0px/s. core stage에서는 summon만 유지하고 mace/shockwave는 각각 부위/다리 파괴 상태에 따라 중지한다.
- core hp 0에서 boss2 time을 기록하고 normal phase로 복귀한다.

### I03. 보스 2 테스트
- Related Files:
  - `src/games/dex-survivor/runtime/bosses/BossTwoSystem.test.ts` :: stage/damage/attacks; new
  - `src/games/dex-survivor/domain/bosses.test.ts` :: part transition; new

#### Details
- 잘못된 부위 damage 0, 양 다리 순서 자유, 모든 stage 단일 전이를 검증한다.
- shield/mace/leg 파괴 전후 공격 및 속도 수치, dash shockwave 무적, spawn cap을 검증한다.
- 저장 snapshot에서 각 stage와 cooldown을 복원했을 때 다음 attack timing이 동일함을 검증한다.

## Acceptance Criteria
- [x] 보스 2는 지정 순서 밖의 damage를 거부하고 활성 부위를 명확히 표시한다.
- [x] 부위 파괴가 철퇴 공격, 이동 속도와 core 노출을 정확히 변경한다.
- [x] `동그라미 재단` 문구가 desktop/mobile에서 보스 가슴 중앙에 읽힌다.
- [x] 10분 보스 처치 후 시간이 기록되고 normal timer가 재개된다.

## Validation
- `npm run test -- src/games/dex-survivor/runtime/bosses/BossTwoSystem.test.ts src/games/dex-survivor/domain/bosses.test.ts` — 보스 2 상태기계 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(game): add staged building robot boss

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T05-boss-two-parts

- enforce shield-to-core part destruction order
- weaken mace and movement abilities as robot parts break
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: pending
