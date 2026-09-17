# Task: T02 Leaderboard Endpoints

## Status: pending

## Goal
완결된 게임 통계의 진행 순서와 범위를 서버에서 검증하고 점수를 재계산하여 멱등 저장하며, 인증된 사용자에게 결정론적으로 정렬된 Top 10을 제공한다.

## Decision Summary
- 요청은 사용자 ID·이름·score를 받지 않고 인증 principal과 순수 점수 공식을 사용한다.
- 서버 검증은 명백한 조작을 차단하는 타당성 검증이며 서버 권위 gameplay를 보장하지 않는다.

## Implementation

### I01. 공유 API 계약
- Related Files:
  - `src/shared/leaderboard.ts` :: request/response Zod schemas and types — client/server 계약; new
  - `server/http/errors.ts` :: `ApiError/errorMiddleware` — 일관된 오류 body; new

#### Details
- **Contracts**:
  ```typescript
  export interface LeaderboardSubmission {
    resultId: string; outcome: "cleared" | "defeated";
    normalElapsedMs: number; totalActiveMs: number;
    enemyKills: number; hitCount: number;
    bossTimesMs: readonly [number | null, number | null, number | null];
  }
  export interface LeaderboardEntry extends LeaderboardSubmission {
    displayName: string; score: number; submittedAtMs: number;
  }
  export interface ApiErrorBody {
    error: { code: string; message: string; fieldErrors?: Readonly<Record<string, readonly string[]>> };
  }
  ```
- integers only: normal `0..900000`, total `0..14400000`, kills `0..50000`, hits `0..1000`, boss time nonnull `1000..3600000`.
- response는 object ID, email, token, DB 내부 column을 포함하지 않는다.

### I02. 타당성·점수·빈도 검증
- Related Files:
  - `server/leaderboard/validateSubmission.ts` :: `validateSubmission` — cross-field rules; new
  - `server/leaderboard/calculateServerScore.ts` :: `calculateServerScore` — domain score wrapper; new
  - `server/leaderboard/rateLimit.ts` :: `consumeSubmissionAttempt` — SQLite sliding window; new

#### Details
- boss time은 앞에서부터 연속이어야 한다. boss2가 있으면 boss1 필수, boss3가 있으면 앞 둘 필수.
- defeated는 boss3 null; cleared는 세 boss time nonnull, `normalElapsedMs===900000`.
- boss1/2 기록은 normal elapsed가 각각 300000/600000 이상이어야 한다.
- 완료 boss 최소 시간 `[15000,20000,30000]`ms. 지나치게 빠르면 422 `IMPLAUSIBLE_RESULT`.
- defeated 결과의 `totalActiveMs`는 최소 5,000ms다. cleared는 normal 900,000ms와 세 boss 최소 시간 규칙으로 최소 965,000ms가 자동 강제된다.
- `totalActiveMs >= normalElapsedMs + sum(completed boss times)`이고 차이는 현재 미완료 boss 시간으로 최대 3,600,000ms다.
- kills는 `<= floor(totalActiveMs/100)+20`, hits는 `<= ceil(totalActiveMs/250)+1`이어야 한다.
- 서버 점수는 P02 `calculateScore`를 호출하고 client score 입력을 허용하지 않는다.
- 인증된 사용자당 모든 POST attempt를 10분 sliding window에 기록하고 `LEADERBOARD_RATE_LIMIT_MAX`(일반 환경은 고정 5) 초과 시 429와 `Retry-After` 초를 반환한다. 24시간 이전 attempts는 transaction 안에서 정리한다.

### I03. POST/GET route와 멱등성
- Related Files:
  - `server/routes/leaderboard.ts` :: `createLeaderboardRouter` — GET/POST; new
  - `server/db/LeaderboardRepository.ts` :: `insertOrGet/listTop/countAttempts`; modify
  - `server/app.ts` :: `leaderboard router/error middleware`; modify

#### Details
- `POST /api/leaderboard/results`: auth -> rate consume -> body Zod -> cross validation -> score -> transaction insert.
- 신규는 201 `{entry}`, 동일 resultId·동일 principal·동일 통계는 200 `{entry, duplicate:true}`.
- 동일 resultId가 다른 principal 또는 다른 payload면 409 `RESULT_ID_CONFLICT`; 기존 row 내용을 노출하지 않는다.
- `boss_time_sort_ms = coalesce(boss1,120000)+coalesce(boss2,180000)+coalesce(boss3,300000)`로 미처치 boss에 threshold penalty를 적용한다.
- `GET /api/leaderboard?limit=`은 auth 필수, integer 1..10, 기본 10; score desc -> boss sort asc -> submitted asc -> resultId asc.
- malformed JSON 400, validation 422, auth 401/403, disabled 404, DB busy 503이며 stack trace는 response에 넣지 않는다.

### I04. API 통합 테스트
- Related Files:
  - `server/routes/leaderboard.test.ts` :: supertest-equivalent HTTP integration; new
  - `server/leaderboard/validateSubmission.test.ts` :: boundary matrix; new
  - `server/db/LeaderboardRepository.test.ts` :: sorting/idempotency; new

#### Details
- 4,999/5,000ms defeated 경계, clear 최소 965,000ms, 최대값, boss 연속성, total consistency, kill/hit plausibility를 table test한다.
- 동점 score에서 missing boss penalty, boss time, submitted time, resultId 순서를 검증한다.
- 중복 retry 200, 다른 사용자 충돌 409, 6번째 attempt 429, invalid body도 attempt를 소비하는지 검증한다.

## Acceptance Criteria
- [ ] 서버가 인증 principal로만 이름과 사용자 ID를 결정한다.
- [ ] 점수 공식과 진행 타당성이 서버에서 재계산·검증된다.
- [ ] 같은 resultId 재시도는 중복 행 없이 같은 결과를 반환한다.
- [ ] Top 10 정렬과 rate limit이 SQLite 재시작 이후에도 유지된다.

## Validation
- `npm run test -- server/leaderboard server/routes/leaderboard.test.ts server/db/LeaderboardRepository.test.ts` — API 검증 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(api): validate and rank completed game results

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P03-leaderboard
Task: T02-leaderboard-endpoints

- recalculate plausible scores from authenticated submissions
- persist idempotent results with deterministic Top 10 ordering
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
