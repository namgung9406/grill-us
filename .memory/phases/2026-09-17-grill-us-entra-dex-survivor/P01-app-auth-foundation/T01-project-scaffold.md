# Task: T01 Project Scaffold

## Status: done

## Goal
빈 저장소 루트에 엄격한 TypeScript Vite React 애플리케이션과 Express 개발 서버의 공통 도구체인을 만들고, 환경 변수가 누락되면 렌더 전에 실패하는 관찰 가능한 실행 기반을 제공한다.

## Decision Summary
- npm, React 19, Vite, TypeScript strict, Tailwind CSS, Vitest, React Testing Library, Playwright를 사용한다.
- 클라이언트와 서버 환경은 각각 Zod로 검증하며 SPA에 client secret을 두지 않는다.

## Implementation

### I00. Git 저장소 초기화
- Related Files:
  - `.git/` :: `repository metadata` — Task별 커밋을 위한 저장소; generated

#### Details
- 작업 시작 시 `git rev-parse --is-inside-work-tree`가 실패하면 저장소 루트에서 `git init`을 실행한다.
- T01 커밋에는 기존 starter 파일(`README.md`, `AGENTS.md`, `.agents/`, `.memory/`, `examples/`)과 이번 scaffold 파일을 함께 stage하여 재현 가능한 최초 baseline을 만든다.
- 전역 Git 사용자 설정은 변경하지 않는다. `user.name` 또는 `user.email`이 없어 commit이 불가능하면 구현을 중단하고 사용자에게 설정을 요청한다.

### I01. 패키지와 빌드 도구체인
- Related Files:
  - `package.json` :: `scripts/dependencies` — 단일 npm 워크스페이스 명령과 의존성; new
  - `package-lock.json` :: `npm lockfile` — 재현 가능한 설치 버전; generated
  - `tsconfig.json` :: `project references` — client/server/node 설정 연결; new
  - `tsconfig.app.json` :: `compilerOptions` — DOM strict 설정과 `@/*` alias; new
  - `tsconfig.node.json` :: `compilerOptions` — Vite/Playwright/서버 Node 설정; new
  - `vite.config.ts` :: `defineConfig` — React, Tailwind, `/api` proxy, alias; new
  - `vitest.config.ts` :: `defineConfig` — jsdom, setup, coverage, alias; new
  - `playwright.config.ts` :: `defineConfig` — Chromium desktop/mobile 프로젝트와 webServer; new
  - `eslint.config.js` :: `eslint config` — TypeScript/React Hooks/Playwright 검사; new
  - `.gitignore` :: `ignore rules` — node_modules, dist, coverage, test results, SQLite data, env; new

#### Details
- **Scripts**:
  - `dev`: `concurrently -k "npm:dev:client" "npm:dev:server"`
  - `dev:client`: `vite`
  - `dev:server`: `tsx watch server/index.ts`
  - `build`: `tsc -b && vite build`
  - `build:leaderboard-dev`: `tsc -b && vite build --mode leaderboard-dev`
  - `typecheck`: `tsc -b --pretty false`
  - `lint`: `eslint .`
  - `test`: `vitest run`
  - `test:e2e`: `playwright test`
- **Runtime Dependencies**: `@azure/msal-browser`, `@azure/msal-react`, `@microsoft/microsoft-graph-client`, `@tanstack/react-query`, `better-sqlite3`, `express`, `jose`, `ky`, `lucide-react`, `phaser`, `react`, `react-dom`, `react-router-dom`, `zod`.
- **Dev Dependencies**: Vite React plugin, Tailwind Vite plugin, TypeScript, ESLint React/TypeScript plugins, Vitest, jsdom, Testing Library, Playwright, `@axe-core/playwright`, `tsx`, `concurrently`, `cross-env`, Express/React/better-sqlite3 type packages.
- `vite.config.ts`는 `/api`를 `http://127.0.0.1:3001`로 프록시하고 `@`를 `src`로 매핑한다.
- `package-lock.json`은 수동 작성하지 않고 `npm install`로 생성한다.

### I02. 최소 앱과 환경 검증
- Related Files:
  - `index.html` :: `#root` — Vite 진입 문서; new
  - `src/main.tsx` :: `bootstrap` — 환경 검증 후 React root 생성; new
  - `src/App.tsx` :: `App` — 후속 인증 셸을 위한 임시 앱; new
  - `src/styles.css` :: `global theme` — Tailwind import, CSS 변수, 픽셀 테마 기반; new
  - `src/env.ts` :: `clientEnvSchema/clientEnv` — Vite 환경 파싱; new
  - `src/vite-env.d.ts` :: `ImportMetaEnv` — 환경 타입; new
  - `src/test/setup.ts` :: `test setup` — jest-dom과 cleanup; new
  - `.env.example` :: `client/server variable template` — 비밀값 없는 설정 예시; new

#### Details
- **Signatures & Types**:
  ```typescript
  export interface ClientEnv {
    VITE_ENTRA_CLIENT_ID: string;
    VITE_ENTRA_TENANT_ID: string;
    VITE_ENTRA_REDIRECT_URI: string;
    VITE_ENTRA_API_SCOPE: string | null;
    VITE_LEADERBOARD_ENABLED: boolean;
    VITE_E2E_AUTH: boolean;
  }
  export function parseClientEnv(env: ImportMetaEnv, mode: string): ClientEnv;
  ```
- **Validation**:
  - ID 값은 빈 문자열이 아닌 문자열, redirect URI는 URL이다. API scope는 leaderboard enabled일 때만 필수이며 `api://`로 시작하고 `/Leaderboard.Access`로 끝나야 한다.
  - boolean은 문자열 `"true"|"false"`만 허용하고 기본값은 둘 다 `false`다.
  - mode가 정확히 `production`이면 `VITE_E2E_AUTH=true` 또는 `VITE_LEADERBOARD_ENABLED=true` 조합을 즉시 오류로 거부한다. 개발 리더보드 bundle 검증은 `leaderboard-dev`, Playwright는 `e2e` mode만 사용한다.
- `src/main.tsx`는 `parseClientEnv(import.meta.env, import.meta.env.MODE)`가 성공하기 전 `createRoot`를 호출하지 않는다.
- 기본 글꼴은 픽셀 제목용 로컬 fallback과 읽기 쉬운 sans 본문 조합을 사용하고, 단색 한 가지에 치우치지 않는 charcoal/cyan/red/amber CSS 변수를 정의한다.

### I03. 스캐폴드 검증
- Related Files:
  - `src/env.test.ts` :: `parseClientEnv` — 누락·형식·production E2E 거부 테스트; new
  - `src/App.test.tsx` :: `App` — 최소 렌더 스모크; new

#### Details
- 필수 변수 하나씩 누락, 잘못된 URL, 잘못된 boolean, enabled인데 API scope 누락, production E2E/leaderboard 활성화를 각각 실패시킨다.
- 정상 환경에서는 정확한 typed object와 기본 `false`를 반환하는지 검증한다.

## Acceptance Criteria
- [ ] `npm install` 후 `npm run dev:client`가 유효한 환경에서 앱을 렌더한다.
- [ ] 필수 Entra 환경이 없으면 빈 화면 대신 시작 단계 오류가 콘솔과 Vite error overlay에 드러난다.
- [ ] strict typecheck, lint, 환경 테스트와 production build가 통과한다.

## Validation
- `git rev-parse --is-inside-work-tree` — true; 없던 저장소는 T01에서 초기화됨
- `npm install` — lockfile 생성과 native `better-sqlite3` 설치 성공
- `npm run test -- src/env.test.ts src/App.test.tsx` — 환경 경계와 앱 스모크 통과
- `npm run typecheck && npm run lint && npm run build` — 오류 0건

## Commit Message
```text
chore(app): scaffold React TypeScript workspace

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P01-app-auth-foundation
Task: T01-project-scaffold

- configure Vite, Tailwind, tests, and shared npm scripts
- validate public client environment before React startup
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: pending
