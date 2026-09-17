# Task: T06 Boss Three Finale

## Status: pending

## Goal
일반 타이머 15분에 중앙 `DEX` 문구와 다면체 코어가 있는 우주선을 등장시키고, 50% 2페이즈와 10% 약화 보스 동시 재등장, 3초 복귀 카운트다운까지 완결한다.

## Decision Summary
- 탄막은 회전 링, 조준 연사, 가장자리 압축, 이동 안전지대를 순환·중첩한다.
- 10% 기믹은 한 번만 발동하며 최종 보스 hp와 2페이즈 상태를 보존한다.

## Implementation

### I01. 우주선 상태와 시각 구성
- Related Files:
  - `src/games/dex-survivor/domain/bosses.ts` :: `BOSS_THREE_BALANCE/BossThreePhase` — hp/threshold; modify
  - `src/games/dex-survivor/runtime/bosses/BossThreeSystem.ts` :: `BossThreeSystem` — phase/pattern/finale; new
  - `src/games/dex-survivor/runtime/bosses/BossThreeView.ts` :: `BossThreeView` — ship, DEX, polyhedron core; new

#### Details
- hp 8,000, phase2 threshold 4,000, finale threshold 800, contact damage 25.
- 외형은 좌우 대칭 우주선, 중앙 코어는 회전 다면체를 Graphics polygon layer로 표현한다. phase2에서 균열 line과 부유 fragment를 추가한다.
- `DEX`는 중앙 선체에 고대비 대문자로 표시하고 최소 화면상 28px을 유지한다.
- hp가 4,000 이하로 처음 내려갈 때 phase2. hp가 800 이하로 처음 내려갈 때 `savedHp=max(1,currentHp)`, phase hidden, hitbox·view·pattern 중지, finale를 시작한다.

### I02. 탄막 pattern scheduler
- Related Files:
  - `src/games/dex-survivor/runtime/bosses/BulletPatterns.ts` :: `spawnRing/spawnAimedBurst/spawnEdgeCompression/createSafeZone`; new
  - `src/games/dex-survivor/runtime/bosses/BossThreeSystem.ts` :: scheduler; modify

#### Details
- ring: phase1 24발, 130px/s, 2,800ms; phase2 32발, 170px/s, 반대 회전 ring과 1,900ms.
- aimed burst: 5발, 120ms 간격, 280px/s, damage 10; phase2 8발, 90ms, damage 12.
- edge compression: 선택한 두 opposite edge에서 36발, 중앙으로 100px/s, damage 12, 1,000ms telegraph.
- safe zone: radius 90 원을 PRNG 위치 3개로 2초마다 이동, zone 밖에 1,500ms 후 damage 20을 1회 적용; 이동 경로를 미리 표시한다.
- phase1은 ring/aimed 순환, phase2는 ring+aimed, edge+safe-zone 조합을 순환한다. 모든 pattern은 최소 600ms telegraph와 deterministic patternIndex를 사용한다.

### I03. 약화 보스 동시 재등장
- Related Files:
  - `src/games/dex-survivor/runtime/bosses/FinaleAddsSystem.ts` :: `FinaleAddsSystem` — weakened boss1/boss2; new
  - `src/games/dex-survivor/ui/ResumeCountdown.tsx` :: `ResumeCountdown` — 3초 표시; new
  - `src/games/dex-survivor/runtime/GameScene.ts` :: `finale-adds/countdown/clear`; modify

#### Details
- weakened boss1은 시민 사진 없이 가상 구조 node 3개와 tentacle 3개를 사용하고 body/tentacle max hp를 원본의 60%, damage를 70%로 적용한다. 구출 수는 변경하지 않는다.
- weakened boss2는 모든 부위 순서를 유지하고 각 part max hp 60%, damage 70%를 적용한다.
- arena 좌우에 동시에 생성하며 둘 중 하나를 먼저 처치해도 다른 하나는 유지한다. enemy kill 및 bossTimes에는 포함하지 않는다.
- 둘 다 처치하면 모든 projectile을 제거하고 simulation을 멈춘 채 React 3→2→1 countdown을 1초 wall clock으로 표시한다. countdown은 플레이 시간에 포함하지 않는다.
- 이후 boss3를 `savedHp`, phase2, 다음 pattern index로 복원한다. 이 기믹은 `finaleTriggered=true`로 재발동을 금지한다.
- boss3 hp 0에서 boss3 time 기록, outcome cleared, +10,000 score 경로를 호출한다.

### I04. 보스 3 테스트
- Related Files:
  - `src/games/dex-survivor/runtime/bosses/BossThreeSystem.test.ts` :: thresholds/patterns/finale; new
  - `src/games/dex-survivor/runtime/bosses/BulletPatterns.test.ts` :: deterministic geometry; new
  - `src/games/dex-survivor/runtime/bosses/FinaleAddsSystem.test.ts` :: scaling/order/countdown; new

#### Details
- 50%, 10% 경계의 단 한 번 전이, saved hp, projectile cleanup과 countdown 시간 제외를 검증한다.
- 같은 seed와 patternIndex가 같은 발사 각도·safe zone을 생성하는지 검증한다.
- 약화 수치 60%/70%, boss2 순서 유지, boss1 시민·구출 수 불변, 양쪽 처치 필요를 검증한다.

## Acceptance Criteria
- [ ] 15분 보스는 `DEX`와 다면체 코어가 명확하고 50%에서 강화된다.
- [ ] 네 패턴 모두 예고가 있고 phase2 조합이 결정론적으로 반복된다.
- [ ] 10%에서 약화 보스 둘이 동시에 등장하고 핵심 기믹을 유지한다.
- [ ] 최종 보스는 기존 hp·2페이즈로 한 번만 복귀하며 3초 후 전투를 재개한다.

## Validation
- `npm run test -- src/games/dex-survivor/runtime/bosses/BossThreeSystem.test.ts src/games/dex-survivor/runtime/bosses/BulletPatterns.test.ts src/games/dex-survivor/runtime/bosses/FinaleAddsSystem.test.ts` — 최종 보스 규칙 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(game): add DEX spaceship finale

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T06-boss-three-finale

- implement telegraphed two-phase bullet patterns
- restore the final boss after weakened dual-boss combat
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
