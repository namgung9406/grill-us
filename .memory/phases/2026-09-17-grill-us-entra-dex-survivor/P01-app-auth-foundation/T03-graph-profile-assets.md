# Task: T03 Graph Profile Assets

## Status: pending

## Goal
게임 시작 시 로그인 사용자와 무작위 활성 내부 구성원 최대 9명의 48x48 사진을 Microsoft Graph에서 준비하고, 실패·취소·복원·해제 시 사진이 메모리 밖에 남지 않도록 한다.

## Decision Summary
- delegated `User.Read.All`과 Microsoft Graph Client를 사용하며 사진은 Blob URL로만 전달한다.
- 본인을 시민에서 제외하고 저장 복원 시 저장된 시민 ID를 우선 재조회하며 부족분만 무작위 후보로 채운다.

## Implementation

### I01. Graph 클라이언트와 스키마
- Related Files:
  - `src/graph/types.ts` :: `DirectoryUser/ProfileAsset/GameProfileAssets` — 앱 내부 Graph 모델; new
  - `src/graph/schemas.ts` :: `graphUsersPageSchema` — Graph JSON 검증; new
  - `src/graph/createGraphClient.ts` :: `createGraphClient` — 요청별 MSAL token provider; new
  - `src/graph/GraphProfileService.ts` :: `GraphProfileService` — 목록·사진·retry orchestration; new

#### Details
- **Signatures & Types**:
  ```typescript
  export interface DirectoryUser {
    id: string;
    displayName: string;
    accountEnabled: true;
    userType: "Member";
  }
  export interface ProfileAsset {
    userId: string;
    displayName: string;
    objectUrl: string | null;
    kind: "photo" | "helmet";
  }
  export interface GameProfileAssets {
    player: ProfileAsset;
    citizens: readonly ProfileAsset[];
    release(): void;
  }
  export interface PrepareProfileOptions {
    player: AuthenticatedUser;
    preferredCitizenIds?: readonly string[];
    signal: AbortSignal;
  }
  export class GraphProfileService {
    prepare(options: PrepareProfileOptions): Promise<GameProfileAssets>;
  }
  ```
- `/users?$select=id,displayName,accountEnabled,userType&$top=100`에서 `@odata.nextLink`를 끝까지 따라가되 최대 5,000명을 상한으로 한다.
- 클라이언트에서 `accountEnabled === true`, `userType === "Member"`, `id !== player.objectId`를 다시 검증한다.
- preferred ID는 `/users/{id}?$select=...`로 먼저 확인하고 조건을 만족한 사용자만 유지한다.

### I02. 후보 선택과 사진 retry
- Related Files:
  - `src/graph/retry.ts` :: `parseRetryAfter/withGraphRetry` — 재시도 정책; new
  - `src/graph/selectCandidates.ts` :: `selectCitizenCandidates` — seed 기반 Fisher-Yates; new

#### Details
- **Signatures**:
  ```typescript
  export function parseRetryAfter(value: string | null, nowMs: number): number | null;
  export function selectCitizenCandidates(
    users: readonly DirectoryUser[], preferredIds: readonly string[], seed: number
  ): readonly DirectoryUser[];
  ```
- preferred ID 순서를 보존하고 나머지를 세션 seed로 shuffle한다. 최대 200명의 사진을 확인하거나 사진 성공자 9명이 차면 중단한다.
- 사진 endpoint는 `/users/{id}/photos/48x48/$value`; 본인은 `/me/photos/48x48/$value`를 사용한다.
- 최대 4개 사진 요청만 병렬 실행한다.
- `403/404`는 재시도 없이 제외한다. `429/5xx`는 최초 요청 이후 최대 2회 재시도(총 3회)하고 `Retry-After` 초 또는 HTTP-date를 파싱한다. 값이 30초 이하이면 지시된 시간만큼 대기하고, 30초를 초과하면 더 일찍 재시도하지 않고 해당 사진을 `retry-after-too-long`으로 제외한다.
- AbortSignal 취소는 즉시 전파하고 이미 만든 object URL을 모두 revoke한다.
- 본인 사진 실패는 `kind="helmet", objectUrl=null`; 시민 사진 실패는 시민 목록에서 제외한다.

### I03. 자산 수명주기와 Query hook
- Related Files:
  - `src/graph/useGameProfileAssets.ts` :: `useGameProfileAssets` — disabled-by-default TanStack query; new
  - `src/graph/objectUrlRegistry.ts` :: `ObjectUrlRegistry` — 단일 release와 중복 revoke 방지; new

#### Details
- query key는 `['game-profile-assets', objectId, preferredCitizenIds]`; `enabled`는 게임 시작 버튼 이후에만 true다.
- 사진 Blob이나 URL은 query persistence 대상이 아니며 `gcTime: 0`, retry는 서비스가 담당하므로 Query retry는 false다.
- 컴포넌트 unmount, 재시작, logout, 새 prepare 성공 전 이전 자산을 `release()`한다.
- Graph response, object ID, displayName을 console에 기록하지 않는다.

### I04. Graph 테스트
- Related Files:
  - `src/graph/GraphProfileService.test.ts` :: `GraphProfileService` — pagination/filter/retry/release; new
  - `src/graph/retry.test.ts` :: `parseRetryAfter` — seconds/date/invalid; new
  - `src/graph/selectCandidates.test.ts` :: `selectCitizenCandidates` — 본인 제외·preferred·결정성; new

#### Details
- 0장 시민, 9장 충족, 200명 상한, 403/404 즉시 제외, 429 날짜/초, 5xx 2회 재시도, abort 중 URL 회수를 검증한다.
- 테스트는 fake Graph adapter, fake sleeper, `URL.createObjectURL/revokeObjectURL` spy를 주입한다.

## Acceptance Criteria
- [ ] 시작 전에는 Graph 목록·사진 요청이 발생하지 않는다.
- [ ] 활성 Member이면서 본인이 아닌 사진 성공자만 최대 9명 반환된다.
- [ ] 본인 사진 실패는 helmet, 시민 사진 0장은 빈 배열로 정상 완료된다.
- [ ] 모든 종료·오류·취소 경로에서 생성된 object URL이 정확히 한 번 revoke된다.

## Validation
- `npm run test -- src/graph` — Graph 필터·retry·수명주기 테스트 통과
- `npm run typecheck && npm run lint` — 오류 0건

## Commit Message
```text
feat(graph): prepare ephemeral game profile assets

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P01-app-auth-foundation
Task: T03-graph-profile-assets

- select active member photos with bounded Graph retries
- keep profile blobs in memory and revoke every object URL
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
