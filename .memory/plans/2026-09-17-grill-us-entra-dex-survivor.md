# Plan: Grill Us Entra 로그인과 DEX Survivor

## Goal
Vite + React + TypeScript 기반 SPA에 단일 테넌트 Microsoft Entra ID 인증과 보호된 Games 영역을 구축하고, Phaser 3 기반 `DEX Survivor`를 데스크톱·모바일에서 플레이할 수 있게 한다. 게임 상태는 계정별로 정확히 복원되며, 개발 환경에서는 Entra 커스텀 API scope로 인증된 Express + SQLite Top 10 리더보드에 완결된 결과를 제출한다. 모든 핵심 규칙은 결정론적 단위 테스트와 브라우저 통합 테스트로 검증한다.

## Phase Dependencies
1. P01은 빈 저장소에 앱 도구체인, 인증 경계, Graph 프로필 준비 흐름을 만든다.
2. P02는 P01의 인증 사용자와 프로필 자산 계약 위에 순수 게임 규칙과 Phaser 런타임을 만든다.
3. P03은 P01의 API 토큰 획득과 P02의 결과 DTO 위에 인증된 리더보드를 만든다.
4. P04는 P01~P03의 실제 브라우저 흐름, 반응형 UI, 성능과 운영 비활성화 경계를 검증한다.

## Phases
| Phase | Status | Summary | Blueprint |
| :--- | :--- | :--- | :--- |
| P01 | `done` | Vite 도구체인, Entra 인증, 보호 라우팅, Graph 프로필 준비 | [P01](../phases/2026-09-17-grill-us-entra-dex-survivor/P01-app-auth-foundation/phase.md) |
| P02 | `done` | 결정론적 게임 규칙, Phaser 전투, 보스 3종, 저장·복원 | [P02](../phases/2026-09-17-grill-us-entra-dex-survivor/P02-dex-survivor-game/phase.md) |
| P03 | `in_progress` | Entra JWT 검증, SQLite API, Top 10 UI와 제출 재시도 | [P03](../phases/2026-09-17-grill-us-entra-dex-survivor/P03-leaderboard/phase.md) |
| P04 | `pending` | Playwright 통합, 접근성·반응형·성능·운영 경계 검증 | [P04](../phases/2026-09-17-grill-us-entra-dex-survivor/P04-integration-quality/phase.md) |

## Cross-Phase Invariants
- Microsoft Graph 토큰과 Express API 토큰은 scope와 audience가 다른 별도 토큰으로 취급한다.
- 사진 Blob과 Blob URL은 메모리에만 존재하며 저장, API DTO, SQLite, 로그에 포함하지 않는다.
- 사용자 입력과 네트워크 응답은 Zod 스키마로 검증하고 `any` 타입을 사용하지 않는다.
- 게임 시간은 정수 밀리초, 좌표와 속도는 유한한 number, 엔티티 ID는 UUID 문자열로 직렬화한다.
- React 데이터 조회와 mutation은 TanStack Query를 사용하고 Graph는 Microsoft Graph Client, 자체 API는 `ky`를 사용한다.
- 각 Task는 해당 Task의 테스트를 추가하고 명시된 명령이 통과한 상태로만 완료한다.
