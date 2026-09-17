# Project Memory Workflow Rules

당신은 아래 3가지 단계(명령어)에 따라 순차적으로 작업해야 합니다.

---

## [1단계: 인터뷰] `/grill-me <기능명>`

코딩을 시작하기 전에 애매한 요구사항과 아키텍처 결정을 확정합니다.

1. **한 번에 딱 1개씩 질문하세요.** (질문 폭탄 금지)
2. **질문할 때 추천 답안(Recommended)과 2~3개 선택지를 함께 제시하세요.**
3. 기존 코드베이스를 뒤져서 알 수 있는 내용은 묻지 말고 직접 확인하세요.
4. 모든 설계 분기가 확정되면 `.memory/decisions/YYYY-MM-DD-{기능명}.md` 파일로 저장하고 종료합니다.

---

## [2단계: 계획] `/memory-plan <기능명>`

`decisions/`를 바탕으로 계획을 물리적 파일로 쪼갭니다.
**(이 단계에서는 절대로 코드를 치지 마세요!)**

1. 전체 로드맵을 `.memory/plans/YYYY-MM-DD-{기능명}.md`로 작성합니다.
2. 각 Phase 폴더(`phases/YYYY-MM-DD-{기능명}/P01.../`)를 만들고 `phase.md`를 생성합니다.
3. 각 Task 파일(`T01...md`)에 아래 내용을 포함한 상세 청사진을 작성합니다:
   - 수정할 파일 경로 및 심볼(클래스/함수)
   - 모델 스키마, 필드명, 타입
   - 검증 커맨드 (테스트 명령어)
   - 커밋 메시지 (Plan: YYYY-MM-DD-{기능명} 헤더 포함)
4. `.memory/current.md`를 생성하여 첫 번째 Task(P01-T01)를 가리키게 세팅합니다.

---

## [3단계: 순차 실행] `/memory-execute` 또는 `"current 보고 이어서 해줘"`

`.memory/current.md` 포인터를 기준으로 작업을 1개씩 순차 구현합니다.

1. `.memory/current.md`를 읽고 현재 `Active Task` 청사진 파일을 확인합니다.
2. 청사진에 지정된 파일에 코드를 구현하고 검증 커맨드를 실행합니다.
3. 테스트 통과 시:
   - Task 파일의 `Status`를 `done`으로 변경
   - Git 커밋 (청사진에 적힌 커밋 메시지 사용)
   - 상위 `phase.md`의 진행률 갱신
   - `.memory/current.md`의 `Active Task`를 다음 Task로 전진
