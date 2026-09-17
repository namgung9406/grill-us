# Task: T02 Release Hardening

## Status: pending

## Goal
완성된 앱의 접근성, desktop/mobile 레이아웃, Phaser 성능, 사진·listener 수명주기와 운영 리더보드 비활성화를 검증하고 재현 가능한 Entra 설정 문서를 남긴다.

## Decision Summary
- 기능 추가 없이 P01~P03의 acceptance를 통합 검증하고 발견된 결함만 해당 소유 파일에서 수정한다.
- 운영 build에는 개발 리더보드 route/API/동기화와 E2E bridge가 없어야 한다.

## Implementation

### I01. 접근성·반응형 시각 검증
- Related Files:
  - `e2e/accessibility.spec.ts` :: `axe and keyboard flows` — 주요 화면 검사; new
  - `e2e/responsive-visual.spec.ts` :: `desktop/mobile screenshots` — overlap/overflow; new
  - `src/styles.css` :: `responsive fixes only` — 검증에서 발견된 결함; modify
  - `src/layout/AppShell.tsx` :: `responsive/a11y fixes only`; modify
  - `src/layout/Sidebar.tsx` :: `navigation a11y fixes only`; modify
  - `src/layout/MobileNavToggle.tsx` :: `drawer focus fixes only`; modify
  - `src/games/dex-survivor/ui/GameHud.tsx` :: `HUD overlap/a11y fixes only`; modify
  - `src/games/dex-survivor/ui/TouchControls.tsx` :: `touch target fixes only`; modify
  - `src/games/dex-survivor/ui/PauseOverlay.tsx` :: `dialog focus fixes only`; modify
  - `package.json` :: `@axe-core/playwright` — T01에 선언된 접근성 도구 존재 확인; read-only

#### Details
- `@axe-core/playwright`로 Home, Games, 준비, HUD pause, 결과, leaderboard의 serious/critical violation 0건을 요구한다.
- keyboard-only로 sidebar, login/logout mock, game start, pause dialog, pending delete confirm을 조작한다.
- viewport: 360x640, 412x915, 768x1024, 1440x900, 1920x1080. horizontal overflow, text clipping, HUD/canvas/control overlap을 검사한다.
- 캔버스 logical ratio 16:9를 유지하고 mobile portrait에서는 가용 높이 안에 letterbox하며 controls는 safe-area와 겹치지 않는다.
- animation은 `prefers-reduced-motion`에서 decorative pulse/reveal을 끄고 game simulation 자체는 변경하지 않는다.

### I02. 성능과 자원 수명주기
- Related Files:
  - `e2e/performance.spec.ts` :: `fps/entity/render/resource probes`; new
  - `src/games/dex-survivor/runtime/GameScene.ts` :: `bounded diagnostics in E2E only`; modify
  - `src/graph/objectUrlRegistry.ts` :: `lifecycle fixes if found`; modify

#### Details
- 10분 이후 최대 cap fixture에서 desktop 60초 동안 simulation step p95 <= 8ms, dropped catch-up event <= 3을 E2E diagnostics로 측정한다. CI 편차를 고려해 render FPS 자체를 hard fail로 삼지 않고 step cost를 기준으로 한다.
- document hidden 2초 후 복귀 시 simulation time jump가 100ms 이하이고 입력이 released인지 검증한다.
- 게임 start/exit 5회 후 Phaser canvas 0/1 규칙, bridge listener 수 baseline, 생성 Blob URL과 revoke 수 일치를 검증한다.
- localStorage snapshot serialized size는 1MiB 이하를 경고·테스트 상한으로 한다. 상한 초과 시 엔티티 cap 또는 snapshot 표현을 수정하고 상태를 누락시키지 않는다.

### I03. 운영 비활성화와 보안 회귀
- Related Files:
  - `e2e/production-boundary.spec.ts` :: disabled route/API/bundle assertions; new
  - `server/app.test.ts` :: disabled no-side-effect; modify
  - `vite.config.ts` :: production chunk checks if needed; modify

#### Details
- `VITE_LEADERBOARD_ENABLED=false`, `LEADERBOARD_ENABLED=false`, `VITE_E2E_AUTH=false` production build/preview에서 sidebar 링크 없음, `/games/leaderboard` 일반 not-found, 결과 submit network 0, `/api/leaderboard` 404, DB file 미생성을 검증한다.
- bundle source map/asset text에서 E2E principal, `__DEX_E2E__`, dev bypass 사용자 값이 없음을 검사한다.
- 로그 capture에서 access token, object ID, email, Graph response, Blob URL이 출력되지 않는지 검사한다.

### I04. 설정·운영 문서
- Related Files:
  - `README.md` :: `application setup/run/test` — starter 설명 아래 앱 절차 추가; modify
  - `.env.example` :: `documented variables` — 설명 주석 보강; modify

#### Details
- Entra SPA redirect URI, single tenant, delegated `User.Read.All` admin consent, `api://{api-client-id}/Leaderboard.Access` expose/grant, audience/tenant 환경 매핑을 단계별로 문서화한다.
- SPA에 client secret을 만들거나 넣지 말라는 경고와 사진 사전 승인이 오프라인에서 완료됐다는 프로젝트 전제를 기록한다.
- `npm install`, `npm run dev`, test/typecheck/lint/build/e2e 명령, dev leaderboard enable/bypass의 non-production 제한을 기록한다.
- SQLite 위치와 삭제 방법, pending 결과가 계정별 localStorage에 남는 정책, 사진은 저장되지 않는 정책을 기록한다.

### I05. 최종 검증
- Related Files:
  - repository-wide :: all source/test/config files — 회귀 검증; read-only unless failures belong to plan

#### Details
- 전체 unit/integration suite, typecheck, lint, production build, desktop/mobile Playwright를 순서대로 실행한다.
- flaky retry로 숨기지 않고 결정론적 clock/seed/fixture를 수정한다. unrelated starter example 파일은 변경하지 않는다.

## Acceptance Criteria
- [ ] 주요 화면 serious/critical 접근성 위반, overflow, overlap이 없다.
- [ ] 최대 적 cap에서도 simulation step 비용과 snapshot 크기 상한을 지킨다.
- [ ] 반복 start/exit와 tab 복귀 후 canvas, listener, object URL 누수가 없다.
- [ ] production boundary에서 leaderboard·dev auth·E2E bridge가 노출되지 않는다.
- [ ] README만으로 Entra 설정과 로컬 실행·검증을 재현할 수 있다.

## Validation
- `npm test` — 전체 Vitest suite 통과
- `npm run typecheck && npm run lint && npm run build` — 오류 0건
- `npm run test:e2e` — desktop/mobile 전체 Playwright 통과

## Commit Message
```text
test(app): harden responsive production boundaries

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P04-integration-quality
Task: T02-release-hardening

- verify accessibility, performance, and resource cleanup
- document Entra setup and disable development features in production
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending