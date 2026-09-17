# Task: T04 Games Catalog and Preparation

## Status: done

## Goal
인증된 Games 목록에서 `DEX Survivor` 카드를 명시적으로 시작하고, 준비 화면에서 Graph 자산을 만든 뒤에만 lazy-loaded 게임 화면으로 진입하게 한다.

## Decision Summary
- 게임 메타데이터와 lazy component를 registry에서 관리한다.
- `/games/:gameId` 직접 접근은 자동 시작하지 않고 설명·계속하기 또는 게임 시작 화면을 보여준다.

## Implementation

### I01. 게임 registry와 경로 해석
- Related Files:
  - `src/games/registry.ts` :: `GameDefinition/GAME_REGISTRY/getGameDefinition` — 게임 메타데이터; new
  - `src/games/types.ts` :: `GameLaunchProps/GameProfileContext` — lazy 게임 진입 계약; new
  - `src/pages/GamesPage.tsx` :: `GamesPage` — 카드 목록; new
  - `src/pages/GamePage.tsx` :: `GamePage` — prepare/ready/error/running 상태기계; new
  - `src/pages/GameNotFoundPage.tsx` :: `GameNotFoundPage` — registry miss; new
  - `src/games/dex-survivor/DexSurvivorGame.tsx` :: `DexSurvivorGame` — P01 build를 유지하는 typed 준비 placeholder; new
  - `src/routes/AppRoutes.tsx` :: `games routes` — 실제 페이지 연결; modify

#### Details
- **Signatures & Types**:
  ```typescript
  export interface GameDefinition {
    id: "dex-survivor";
    title: "DEX Survivor";
    description: string;
    load: () => Promise<{ default: React.ComponentType<GameLaunchProps> }>;
  }
  export interface GameLaunchProps {
    profileAssets: GameProfileAssets;
    ownerObjectId: string;
    onExit(): void;
  }
  type LaunchState = "idle" | "preparing" | "ready" | "running" | "error";
  ```
- registry는 `dex-survivor` 하나로 시작하며 `load`는 P02에서 생성할 `./dex-survivor/DexSurvivorGame`을 dynamic import한다.
- P01 placeholder는 `GameLaunchProps`를 정확히 받고 `게임 구현 준비 중` 상태와 exit 명령만 제공한다. P02-T02가 같은 파일을 실제 Phaser mount로 교체하므로 누락 모듈 import로 P01 build가 깨지지 않는다.
- lazy import는 `idle`에서 실행하지 않고 start 동작과 동시에 prefetch한다.
- static leaderboard route가 동적 game route에 가로채이지 않도록 현재 라우팅 순서를 유지한다.

### I02. 시작·계속하기 준비 상태
- Related Files:
  - `src/games/GameCard.tsx` :: `GameCard` — `게임 시작` 명령; new
  - `src/games/GamePreparation.tsx` :: `GamePreparation` — 진행·취소·재시도; new
  - `src/games/saveMetadata.ts` :: `readSaveMetadata` — P02 저장 본문 없이 계정/버전/시민 ID만 읽는 계약; new

#### Details
- `/games` 카드 버튼은 `/games/dex-survivor`로 이동하며 navigation state `startRequested=true`를 전달한다.
- 직접 URL 접근은 설명, `게임 시작`, 유효한 동일 계정 저장이 있으면 `계속하기`를 표시한다.
- 시작/계속하기 버튼 이후에만 Graph query와 Phaser chunk import를 시작한다.
- 준비 중에는 `플레이어 준비 중...`, 취소 버튼, 단계 텍스트(로그인 확인/프로필/게임 로드)를 제공한다.
- 계속하기는 저장의 `citizenUserIds`를 preferred ID로 전달한다. 사진 실패 시에도 저장 복원은 막지 않는다.
- 오류는 사용자용 한국어 메시지와 재시도를 제공하되 Graph 세부 응답을 노출하지 않는다.

### I03. UI와 접근성
- Related Files:
  - `src/games/GameCard.tsx` :: styles/states — 레트로 카드와 icon buttons; modify
  - `src/games/GamePreparation.test.tsx` :: preparation state tests; new
  - `src/pages/GamePage.test.tsx` :: direct/card/not-found paths; new

#### Details
- 카드 제목은 compact heading이며 중첩 카드 없이 unframed 목록에 배치한다.
- 진행 상태는 `role="status"`, 오류는 `role="alert"`; 준비 취소 후 시작 버튼으로 focus를 돌린다.
- 더블 클릭은 하나의 prepare만 생성하며 기존 AbortController를 재사용하지 않는다.

## Acceptance Criteria
- [x] 카드의 `게임 시작` 이전에는 Graph와 Phaser 요청이 없다.
- [x] 직접 URL은 자동 시작하지 않고 시작 또는 유효 저장 계속하기를 요구한다.
- [x] 미등록 ID는 인증된 찾을 수 없음 화면을 표시한다.
- [x] 준비 취소·실패·재시도에서 사진 URL과 비동기 작업이 누수되지 않는다.

## Validation
- `npm run test -- src/games src/pages/GamePage.test.tsx` — 시작 상태기계와 경로 테스트 통과
- `npm run typecheck && npm run lint && npm run build` — lazy chunk 포함 오류 0건

## Commit Message
```text
feat(games): add explicit game preparation flow

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P01-app-auth-foundation
Task: T04-games-catalog-preparation

- register DEX Survivor as a lazy authenticated game
- prepare ephemeral profiles only after an explicit start action
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: ed08de6