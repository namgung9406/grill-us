# Task: T01 Browser Integration

## Status: pending

## Goal
실제 Entra 비밀이나 사용자 계정 없이도 production에 포함될 수 없는 test-only 인증·Graph fixture로 Home부터 게임 저장·종료·리더보드까지의 핵심 브라우저 흐름을 반복 검증한다.

## Decision Summary
- E2E adapter는 `VITE_E2E_AUTH=true`인 Playwright 전용 mode에서만 dynamic import하고 production 조합은 환경 검증이 거부한다.
- 캔버스 픽셀만 추측하지 않고 test-only typed bridge로 simulation 상태를 제어·관찰하되 일반 build에는 bridge를 노출하지 않는다.

## Implementation

### I01. E2E 인증·Graph fixture 경계
- Related Files:
  - `src/auth/createAuthAdapter.ts` :: `createAuthAdapter` — real/test dynamic selection; new
  - `src/auth/AuthProvider.tsx` :: `AuthProvider` — `createAuthAdapter(clientEnv)` 결과만 소비; modify
  - `src/test-support/E2eAuthAdapter.ts` :: `E2eAuthAdapter` — 고정 oid/name/email과 token; new
  - `src/graph/createProfileService.ts` :: `createProfileService` — real/test Graph service dynamic selection; new
  - `src/graph/useGameProfileAssets.ts` :: `useGameProfileAssets` — factory가 반환한 service 주입; modify
  - `src/test-support/E2eGraphProfileService.ts` :: `E2eGraphProfileService` — player/citizen bitmap fixtures; new
  - `src/games/dex-survivor/DexSurvivorGame.tsx` :: `DexSurvivorGame` — E2E mode에서 bridge adapter 설치·해제; modify
  - `src/games/dex-survivor/runtime/createGame.ts` :: `createDexSurvivorGame` — 선택적 test bridge port 주입; modify
  - `src/test-support/E2eGameBridge.ts` :: `E2eGameBridge` — 상태 조회·시간/피해 명령; new
  - `src/env.ts` :: `E2E production rejection` — test bridge까지 단일 flag로 보호; modify

#### Details
- E2E principal은 `00000000-0000-4000-8000-000000000001`, `E2E 플레이어`, `e2e@example.invalid`.
- Graph fixture는 프로그램으로 생성한 48x48 PNG 10개를 Blob으로 제공하며 실제 사용자 사진·ID를 포함하지 않는다.
- `AuthProvider`는 MSAL 객체를 직접 생성하지 않고 `createAuthAdapter(clientEnv)`가 반환한 공통 `AuthAdapter` interface만 사용한다. false일 때 factory의 dynamic branch는 test-support module을 import graph에 포함하지 않는다.
- `useGameProfileAssets`는 `createProfileService(clientEnv, acquireGraphToken)`가 반환한 `ProfileService` interface를 queryFn에 주입하며 E2E mode에서는 Microsoft Graph Client를 생성하지 않는다.
- `DexSurvivorGame`은 `createDexSurvivorGame`이 반환한 내부 bridge port를 E2E mode에서만 `E2eGameBridge.install(port)`에 넘기고 unmount에서 `uninstall()`한다.
- E2E bridge commands: `getSnapshot`, `advanceNormalTo(ms)`, `setBossHp(hp)`, `damageActiveBossPart(amount)`, `damagePlayer(amount)`, `completeCurrentBoss`, `flushSave`.
- bridge는 `import.meta.env.MODE === "e2e" && VITE_E2E_AUTH`일 때만 `globalThis.__DEX_E2E__`에 설치되고 cleanup에서 삭제된다.

### I02. Playwright server와 fixtures
- Related Files:
  - `playwright.config.ts` :: `e2e webServer/projects` — test env와 desktop/mobile; modify
  - `e2e/fixtures/app.ts` :: `test/expect/app fixture` — localStorage/API helpers; new
  - `e2e/global-setup.ts` :: `clean SQLite and state` — 격리; new

#### Details
- webServer는 client `vite --mode e2e`와 server를 concurrently 실행한다. server env는 `NODE_ENV=test`, leaderboard enabled, dev bypass, E2E principal, suite 임시 DB path, `LEADERBOARD_RATE_LIMIT_MAX=1000`을 사용한다. 실제 5회 제한은 P03 unit/API 통합 테스트가 검증하고 E2E 시나리오끼리는 rate-limit state로 간섭하지 않는다.
- 프로젝트: Desktop Chromium 1440x900, Mobile Chromium Pixel 7 viewport/device scale factor.
- 각 test는 고유 browser context와 resultId를 사용한다. DB 초기화는 suite 시작 한 번, test 간 API 결과는 unique data로 충돌을 피한다.
- 실제 login.microsoftonline.com 또는 graph.microsoft.com network request가 발생하면 test를 실패시킨다.

### I03. 핵심 E2E 시나리오
- Related Files:
  - `e2e/auth-navigation.spec.ts` :: public/protected/sidebar; new
  - `e2e/game-lifecycle.spec.ts` :: explicit start/pause/save/resume/restart; new
  - `e2e/bosses-results.spec.ts` :: boss states/clear/defeat; new
  - `e2e/leaderboard.spec.ts` :: submit/top10/pending retry; new

#### Details
- auth: Home 공개, Games 잠금, 보호 URL return, leaderboard route precedence, 모바일 drawer Escape/focus.
- game: 시작 전 Graph/Phaser 없음, 준비 status, canvas nonblank, keyboard/touch command, hidden pause, flush, reload, 동일 snapshot continue countdown.
- bosses: 5/10/15분 phase, boss1 rescue count no score, boss2 part order, boss3 50%/10%/dual adds/3초/clear.
- result: defeat/clear만 pending, restart/exit no result, pending POST 성공 후 queue 제거.
- leaderboard: 두 결과 정렬, 표시 필드, email/object ID 부재, network failure 후 pending 유지와 online 수동 retry.

### I04. E2E 경계 테스트
- Related Files:
  - `src/auth/createAuthAdapter.test.ts` :: production refusal/module selection; new
  - `e2e/no-external-auth.spec.ts` :: network guard; new

#### Details
- production env + E2E flag가 bootstrap 전에 실패하고 일반 production build output에 `__DEX_E2E__` 문자열과 fixture displayName이 없는지 확인한다.
- test bridge command는 schema로 검증하고 임의 함수 실행이나 DOM HTML 주입을 제공하지 않는다.

## Acceptance Criteria
- [ ] Desktop과 Pixel 7 프로젝트에서 인증·게임·저장·보스·리더보드 핵심 흐름이 통과한다.
- [ ] E2E 중 Microsoft 로그인/Graph 외부 요청과 실제 사진 사용이 없다.
- [ ] production mode에서 test adapter와 global bridge를 활성화하거나 번들에 포함할 수 없다.
- [ ] 캔버스가 nonblank이고 typed state와 사용자 화면이 함께 검증된다.

## Validation
- `npm run test -- src/auth/createAuthAdapter.test.ts` — test-only 경계 통과
- `npm run test:e2e -- --project="Desktop Chromium"` — 전체 desktop E2E 통과
- `npm run test:e2e -- --project="Mobile Chromium"` — 전체 mobile E2E 통과

## Commit Message
```text
test(e2e): cover authenticated game and leaderboard flows

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P04-integration-quality
Task: T01-browser-integration

- isolate browser tests behind production-rejected auth fixtures
- verify game persistence, bosses, results, and ranking end to end
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
