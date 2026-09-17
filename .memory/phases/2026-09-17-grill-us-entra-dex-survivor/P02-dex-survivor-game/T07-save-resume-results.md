# Task: T07 Save Resume and Results

## Status: done

## Goal
게임의 전체 전투 snapshot을 계정별로 500ms마다 안전하게 저장하고 화면 이탈·복귀·재시작·사망·클리어를 손실 없이 처리하여 리더보드가 소비할 완결 결과를 남긴다.

## Decision Summary
- 저장은 동일 Entra object ID와 schema version에만 복원하고 다른 계정 저장은 건드리지 않는다.
- 사망·클리어 시 pending result를 먼저 영속화한 뒤 active save를 삭제한다.

## Implementation

### I01. 저장소와 key 계약
- Related Files:
  - `src/games/dex-survivor/persistence/GameSaveStore.ts` :: `GameSaveStore` — read/write/remove; new
  - `src/games/dex-survivor/persistence/PendingResultStore.ts` :: `PendingResultStore` — 결과 queue; new
  - `src/games/dex-survivor/persistence/keys.ts` :: `saveKey/pendingResultsKey`; new
  - `src/games/saveMetadata.ts` :: `readSaveMetadata` — 실제 V1 schema 연결; modify

#### Details
- **Keys**:
  - active: `grill-us:dex-survivor:save:v1:{encodeURIComponent(objectId)}`.
  - pending: `grill-us:dex-survivor:pending-results:v1:{encodeURIComponent(objectId)}`.
- **Signatures**:
  ```typescript
  export interface StorageResult { ok: boolean; reason?: "quota" | "unavailable" | "invalid" }
  export class GameSaveStore {
    read(ownerObjectId: string): GameSaveV1 | null;
    write(save: GameSaveV1): StorageResult;
    remove(ownerObjectId: string): void;
  }
  export class PendingResultStore {
    list(ownerObjectId: string): readonly RunResult[];
    append(result: RunResult): StorageResult;
    remove(ownerObjectId: string, resultId: string): void;
  }
  ```
- JSON parse와 Zod 실패, version 불일치는 해당 계정 active save만 제거하고 null을 반환한다. 다른 계정 key는 열거·삭제하지 않는다.
- pending queue는 resultId 중복을 idempotent하게 무시하고 자동 만료·자동 삭제하지 않는다.
- localStorage 접근 거부/quota는 throw하지 않고 사용자 경고 event를 반환한다. 사진 URL, displayName, email 필드는 schema에서 허용하지 않는다.

### I02. 500ms snapshot와 lifecycle pause
- Related Files:
  - `src/games/dex-survivor/persistence/AutoSaveController.ts` :: `AutoSaveController` — dirty throttle/flush; new
  - `src/games/dex-survivor/runtime/GameScene.ts` :: `exportSnapshot/importSnapshot`; modify
  - `src/games/dex-survivor/DexSurvivorGame.tsx` :: lifecycle events; modify

#### Details
- state mutation은 dirty flag만 설정하고 controller가 active simulation 중 최대 500ms마다 한 번 serialize한다.
- `visibilitychange(hidden)`, `pagehide`, route unmount 전에 scene을 pause하고 synchronously flush한다. `beforeunload`는 보조 수단으로만 사용한다.
- 저장 snapshot phase는 `paused`, `phaseBeforePause`는 직전 실제 phase다. 입력 상태와 wall-clock countdown은 저장하지 않는다.
- 복원은 schema parse, owner 일치 후 entities/projectiles/cooldowns/PRNG state를 생성하고 모든 input을 released 상태로 시작한다.
- quota 실패 시 게임은 계속되지만 HUD에 `진행 상황을 저장하지 못했습니다.` 경고를 유지한다.

### I03. 계속하기, 재시작과 종료
- Related Files:
  - `src/games/dex-survivor/ui/PauseOverlay.tsx` :: `PauseOverlay` — continue/restart/exit; new
  - `src/games/dex-survivor/ui/RestartDialog.tsx` :: `RestartDialog` — destructive confirmation; new
  - `src/games/dex-survivor/ui/ResultScreen.tsx` :: `ResultScreen` — outcome/stats/pending state; new
  - `src/games/dex-survivor/DexSurvivorGame.tsx` :: state orchestration; modify

#### Details
- 계속하기는 Graph 자산 준비 후 snapshot을 import하고 3초 countdown 동안 simulation/input을 정지한다.
- 재시작 dialog 문구는 정확히 `현재 진행 상황이 모두 초기화됩니다. 재시작하시겠습니까?`; 확인 시 active save만 삭제하고 새 UUID session/seed로 시작한다.
- death/clear는 simulation을 동결하고 `createRunResult`로 UUID resultId를 만든다. `PendingResultStore.append` 성공 후 active save를 제거한다.
- pending append 실패 시 active save를 삭제하지 않고 결과 화면에서 저장 실패와 재시도 버튼을 제공한다.
- 중도 exit는 paused active save를 유지하고 result를 만들지 않는다.
- result 화면은 점수, outcome, enemyKills, hitCount, 세 boss time, rescued count를 표시하되 rescued count는 `RunResult`/리더보드 제출에는 넣지 않는다.

### I04. 저장·복원 테스트
- Related Files:
  - `src/games/dex-survivor/persistence/GameSaveStore.test.ts` :: corruption/account/version/quota; new
  - `src/games/dex-survivor/persistence/AutoSaveController.test.ts` :: 500ms/flush/dirty; new
  - `src/games/dex-survivor/persistence/PendingResultStore.test.ts` :: idempotency/retention; new
  - `src/games/dex-survivor/DexSurvivorGame.test.tsx` :: resume/restart/end; modify
  - `src/pages/GamePage.test.tsx` :: complete V1 resume fixture; modify

#### Details
- 500ms 이전 중복 write 없음, pagehide 즉시 flush, exact snapshot roundtrip과 PRNG 다음 값 일치를 검증한다.
- 다른 계정 무시, corrupt/version mismatch 해당 key 폐기, quota 경고과 게임 지속을 검증한다.
- pending append 전 active save 유지, append 성공 후 삭제, exit 결과 미생성을 검증한다.

## Acceptance Criteria
- [x] 500ms autosave와 이탈 즉시 flush로 플레이어·적·탄환·pickup·보스·PRNG가 복원된다.
- [x] 같은 object ID만 계속하기 가능하고 다른 계정 저장은 유지된 채 보이지 않는다.
- [x] 사망·클리어만 pending result를 만들고 중도 이탈·재시작은 제출 결과를 만들지 않는다.
- [x] 저장 실패가 진행 손실을 숨기지 않고 사용자에게 표시된다.

## Validation
- `npm run test -- src/games/dex-survivor/persistence src/games/dex-survivor/DexSurvivorGame.test.tsx` — 저장 lifecycle 통과
- `npm run typecheck && npm run lint && npm run build` — 오류 0건

## Commit Message
```text
feat(game): persist resumable runs and completed results

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T07-save-resume-results

- snapshot complete deterministic combat state per Entra account
- separate active saves from durable completed-result retries
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: 37ae702