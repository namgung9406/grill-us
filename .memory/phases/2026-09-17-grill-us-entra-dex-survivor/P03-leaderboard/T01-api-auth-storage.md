# Task: T01 API Auth and Storage

## Status: pending

## Goal
개발 전용 Express 서버가 명시적으로 활성화된 경우에만 리더보드 route를 노출하고, Entra 커스텀 API 토큰에서 사용자 신원을 검증한 뒤 SQLite에 안전하게 접근할 기반을 만든다.

## Decision Summary
- Graph 토큰은 허용하지 않고 `Leaderboard.Access` scope, issuer, audience, 만료를 모두 검증한다.
- 개발 우회는 non-production과 명시적 flag가 동시에 참일 때만 고정 사용자로 동작한다.

## Implementation

### I01. 서버 환경과 lifecycle
- Related Files:
  - `server/env.ts` :: `serverEnvSchema/parseServerEnv` — 조건부 환경 검증; new
  - `server/index.ts` :: `startServer` — DB/app 생성과 graceful shutdown; new
  - `server/app.ts` :: `createApp` — Express middleware와 disabled boundary; new
  - `.env.example` :: `server variables` — API 설정 추가; modify

#### Details
- **ServerEnv**:
  ```typescript
  export interface ServerEnv {
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    LEADERBOARD_ENABLED: boolean;
    ENTRA_TENANT_ID: string | null;
    ENTRA_API_AUDIENCE: string | null;
    ENTRA_REQUIRED_SCOPE: "Leaderboard.Access";
    LEADERBOARD_DEV_AUTH_BYPASS: boolean;
    LEADERBOARD_DEV_USER_ID: string | null;
    LEADERBOARD_DEV_DISPLAY_NAME: string | null;
    LEADERBOARD_RATE_LIMIT_MAX: number;
    LEADERBOARD_DB_PATH: string;
  }
  ```
- 기본값: PORT 3001, enabled false, bypass false, rate limit max 5, DB `server/data/leaderboard.sqlite`.
- production에서는 `LEADERBOARD_ENABLED=true`를 항상 거부한다. non-production에서 enabled true + bypass false이면 tenant/audience 필수이고, bypass true이면 dev user ID/name이 필수다.
- `LEADERBOARD_RATE_LIMIT_MAX`는 `NODE_ENV=test`에서만 1..1000으로 override할 수 있고 development/production에서는 정확히 5여야 한다.
- disabled일 때 `/api/leaderboard*`는 body 없이 404, DB 파일과 JWKS client를 만들지 않는다. `/api/health`는 `{status:"ok", leaderboardEnabled:boolean}`만 반환한다.
- JSON body limit 16KB, `x-powered-by` 비활성화, shutdown에서 HTTP server와 DB를 닫는다.

### I02. Entra JWT 인증
- Related Files:
  - `server/auth/verifyAccessToken.ts` :: `createAccessTokenVerifier` — jose remote JWKS 검증; new
  - `server/auth/requirePrincipal.ts` :: `requirePrincipal` — Bearer middleware/dev bypass; new
  - `server/auth/types.ts` :: `AuthPrincipal/AuthenticatedRequest` — 인증 사용자; new

#### Details
- **Signatures**:
  ```typescript
  export interface AuthPrincipal { objectId: string; displayName: string }
  export interface AccessTokenVerifier { verify(token: string): Promise<AuthPrincipal> }
  export function createAccessTokenVerifier(env: ServerEnv): AccessTokenVerifier;
  ```
- metadata/JWKS: `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys`; issuer는 `https://login.microsoftonline.com/{tenantId}/v2.0`.
- `jwtVerify`에 algorithms `RS256`, exact audience `ENTRA_API_AUDIENCE`, issuer를 전달한다.
- `tid===tenantId`, nonempty UUID `oid`, nonempty `name`, whitespace-split `scp`에 exact `Leaderboard.Access`가 있어야 한다.
- Authorization은 단일 `Bearer <token>`만 허용한다. 실패는 동일한 401 `AUTH_REQUIRED`, scope 누락은 403 `INSUFFICIENT_SCOPE`; token/claim을 로그로 남기지 않는다.
- dev bypass middleware는 verifier를 호출하지 않고 환경의 고정 principal을 사용하며 response header `X-Dev-Auth-Bypass: true`를 추가한다.

### I03. SQLite migration과 repository 기반
- Related Files:
  - `server/db/openDatabase.ts` :: `openDatabase` — WAL/busy timeout/close; new
  - `server/db/migrate.ts` :: `migrate` — `user_version=1`; new
  - `server/db/LeaderboardRepository.ts` :: `LeaderboardRepository` — typed statements; new
  - `server/db/types.ts` :: `LeaderboardRow/InsertResult`; new

#### Details
- **leaderboard_results**:
  - `result_id TEXT PRIMARY KEY`
  - `user_oid TEXT NOT NULL`, `display_name TEXT NOT NULL CHECK(length between 1 and 200)`
  - `outcome TEXT NOT NULL CHECK(outcome IN ('cleared','defeated'))`
  - `score INTEGER NOT NULL`, `normal_elapsed_ms INTEGER NOT NULL`, `total_active_ms INTEGER NOT NULL`
  - `enemy_kills INTEGER NOT NULL`, `hit_count INTEGER NOT NULL`
  - `boss1_ms/boss2_ms/boss3_ms INTEGER NULL`
  - `boss_time_sort_ms INTEGER NOT NULL`, `submitted_at_ms INTEGER NOT NULL`
- **submission_attempts**: `id INTEGER PRIMARY KEY`, `user_oid TEXT NOT NULL`, `attempted_at_ms INTEGER NOT NULL`; `(user_oid, attempted_at_ms)` index.
- results index는 `(score DESC, boss_time_sort_ms ASC, submitted_at_ms ASC, result_id ASC)`.
- DB open 후 `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`; migration은 transaction이다.
- repository는 prepared statement만 사용하고 SQL 문자열에 사용자 값을 삽입하지 않는다.

### I04. 서버 기반 테스트
- Related Files:
  - `server/env.test.ts` :: environment matrix; new
  - `server/auth/verifyAccessToken.test.ts` :: issuer/audience/scope/claims; new
  - `server/db/migrate.test.ts` :: in-memory schema/indexes; new

#### Details
- fake local JWKS key pair로 wrong issuer/audience/tid, expired, missing scope/name/oid와 valid token을 검증한다.
- production leaderboard enabled 및 production bypass 거부, non-test rate limit override 거부, disabled 시 DB/JWKS 미생성, migration idempotency를 검증한다.

## Acceptance Criteria
- [ ] Graph audience 토큰과 잘못된 tenant/scope 토큰이 거부된다.
- [ ] production에서 leaderboard 또는 dev bypass를 활성화할 수 없다.
- [ ] leaderboard disabled는 route·DB·JWKS side effect를 만들지 않는다.
- [ ] SQLite schema와 정렬 index가 transaction으로 한 번만 생성된다.

## Validation
- `npm run test -- server/env.test.ts server/auth server/db/migrate.test.ts` — 서버 경계 테스트 통과
- `npm run typecheck && npm run lint` — client/server 오류 0건

## Commit Message
```text
feat(api): secure leaderboard server foundation

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P03-leaderboard
Task: T01-api-auth-storage

- validate custom-scope Entra JWTs with fail-closed dev bypass
- initialize versioned SQLite leaderboard storage
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
