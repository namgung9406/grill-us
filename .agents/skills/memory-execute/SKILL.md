---
name: memory-execute
description: Execute the active task pointer sequentially from .memory/current.md, validate, commit, sync phase.md, and advance current.md pointer automatically.
---

You are an expert software engineer executor. Your goal is to execute the active task referenced by `.memory/current.md`, validate it, commit it, and advance the pointer.

## Execution Workflow (Step-by-Step)

### Step 1: Read Current Pointer
1. Read `.memory/current.md`.
2. Extract the file path of `Active Task` (e.g., `.memory/phases/product-api/P01-core-crud/T01-product-schema.md`).
3. Load and read ONLY that active task blueprint file.

### Step 2: Implement & Validate
1. Implement the exact specifications described in the task blueprint (Target files, models, DTOs, logic).
2. Run the specified `검증 커맨드 (Validation)` (e.g., `pnpm test path/to/spec.ts` or linter/build).
3. If tests fail, fix the implementation until all validation commands pass cleanly.

### Step 3: Bottom-Up State Synchronization & Pointer Advance
Once validation succeeds:
1. **Update Task Blueprint**:
   - Change `Status` from `pending` (or `in_progress`) to `done`.
2. **Git Commit**:
   - Stage the modified source files and the task blueprint.
   - Commit using the `커밋 메시지 (Commit)` specified in the blueprint.
3. **Update `phase.md` Dashboard**:
   - In the parent `phase.md`, change the task's status from `pending` to `done ✅`.
   - If there is a next task (e.g. `T02`), set its status to `in_progress 🔵`.
   - Update `Progress: done X/Y (active: T02)`.
4. **Advance `.memory/current.md` Pointer**:
   - Update `Active Task` link to the next task (`T02`).
   - Update `Status` to reflect completion of previous task.
   - Update `Next Step (IMPORTANT)` with the concrete action for the next task.
   - *(If all tasks in the phase are done, advance `Active Phase` and `Active Task` to the next Phase P02).*

### Step 4: Report to User
Report concisely:
- Completed Task title and commit hash
- Validation result
- Next Active Task and what will be done next
- Ask: "다음 Task를 이어서 진행할까요?" (또는 사용자가 자동 연속 모드를 원할 경우 다음 Task 즉시 실행)

#### 보고 규칙: 초급 개발자용 학습 노트 (필수)

위 보고에 이어 아래 3가지를 반드시 포함한다. 목표는 **이 커밋을 나중에 처음 보는 사람이 혼자 이해할 수 있게** 하는 것이다. 변경이 사소하면 분량도 짧게 쓴다.

1. **핵심 변경 부분** — 파일별로 "무엇을 / 왜" 바꿔는지를 설명하고, 핵심 지점은 **짧은 코드 조각**을 인용한다(전체 diff 나열 금지). 사용한 패턴·API가 처음 등장하는 것이면 한 줄로 설명한다.
2. **알아야 할 점** — 이 변경을 이해하거나 이어서 작업할 때 모르면 사고로 이어지는 내용. 예: 손대면 안 되는 인접 코드와 그 이유, 부수 효과가 있는 전역 상태·캡슐, 검증이 잡아주지 못하는 영역(육안 확인 필요 항목).
3. **요청한 내용은 아니지만 꼭 함께 처리했어야 할 부분** — 구현 중 발견한 기존 결함·부채(깨진 인접 기능, 죽은 코드·낡은 셀렉터, 누락된 검증·권한 체크, 동일 패턴의 다른 발생 지점, 다른 브랜치에도 반영이 필요한 수정)를 목록으로 알린다.
   - **이번 Task 범위 밖의 변경을 임의로 수행하지 않는다.** 발견 사실·예상 영향·권장 조치만 적고, 진행 여부는 사용자가 정한다.
   - 발견이 없으면 "특이사항 없음"으로 명시한다(항목을 생략하지 않는다).