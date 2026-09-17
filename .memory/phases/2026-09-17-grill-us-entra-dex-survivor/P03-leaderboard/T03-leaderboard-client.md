# Task: T03 Leaderboard Client

## Status: done

## Goal
인증된 SPA가 Express용 access token으로 Top 10을 조회하고, 현재 계정의 pending 결과만 자동·수동 재제출하며 실패 결과를 사용자가 확인하고 삭제할 수 있게 한다.

## Decision Summary
- TanStack Query와 `ky`를 사용하고 직접 `fetch`를 호출하지 않는다.
- 운영/비활성 환경에서는 메뉴·경로·조회·제출을 모두 만들지 않으며 pending 결과는 자동 삭제하지 않는다.

## Implementation

### I01. 인증 API client와 Query hooks
- Related Files:
  - `src/leaderboard/api.ts` :: `createLeaderboardApi` — ky instance/request parsing; new
  - `src/leaderboard/queries.ts` :: `leaderboardQueryOptions/useSubmitResult`; new
  - `src/auth/AuthProvider.tsx` :: `acquireApiToken` — custom scope token; modify

#### Details
- **Signatures**:
  ```typescript
  export interface LeaderboardApi {
    list(limit?: number): Promise<readonly LeaderboardEntry[]>;
    submit(result: RunResult): Promise<LeaderboardEntry>;
  }
  export function createLeaderboardApi(getToken: () => Promise<string>): LeaderboardApi;
  ```
- `ky` prefixUrl `/api`, beforeRequest에서 매 요청 최신 API token을 `Authorization: Bearer`로 넣는다.
- request body는 RunResult에서 ownerObjectId, score, completedAt을 제외한 shared submission으로 projection한다.
- response는 shared Zod schema로 검증한다. 401 interaction-required는 AuthProvider가 redirect를 시작하고 Query는 무한 retry하지 않는다.
- Top 10 query key `['leaderboard','top',10]`, staleTime 30초. submit 성공 후 invalidate한다.

### I02. pending result 동기화
- Related Files:
  - `src/leaderboard/PendingResultSync.tsx` :: `PendingResultSync` — 로그인/online 시 순차 retry; new
  - `src/leaderboard/usePendingResults.ts` :: `usePendingResults` — 계정별 external store; new
  - `src/games/dex-survivor/persistence/PendingResultStore.ts` :: subscription support; modify

#### Details
- authenticated + leaderboard enabled + online일 때 현재 `user.objectId` key만 읽는다.
- FIFO로 한 번에 하나씩 제출한다. 성공/duplicate 200만 해당 resultId를 제거한다.
- 401/403은 sync를 중지하고 인증 복구, 429는 Retry-After 전 자동 재시도 금지, 422/409는 항목을 유지하고 사용자 조치 필요 상태로 표시, network/5xx는 online 또는 수동 재시도까지 유지한다.
- 다른 account key는 읽거나 제출·삭제하지 않는다. logout 시 in-flight AbortController를 취소한다.

### I03. Top 10과 pending UI
- Related Files:
  - `src/pages/LeaderboardPage.tsx` :: `LeaderboardPage` — Top 10 table/list; new
  - `src/leaderboard/PendingResultsPanel.tsx` :: `PendingResultsPanel` — retry/delete/error; new
  - `src/layout/Sidebar.tsx` :: `leaderboard navigation` — enabled 조건; modify
  - `src/routes/AppRoutes.tsx` :: `leaderboard route` — enabled 조건; modify
  - `src/games/dex-survivor/ui/ResultScreen.tsx` :: `submission status link`; modify
  - `src/games/dex-survivor/DexSurvivorGame.test.tsx` :: `leaderboard feature fixture` — 기존 결과 저장 재시도 회귀 검증; modify

#### Details
- 표시: 순위, displayName, score, outcome 한국어, enemyKills, hitCount, boss1/2/3 시간을 `m:ss.s` 또는 `-`로 표시. 이메일과 object ID는 없음.
- desktop은 semantic table, mobile은 같은 정보의 unframed stacked rows이며 heading 크기를 panel에 맞춘다.
- loading skeleton, empty, auth error, API disabled/unavailable 상태를 구분한다.
- pending panel은 resultId 축약, 완료 시각, 상태, 재시도와 `삭제` 확인을 제공한다. 직접 삭제 외에는 영구 validation failure도 보존한다.
- `VITE_LEADERBOARD_ENABLED=false`이면 sidebar 항목과 route element, PendingResultSync를 렌더하지 않고 ResultScreen은 `리더보드는 개발 환경에서만 사용할 수 있습니다.`만 표시한다.

### I04. 클라이언트 테스트
- Related Files:
  - `src/leaderboard/PendingResultSync.test.tsx` :: account/error/retry matrix; new
  - `src/pages/LeaderboardPage.test.tsx` :: sort display/states/privacy; new
  - `src/leaderboard/api.test.ts` :: token/projection/schema; new

#### Details
- API body에 ownerObjectId/displayName/email/score가 없고 Authorization이 API token인지 검증한다.
- 같은 계정 FIFO, 계정 전환 취소, 200 삭제, 422 유지, 429 자동 재시도 금지, disabled no-call을 검증한다.

## Acceptance Criteria
- [x] 인증된 Top 10 화면이 결정된 필드만 표시하고 개인정보를 추가 노출하지 않는다.
- [x] pending 결과는 같은 계정만 제출하고 성공할 때만 제거된다.
- [x] disabled 빌드는 리더보드 메뉴·route·API traffic이 모두 없다.
- [x] API request가 Graph token이나 클라이언트 사용자 신원을 전달하지 않는다.

## Validation
- `npm run test -- src/leaderboard src/pages/LeaderboardPage.test.tsx` — query·queue·UI 테스트 통과
- `npx cross-env VITE_LEADERBOARD_ENABLED=false npm run build` — production mode disabled client build 성공
- `npx cross-env VITE_LEADERBOARD_ENABLED=true npm run build:leaderboard-dev` — 유효한 `VITE_ENTRA_API_SCOPE` 환경에서 enabled development client build 성공
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(leaderboard): add authenticated Top 10 client

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P03-leaderboard
Task: T03-leaderboard-client

- query development rankings with custom-scope access tokens
- retry account-bound completed results without data loss
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: 37c0dd9