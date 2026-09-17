# Task: T02 Entra Auth Shell

## Status: done

## Goal
단일 테넌트 MSAL redirect 인증과 보호 라우팅을 구축하여 Home은 공개하고 Games는 로그인 후 원래 URL로 복귀하며, 데스크톱·모바일 사이드바에서 현재 인증 상태와 오류 복구를 표시한다.

## Decision Summary
- `sessionStorage`, redirect login/logout, 첫 캐시 계정 자동 선택, 전체 화면 redirect 로딩을 사용한다.
- Graph scope와 Express `Leaderboard.Access` scope는 서로 다른 토큰 요청으로 유지한다.

## Implementation

### I01. MSAL 구성과 인증 어댑터
- Related Files:
  - `src/auth/msal.ts` :: `msalInstance/loginRequest/graphTokenRequest/apiTokenRequest` — tenant authority와 scope; new
  - `src/auth/AuthProvider.tsx` :: `AuthProvider/useAuth` — 앱이 사용하는 인증 계약; new
  - `src/auth/types.ts` :: `AuthenticatedUser/AuthContextValue` — 외부 MSAL 타입을 앱 타입으로 축소; new
  - `src/main.tsx` :: `bootstrap` — `initialize`와 `handleRedirectPromise` 완료 후 렌더; modify

#### Details
- **Signatures & Types**:
  ```typescript
  export interface AuthenticatedUser {
    objectId: string;
    displayName: string;
    email: string | null;
  }
  export interface AuthContextValue {
    status: "loading" | "anonymous" | "authenticated" | "error";
    user: AuthenticatedUser | null;
    errorMessage: string | null;
    login(returnTo?: string): Promise<void>;
    logout(): Promise<void>;
    acquireGraphToken(): Promise<string>;
    acquireApiToken(): Promise<string>;
    retry(): void;
  }
  ```
- authority는 `https://login.microsoftonline.com/{tenantId}`이고 cache location은 `sessionStorage`, cookie fallback은 비활성화한다.
- 기본 로그인 scope는 `openid`, `profile`, `email`; Graph 토큰은 `User.Read.All`; API 토큰은 leaderboard enabled일 때 존재하는 `VITE_ENTRA_API_SCOPE`만 요청한다. disabled 환경의 `acquireApiToken` 호출은 네트워크 요청 없이 명시적 `LeaderboardDisabledError`를 throw한다.
- redirect 결과에 계정이 있으면 active account로 설정하고, 없으면 `getAllAccounts()[0]`을 선택한다.
- canonical object ID는 `AccountInfo.localAccountId`; 표시 이름은 `name ?? username`; email은 ID token claim email/preferred_username 중 존재하는 값만 사용한다.
- silent token 실패가 interaction required인 경우에만 `acquireTokenRedirect`로 전환한다.

### I02. 라우팅과 반환 경로
- Related Files:
  - `src/App.tsx` :: `App` — QueryClient, Router, AuthProvider 조합; modify
  - `src/routes/AppRoutes.tsx` :: `AppRoutes` — `/`, `/games`, `/games/leaderboard`, `/games/:gameId`, fallback; new
  - `src/auth/ProtectedRoute.tsx` :: `ProtectedRoute` — 인증 전 자동 redirect; new
  - `src/pages/HomePage.tsx` :: `HomePage` — 공개 홈과 인증 오류 재시도; new
  - `src/pages/NotFoundPage.tsx` :: `NotFoundPage` — 일반 404; new

#### Details
- **Return Path Contract**:
  ```typescript
  const RETURN_TO_KEY = "grill-us:auth:return-to";
  export function sanitizeReturnTo(value: string): string;
  ```
- 반환 경로는 현재 origin 내부의 `pathname + search + hash`만 허용하고 `//`, scheme, 다른 origin은 `/games`로 대체한다.
- anonymous 보호 경로 접근은 반환 경로를 `sessionStorage`에 저장한 후 login redirect를 한 번만 시작한다.
- redirect 처리 완료 후 저장 경로로 `replace`하고 키를 즉시 삭제한다.
- `/games/leaderboard`는 `:gameId`보다 먼저 선언한다.

### I03. 반응형 앱 셸
- Related Files:
  - `src/layout/AppShell.tsx` :: `AppShell` — sidebar/main 구조; new
  - `src/layout/Sidebar.tsx` :: `Sidebar` — Home, 잠긴 Games, login/logout; new
  - `src/layout/MobileNavToggle.tsx` :: `MobileNavToggle` — 메뉴 아이콘과 focus 복귀; new
  - `src/components/FullScreenLoading.tsx` :: `FullScreenLoading` — redirect/초기화 상태; new

#### Details
- 데스크톱 `>=1024px`에서는 240px 고정 sidebar, 모바일에서는 modal drawer와 backdrop을 사용한다.
- Games 항목은 anonymous일 때 DOM에서 제거하지 않고 잠금 아이콘과 `aria-label="게임 - 로그인 필요"`를 표시하며 클릭 시 login을 시작한다.
- 인증 사용자는 이름과 이메일을 text node로만 렌더링하고 HTML 주입을 금지한다.
- 모바일 drawer는 Escape, backdrop, 링크 선택으로 닫고 열린 동안 main을 inert 처리하며 toggle로 focus를 복원한다.

### I04. 인증 테스트
- Related Files:
  - `src/auth/ProtectedRoute.test.tsx` :: `ProtectedRoute` — return path와 중복 redirect; new
  - `src/layout/Sidebar.test.tsx` :: `Sidebar` — 상태별 메뉴·사용자·버튼; new
  - `src/auth/msal.test.ts` :: `account selection/token requests` — scope 분리; new

#### Details
- Graph scope가 API 요청에 섞이지 않고 API scope가 Graph 요청에 섞이지 않는지 검증한다.
- 악성 외부 returnTo, redirect 처리 중 로딩, 인증 오류 재시도, 모바일 Escape focus 복귀를 포함한다.

## Acceptance Criteria
- [x] Home은 로그인 없이 열리고 Games 접근은 redirect 로그인 후 원래 경로로 돌아온다.
- [x] 브라우저 세션 내 첫 캐시 계정이 자동 선택되고 logout은 redirect 방식으로 완료된다.
- [x] 데스크톱 고정 및 모바일 drawer 사이드바가 키보드로 조작된다.
- [x] Graph/API 토큰 audience 용도의 scope가 분리된다.

## Validation
- `npm run test -- src/auth src/layout` — 인증·라우팅·셸 테스트 통과
- `npm run typecheck && npm run lint && npm run build` — 오류 0건

## Commit Message
```text
feat(auth): add Entra redirect authentication shell

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P01-app-auth-foundation
Task: T02-entra-auth-shell

- initialize single-tenant MSAL and protected return routing
- add responsive authenticated navigation and error recovery
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: 10da1fe
