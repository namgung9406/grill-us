# 🚀 Project Memory Starter Kit

> **"AI에게 대화창으로 매번 길게 설명하지 마세요. 파일 기반 메모리로 세션을 영구 유지하세요."**

이 스타터킷은 프로젝트에 복사해 넣는 것만으로 **3가지 전문 AI 스킬(`/grill-me`, `/memory-plan`, `/memory-execute`)**과 **파일 기반 메모리 구조**를 즉시 활성화해 주는 경량 패키지입니다.

---

## ⚡ 1분 설치법

1. 이 `project-memory-starter` 폴더 안에 있는 아래 2개 폴더를 **내 프로젝트 루트**에 복사합니다:
   - **`.agents/`**: 3대 AI 스킬 정의 폴더
   - **`.memory/`**: 메모리 파일들이 저장될 폴더

*(Cursor, Antigravity 등 스킬 지원 도구에서 즉시 슬래시 커맨드로 인식됩니다.)*

---

## 🔄 3단계 워크플로우

```text
  [1단계: 요구사항 인터뷰]        [2단계: 계획 및 청사진 생성]          [3단계: 순차 실행 및 포인터 전진]
    /grill-me <기능명>    ───→    /memory-plan <기능명>      ───→    /memory-execute (또는 "current 보고 진행해줘")
  (decisions/ 확정)              (plans/ & Task 청사진 생성)        (구현 ➔ 테스트 ➔ 커밋 ➔ 포인터 이동)
```

### 1단계: `/grill-me <기능명>`
- AI가 한 번에 딱 1개씩 추천 선택지와 함께 질문을 던집니다.
- 답변을 고르면 애매한 점이 모두 해결될 때까지 인터뷰를 진행하고, 확정된 결정을 `.memory/decisions/{기능명}.md`에 저장합니다.

### 2단계: `/memory-plan <기능명>`
- **(철칙: 이 단계에서는 코드를 전혀 작성하지 않습니다.)**
- 앞서 확정된 결정을 바탕으로 전체 계획(`plans/`), 마일스톤(`phases/`), 그리고 각 Task의 상세 스펙/테스트 명령어가 적힌 **Task 청사진(`T01...md`)**을 일괄 생성합니다.
- `.memory/current.md` 포인터를 첫 번째 작업(T01)으로 자동 초기화합니다.

### 3단계: `/memory-execute` 또는 `"current 보고 이어서 해줘"`
- `.memory/current.md`가 가리키는 Task 청사진만 읽고 정답 코드를 구현합니다.
- 테스트 커맨드를 실행하여 통과하면 자동으로 커밋하고, 상위 `phase.md` 진행률을 올린 뒤, **`current.md` 포인터를 다음 Task(T02)로 자동 전진**시킵니다.
- **퇴근 후 다음 날 새 채팅창을 열고 `"current 보고 이어서 해줘"` 한 줄만 치면 1초 만에 다음 작업으로 직행합니다.**

---

## 📂 폴더 구조 및 역할

```text
.memory/
├── current.md                          ← [포인터] 지금 어디를 작업 중인지 가리키는 20줄 파일
├── decisions/
│   └── YYYY-MM-DD-{기능명}.md          ← [결정] 인터뷰로 확정된 기술 결정 박제
├── plans/
│   └── YYYY-MM-DD-{기능명}.md          ← [계획] 전체 목표 및 Phase 마일스톤 목록
└── phases/
    └── YYYY-MM-DD-{기능명}/            ← [청사진] 날짜별 계획 하위 폴더
        └── P01-{마일스톤}/
            ├── phase.md                ← 진행률 대시보드
            ├── T01-{작업명}.md         ← 파일, 심볼, 모델 스키마, 테스트 커맨드
            └── T02-{작업명}.md

.agents/skills/
├── grill-me/SKILL.md                   ← 인터뷰 스킬
├── memory-plan/SKILL.md                ← 계층 계획 수립 스킬
└── memory-execute/SKILL.md             ← 순차 실행 및 포인터 전진 스킬
```

---

## 📁 예시 살펴보기

`examples/` 폴더에 세미나에서 설명한 **'쇼핑몰 상품 API 구축'** 실물 파일들이 들어있습니다. 어떻게 계획되고 작성되는지 참고해 보세요!

---

## Grill Us 앱 실행

이 저장소에는 React 19, Vite, TypeScript와 Phaser 3로 만든 사내 게임 SPA가 포함되어 있습니다. 로그인은 Microsoft Entra ID redirect 방식이며, 사용자 사진은 Microsoft Graph에서 받아 메모리에만 보관합니다.

### 1. Microsoft Entra 설정

1. Entra 관리 센터에서 이 SPA용 앱 등록을 만들고 **단일 테넌트**를 선택합니다.
2. 인증 메뉴에서 플랫폼 `Single-page application`을 추가하고 로컬 redirect URI `http://localhost:5173`을 등록합니다.
3. Microsoft Graph의 위임된 권한 `User.Read.All`을 추가하고 관리자가 동의합니다. 이 앱은 게임용 사진을 가져오기 전에 조직에서 이 권한이 승인됐다고 가정합니다.
4. 개발 리더보드를 사용할 때는 API 앱 등록에서 `api://{api-client-id}/Leaderboard.Access` scope를 노출합니다.
5. SPA 앱 등록에 위 scope의 위임된 권한을 추가하고 관리자 동의를 완료합니다.
6. SPA는 PKCE redirect 흐름을 사용합니다. **client secret을 만들거나 브라우저 환경 변수에 넣지 마세요.**

환경 변수 매핑:

- `VITE_ENTRA_CLIENT_ID`: SPA 앱 등록의 Application (client) ID
- `VITE_ENTRA_TENANT_ID`: Directory (tenant) ID
- `VITE_ENTRA_REDIRECT_URI`: SPA에 등록한 정확한 redirect URI
- `VITE_ENTRA_API_SCOPE`: `api://{api-client-id}/Leaderboard.Access`
- `ENTRA_TENANT_ID`: API가 허용할 동일 tenant ID
- `ENTRA_API_AUDIENCE`: API 앱의 Application ID URI인 `api://{api-client-id}`
- `ENTRA_REQUIRED_SCOPE`: `Leaderboard.Access` 고정값

### 2. 로컬 실행

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

기본 주소는 SPA `http://localhost:5173`, API `http://localhost:3001`입니다. 일반 게임 실행에는 리더보드가 필요하지 않습니다. 개발 리더보드를 켜려면 client의 `VITE_LEADERBOARD_ENABLED`와 server의 `LEADERBOARD_ENABLED`를 모두 `true`로 설정하고 API scope/tenant/audience를 채웁니다.

로컬에서 실제 API token 없이 리더보드를 시험할 때만 `LEADERBOARD_DEV_AUTH_BYPASS=true`와 개발 사용자 ID/이름을 설정할 수 있습니다. `NODE_ENV=production`은 리더보드와 인증 우회를 모두 거부하며, `VITE_E2E_AUTH`는 Playwright의 `e2e` mode 외에는 사용할 수 없습니다.

### 3. 검증 명령

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Playwright 최초 실행에서 Chromium이 없다면 `npx playwright install chromium`을 한 번 실행합니다.

### 4. 데이터 보관 정책

- 개발 리더보드 SQLite 기본 파일은 `server/data/leaderboard.sqlite`입니다. 서버를 종료한 뒤 이 파일과 같은 이름의 `-wal`, `-shm` 파일을 삭제하면 로컬 순위 데이터가 초기화됩니다.
- 전송 대기 중인 게임 결과와 진행 저장은 브라우저 `localStorage`에 Entra object ID별로 분리되어 남습니다. 로그아웃만으로 삭제되지 않습니다.
- Microsoft Graph 사용자 사진은 실행 중 Blob URL로만 사용하고 화면이나 게임을 종료할 때 revoke합니다. SQLite와 `localStorage`에는 사진이나 Blob URL을 저장하지 않습니다.
