# Task: T02 Phaser Player Runtime

## Status: pending

## Goal
1280x720 고정 아레나에서 60Hz 결정론적 simulation과 최대 120FPS 렌더링을 분리하고, 데스크톱·모바일 입력으로 플레이어 총·검·대시·스킬을 조작하며 React HUD에 typed 상태를 전달한다.

## Decision Summary
- Phaser는 월드와 전투, React는 HUD와 modal을 소유하며 typed event bridge로만 통신한다.
- Strict Mode 이중 mount, 탭 복귀 catch-up 폭주, 모바일 멀티터치와 브라우저 기본 동작을 명시적으로 방지한다.

## Implementation

### I01. Phaser lifecycle와 scene
- Related Files:
  - `src/games/dex-survivor/DexSurvivorGame.tsx` :: `DexSurvivorGame` — P01 placeholder를 React mount와 HUD 조합으로 교체; modify
  - `src/games/dex-survivor/runtime/createGame.ts` :: `createDexSurvivorGame` — Phaser config/factory; new
  - `src/games/dex-survivor/runtime/GameScene.ts` :: `GameScene` — fixed-step orchestrator; new
  - `src/games/dex-survivor/runtime/textureFactory.ts` :: `createProceduralTextures` — 픽셀 도형 texture; new

#### Details
- **Signature**:
  ```typescript
  export interface CreateGameOptions {
    parent: HTMLElement; initialState: GameState; assets: GameProfileAssets;
    bridge: GameBridge;
  }
  export function createDexSurvivorGame(options: CreateGameOptions): Phaser.Game;
  ```
- config: `AUTO`, logical `1280x720`, transparent false, pixelArt true, roundPixels true, Scale.FIT + CENTER_BOTH, Arcade physics debug false, fps target 120.
- GameScene은 render delta accumulator로 `1000/60` step을 최대 5회 실행하며 `delta>250ms` 또는 visibility 복귀 시 accumulator를 0으로 버린다.
- React effect cleanup은 bridge listener 제거, input reset, texture 제거, `game.destroy(true)`를 정확히 한 번 수행한다.
- 모든 비사진 자산은 Phaser Graphics로 절차 생성한다. 사진 texture key는 user ID hash 기반이고 object URL 자체를 key/log로 쓰지 않는다.

### I02. 플레이어와 전투 입력
- Related Files:
  - `src/games/dex-survivor/runtime/systems/PlayerSystem.ts` :: `PlayerSystem` — 이동·공격·cooldown; new
  - `src/games/dex-survivor/runtime/input/DesktopInput.ts` :: `DesktopInput` — 키보드/마우스; new
  - `src/games/dex-survivor/runtime/input/TouchInput.ts` :: `TouchInput` — joystick/buttons/multitouch; new
  - `src/games/dex-survivor/runtime/input/types.ts` :: `InputFrame` — simulation 입력; new

#### Details
- **InputFrame**:
  ```typescript
  export interface InputFrame {
    move: Vector2; aimWorld: Vector2 | null;
    shoot: boolean; sword: boolean; dashPressed: boolean;
    swordStormPressed: boolean; ultimatePressed: boolean;
  }
  ```
- 기본값: 이동 260px/s; 총 20 damage, 180ms interval, 900px/s, 620px range; 검 35 damage, 90px range, 110도 arc, 120ms active, 450ms cooldown.
- dash는 facing/move 방향으로 220px를 180ms에 이동, dash 중과 종료 후 총 250ms 무적, charge 기본 1, 각 charge 3초 회복.
- 피격 후 600ms 무적이며 실제 hp가 감소한 damage event마다 hitCount를 1 증가시킨다. 겹친 충돌 프레임 수를 세지 않는다.
- E sword storm은 radius 180, damage 60, cooldown 8초. Q는 charge 100일 때 arena 전체 적/보스에 250 damage 후 0으로 초기화. charge는 active simulation 600ms마다 +1(총 60초).
- canvas에서만 contextmenu와 Space/방향키 기본 동작을 막는다. blur/visibility/pointercancel 시 입력을 모두 release한다.
- 모바일 joystick은 pointer capture와 pointer ID를 사용하고 공격 버튼과 동시 멀티터치를 허용한다. 자동 조준은 700px 내 가장 가까운 적, 동률이면 entity ID 오름차순이다.

### I03. React-Phaser bridge와 HUD
- Related Files:
  - `src/games/dex-survivor/runtime/GameBridge.ts` :: `GameBridge/GameCommand/GameViewState` — typed pub/sub; new
  - `src/games/dex-survivor/ui/GameHud.tsx` :: `GameHud` — hp, dash, cooldown, charge, timer, boss hp; new
  - `src/games/dex-survivor/ui/TouchControls.tsx` :: `TouchControls` — stable mobile controls; new

#### Details
- **Contracts**:
  ```typescript
  export interface GameViewState {
    hp: number; maxHp: number; dashCharges: number; dashMax: number;
    swordStormCooldownMs: number; ultimateCharge: number;
    normalElapsedMs: number; phase: GamePhase; bossHp: number | null; bossMaxHp: number | null;
  }
  export type GameCommand = { type: "pause" } | { type: "resume" } | { type: "restart" };
  ```
- bridge는 `useSyncExternalStore`용 immutable snapshot을 제공하고 최대 20Hz로 HUD update를 제한한다. game simulation은 React render에 의존하지 않는다.
- HUD는 canvas 위 unframed overlay, 고정 크기 meter, safe-area inset, pointer-events 최소화를 사용한다.
- touch control hit target은 최소 48px, 아이콘과 accessible label을 제공한다.

### I04. 런타임 테스트
- Related Files:
  - `src/games/dex-survivor/runtime/systems/PlayerSystem.test.ts` :: player rules; new
  - `src/games/dex-survivor/runtime/GameBridge.test.ts` :: subscribe/cleanup/throttle; new
  - `src/games/dex-survivor/DexSurvivorGame.test.tsx` :: Strict Mode lifecycle; new

#### Details
- 수동 clock과 가짜 input frame으로 총 interval, 검 arc, dash charge/무적, hit debounce, E/Q cooldown을 검증한다.
- Strict Mode mount에서 활성 Phaser instance가 하나만 남고 unmount 후 listener와 game이 0개인지 검증한다.

## Acceptance Criteria
- [ ] 데스크톱과 멀티터치 모바일 입력이 동일한 InputFrame 계약으로 동작한다.
- [ ] simulation은 60Hz이며 렌더 delta 급증 시 최대 5 step 이상 따라잡지 않는다.
- [ ] HUD는 20Hz 이하로 갱신되어도 실제 전투 상태와 cooldown을 정확히 표시한다.
- [ ] React Strict Mode와 경로 이탈 후 Phaser 인스턴스·listener가 남지 않는다.

## Validation
- `npm run test -- src/games/dex-survivor/runtime src/games/dex-survivor/DexSurvivorGame.test.tsx` — runtime 테스트 통과
- `npm run typecheck && npm run lint && npm run build` — Phaser lazy chunk 빌드 성공

## Commit Message
```text
feat(game): add Phaser player runtime and HUD bridge

Plan: 2026-09-17-grill-us-entra-dex-survivor
Phase: P02-dex-survivor-game
Task: T02-phaser-player-runtime

- run deterministic combat inside a bounded Phaser lifecycle
- support desktop and multitouch controls with React HUD state
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
