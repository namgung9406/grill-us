# Task: T04 Boss One Rescue

## Status: done

## Goal
일반 타이머 5분에 가상 얼굴 보스와 시민별 독립 촉수를 생성하고, 실제 구성원 사진은 공격받지 않는 구출 대상으로만 표현하며 구출 수를 정확히 기록한다.

## Decision Summary
- 보스 얼굴 9개는 절차 생성한 가상 얼굴이고 실제 사진은 시민 sprite에만 사용한다.
- 시민 구출은 점수·필살기와 무관하며 촉수 파괴 또는 보스 사망으로만 발생한다.

## Implementation

### I01. 보스 상태와 전투 시스템
- Related Files:
  - `src/games/dex-survivor/domain/bosses.ts` :: `BOSS_ONE_BALANCE/createBossOneState` — 상수와 초기 상태; new
  - `src/games/dex-survivor/runtime/bosses/BossOneSystem.ts` :: `BossOneSystem` — 촉수·damage·구출 전이; new
  - `src/games/dex-survivor/runtime/bosses/BossOneView.ts` :: `BossOneView` — 가상 얼굴 mosaic와 촉수; new

#### Details
- **Balance**:
  - body hp 4,000, radius 92, contact damage 15, contact cooldown 800ms.
  - 시민당 tentacle hp 300, sweep damage 20, sweep interval 1,800ms, telegraph 450ms, reach 220px.
  - body는 arena 중앙에 고정되고 9개 픽셀 얼굴 tile은 seed로 눈·입·색을 조합하되 사진 texture를 사용하지 않는다.
- `citizenUserIds` 최대 9개 각각에 tentacle을 하나 만들고 angle을 균등 배치한다. 시민 0명이면 tentacle 없이 body만 등장한다.
- tentacle hitbox와 body hitbox는 분리하며 파괴된 tentacle은 damage와 attack 대상에서 즉시 제거한다.
- sweep는 플레이어만 collision 대상으로 하고 citizen sprite는 physics body가 없다.

### I02. 시민 사진과 구출 수명주기
- Related Files:
  - `src/games/dex-survivor/runtime/entities/CitizenView.ts` :: `CitizenView` — 사진 sprite와 fallback; new
  - `src/games/dex-survivor/domain/rescue.ts` :: `rescueCitizen/rescueRemainingCitizens` — idempotent 전이; new
  - `src/games/dex-survivor/runtime/GameScene.ts` :: `boss1 phase integration` — spawn/complete; modify

#### Details
- citizen texture는 P01 `GameProfileAssets.citizens`의 object URL을 scene 시작 시 48x48 texture로 로드한다. 저장 ID의 사진 재조회 실패 시 가상 구조 아이콘을 사용한다.
- tentacle hp가 0이 되는 단일 전이에서 citizen ID를 `rescuedCitizenIds`에 추가하고 700ms `구출 완료` 연출 후 view를 제거한다.
- body hp 0에서 남은 citizen을 ID 오름차순으로 모두 rescue하고 보스 시간을 확정한 후 phase를 normal로 되돌린다.
- `rescuedCitizenIds`는 set semantics를 보장하고 중복 damage/death event가 구출 수를 늘리지 않는다.
- 사진 texture 제거는 scene 종료가 담당하고 원본 object URL release는 React 자산 owner가 담당한다.

### I03. 보스 1 테스트
- Related Files:
  - `src/games/dex-survivor/runtime/bosses/BossOneSystem.test.ts` :: boss/tentacle/rescue; new
  - `src/games/dex-survivor/domain/rescue.test.ts` :: idempotent rescue; new

#### Details
- 0명, 1명, 9명 초기화와 각도·촉수 수를 검증한다.
- sweep가 플레이어 hp/hitCount만 변경하고 시민에는 damage state가 없음을 검증한다.
- 촉수 파괴 즉시 구출, body 사망 시 잔여 자동 구출, 중복 event 무해, 점수·ultimate 불변을 검증한다.

## Acceptance Criteria
- [x] 5분에 보스 1이 등장하며 보스전 동안 normal timer가 정지한다.
- [x] 실제 사진은 시민에게만 표시되고 보스 얼굴은 모두 절차 생성된다.
- [x] 촉수마다 독립 hp와 sweep가 있으며 시민은 어떤 공격에도 피해를 받지 않는다.
- [x] 시민 0명에서도 보스가 정상적으로 등장·처치되고 phase가 진행된다.

## Validation
- `npm run test -- src/games/dex-survivor/runtime/bosses/BossOneSystem.test.ts src/games/dex-survivor/domain/rescue.test.ts` — 보스 1 규칙 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(game): add first boss citizen rescue battle

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T04-boss-one-rescue

- create independent tentacle combat around a fictional face boss
- render member photos only as non-damageable rescue citizens
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: 2d2993e
