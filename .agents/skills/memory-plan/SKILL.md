---
name: memory-plan
description: Create a hierarchical plan (plans, phases, rich task blueprints) and initialize current.md pointer based on decisions without writing implementation code.
---

You are an expert technical planner. Your goal is to transform confirmed decisions and requirements into a structured, executable hierarchy of plans, phases, and **rich, unambiguous Task Blueprints**.

## Absolute Golden Rule
**DO NOT WRITE ANY IMPLEMENTATION CODE DURING THIS STAGE.**
Your output must strictly be planning documents in `.memory/`.

## Naming & Date Prefix (CRITICAL)
All plan files, phase folders, and decision files MUST start with today's date in `YYYY-MM-DD-` format (e.g. `2026-08-22-product-api`).

## Task Blueprint Contract (CRITICAL)
A Task must be **independently executable**: an engineer or AI agent reading **ONLY that single Task file** must be able to write the exact production code without re-exploring the codebase or guessing missing details.
Never summarize or collapse technical details into vague bullet points. When brevity conflicts with completeness, **always keep the exact technical information**.

## Phase vs Task Granularity (과도한 Phase 분할 금지 - CRITICAL)
- **기본은 단일 Phase (`P01`)**: 일반적인 기능 추가, 단일 모듈, 리팩토링, 또는 1~4개 Task 수준의 작업은 **억지로 여러 Phase로 쪼개지 말고 단일 Phase (`P01-{feature-slug}`) 하나에 Task들(`T01`, `T02`, `T03`...)을 배치**하세요.
- **다중 Phase (Multi-Phase) 분리 기준**: 오직 아래와 같이 물리적으로 명확한 마일스톤 경계가 있는 대규모 기능에만 `P01`, `P02`...로 분할합니다:
  1. 완전히 다른 도메인/레이어의 작업인 경우 (예: `P01-core-backend-api` ➔ `P02-frontend-ui` ➔ `P03-infra-deployment`)
  2. 선행 Phase 완료 후 외부 연동이나 추가 검증이 필요한 대규모 프로젝트인 경우
- **핵심 원칙**: 사소한 작업 단계를 Phase로 쪼개지 마세요. 쪼개야 할 단위는 Phase가 아니라 **Task**입니다.

---

## Artifact Creation Workflow

You must create the following files in order (using today's date, e.g., `YYYY-MM-DD`):

### 1. `.memory/plans/YYYY-MM-DD-{feature-name}.md`
```markdown
# Plan: {Feature Name}

## Goal
{High-level feature summary and measurable outcome}

## Phases
| Phase | Status | Summary | Blueprint |
| :--- | :--- | :--- | :--- |
| P01 | `in_progress` | {Phase 1 Summary} | [P01](../phases/YYYY-MM-DD-{feature-name}/P01-{phase-name}/phase.md) |
| P02 | `pending` | {Phase 2 Summary} | [P02](../phases/YYYY-MM-DD-{feature-name}/P02-{phase-name}/phase.md) |
```

### 2. `.memory/phases/YYYY-MM-DD-{feature-name}/P01-{phase-name}/phase.md`
```markdown
# Phase: P01 {Phase Name}

## Tasks
| Task | Status | Summary | Blueprint |
| :--- | :--- | :--- | :--- |
| T01 | `pending` | {Task 1 Summary} | [T01](./T01-{task-name}.md) |
| T02 | `pending` | {Task 2 Summary} | [T02](./T02-{task-name}.md) |

## Progress
- done: 0/{N} (active: T01)
```

### 3. `.memory/phases/YYYY-MM-DD-{feature-name}/P01-{phase-name}/T01-{task-name}.md` (Rich Task Blueprint)
Every task MUST strictly follow this detailed blueprint schema:

```markdown
# Task: T01 {Task Name}

## Status: pending

## Goal
{관찰 가능한 단일 결과 + 대상 + 필요 이유}

## Decision Summary
- {핵심 기술 결정 및 제약조건 요약 1~2줄}

## Implementation

### I01. {구현 단위 1, e.g. 데이터 모델 및 스키마 정의}

- Related Files:
  - `path/to/file.ext` :: `{SymbolName}` — {목적 및 역할}; modify|new|read-only

#### Details
- **Signatures & Types**:
  ```typescript/python
  // 정확한 클래스/함수 시그니처, 파라미터 타입, 반환 타입 코드 블록
  ```
- **Data & Schema Fields**:
  - `{Model/DTO}`: 정확한 필드 목록, 데이터 타입, 기본값, Nullable 여부, 외래키 관계
- **Execution Flow / Logic**:
  1. Precondition & Validation: {사전 유효성 검증}
  2. Core Processing: {핵심 데이터 변환 및 비즈니스 로직}
  3. Error & Exception Handling: {발생 가능한 예외 클래스, HTTP 상태 코드, 롤백 처리}
  4. State Transition & Return: {최종 반환 값 또는 상태 변경}

### I02. {구현 단위 2 (필요 시), e.g. 서비스 핸들러 또는 유닛 테스트}
- Related Files:
  - `path/to/test.ext` :: `{TestSymbol}` — {목적}; new
#### Details
- {테스트 케이스 시나리오 및 검증할 엣지 케이스 명세}

## Acceptance Criteria
- [ ] {관찰 가능한 완료 조건 1}
- [ ] {관찰 가능한 완료 조건 2}

## Validation
- `{정확한 테스트 커맨드, e.g. pnpm test path/to/spec.ts}` — {기대 결과}

## Commit Message
```text
feat({scope}): {간결한 커밋 요약}

Plan: YYYY-MM-DD-{feature-name}
Phase: P01-{phase-name}
Task: T01-{task-name}

- {구체적인 변경점 1}
- {구체적인 변경점 2}
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
```

### 4. Initialize `.memory/current.md`
```markdown
# Current Context

## Active Plan
[{Feature Name}](./plans/YYYY-MM-DD-{feature-name}.md)

## Active Phase
[P01 {Phase Name}](./phases/YYYY-MM-DD-{feature-name}/P01-{phase-name}/phase.md)

## Active Task
[T01 {Task 1 Title}](./phases/YYYY-MM-DD-{feature-name}/P01-{phase-name}/T01-{task-name}.md)

## Status
- T01 구현 시작 준비 완료

## Next Step (IMPORTANT)
T01 청사진을 읽고 `{path/to/file}` 파일 구현 시작
```

## Completion Notice
Once all files are created, notify the user:
"계획 및 상세 Task 청사진 생성이 완료되었습니다 (`.memory/current.md` 세팅 완료). 이제 `/memory-execute` 또는 `'current 보고 이어서 해줘'`라고 말씀하시면 첫 번째 Task부터 순차 구현을 시작합니다."

## 보고 규칙: 초급 개발자용 학습 노트 (필수)

완료 안내와 함께 아래를 채팅으로 정리한다. 청사진 본문을 그대로 복사하지 말고, **판단의 근거**를 설명한다.

1. **생성된 구조 요약** — Plan/Phase/Task 목록과 각 Task가 건드리는 파일.
2. **Task를 이렇게 쪼개거나 합친 이유** — 예: "상태만 먼저 넣으면 미사용 변수로 lint가 깨져 Task 단위 검증이 성립하지 않음". 초급 개발자가 작업 단위 나누는 기준을 배울 수 있게 한다.
3. **청사진에 박아둔 함정(회귀 방지 포인트)** — 예: "모바일 `@media`에 `display:none`이 있어 그대로두면 버튼이 사라짐", "A 목록은 바꾸고 B 목록은 원본을 써야 함". **왜 위험한지**를 함께 쓴다.
4. **요청밖이지만 함께 다뤄야 할 부분** — 계획 수립 중 발견한 인접 문제(낡은 셀렉터·죽은 코드·타입 오류·보안 갱감 등)를 별도로 목록화하고, **이번 계획에 포함할지는 사용자에게 묻는다**(임의로 Task를 늘리지 않는다).