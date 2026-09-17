# Phase: P03 Authenticated Development Leaderboard

## Goal
Express API가 Entra 커스텀 scope 토큰을 검증하고 완결된 결과만 SQLite에 멱등 저장하며, SPA가 Top 10 조회와 실패 제출 재시도를 제공하게 한다.

## Tasks
| Task | Status | Summary | Blueprint |
| :--- | :--- | :--- | :--- |
| T01 | `in_progress 🔵` | Express 서버, 환경 검증, Entra JWT 인증과 SQLite 스키마 구축 | [T01](./T01-api-auth-storage.md) |
| T02 | `pending` | 결과 재계산·타당성·빈도 제한과 Top 10 API 구현 | [T02](./T02-leaderboard-endpoints.md) |
| T03 | `pending` | 리더보드 화면, API 토큰, 제출 큐·계정별 재시도 구현 | [T03](./T03-leaderboard-client.md) |

## Progress
- done: 0/3 (active: T01)
