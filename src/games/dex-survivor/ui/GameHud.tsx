import { CirclePause, LogOut, Play } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { GamePhase } from "../domain/types";
import type { GameBridge } from "../runtime/GameBridge";
import { ResumeCountdown } from "./ResumeCountdown";

interface GameHudProps {
  bridge: GameBridge;
  onExit: () => void;
}

const PHASE_LABELS: Record<GamePhase, string> = {
  normal: "생존",
  boss1: "보스 1",
  boss2: "보스 2",
  boss3: "보스 3",
  "finale-adds": "최종전",
  paused: "일시정지",
  defeated: "패배",
  cleared: "클리어",
};

function percentage(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.min(100, Math.max(0, (value / maximum) * 100));
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function GameHud({ bridge, onExit }: GameHudProps) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const paused = state.phase === "paused";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 font-mono text-white sm:p-5"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
      }}
    >
      <ResumeCountdown remainingMs={state.resumeCountdownMs} />
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-2 text-xs font-bold [text-shadow:0_1px_2px_#000]">
          <div className="w-44" aria-label={`체력 ${state.hp} / ${state.maxHp}`}>
            <div className="mb-1 flex justify-between"><span>HP</span><span>{state.hp}/{state.maxHp}</span></div>
            <div className="h-3 overflow-hidden border border-white/70 bg-black/65">
              <div className="h-full bg-[#ef5b5b]" style={{ width: `${percentage(state.hp, state.maxHp)}%` }} />
            </div>
          </div>
          {state.bossHp !== null && state.bossMaxHp !== null ? (
            <div className="w-56" aria-label={`보스 체력 ${state.bossHp} / ${state.bossMaxHp}`}>
              <div className="mb-1 flex justify-between"><span>BOSS</span><span>{state.bossHp}/{state.bossMaxHp}</span></div>
              <div className="h-3 overflow-hidden border border-[#ffbd45] bg-black/65">
                <div className="h-full bg-[#ffbd45]" style={{ width: `${percentage(state.bossHp, state.bossMaxHp)}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="bg-black/65 px-2 py-1 text-xs font-black">{PHASE_LABELS[state.phase]} {formatElapsed(state.normalElapsedMs)}</span>
          <button
            type="button"
            className="pointer-events-auto grid size-12 place-items-center border border-white/65 bg-black/70 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffbd45]"
            aria-label={paused ? "게임 계속" : "게임 일시정지"}
            title={paused ? "게임 계속" : "게임 일시정지"}
            onClick={() => bridge.dispatch({ type: paused ? "resume" : "pause" })}
          >
            {paused ? <Play aria-hidden="true" size={20} /> : <CirclePause aria-hidden="true" size={20} />}
          </button>
          <button
            type="button"
            className="pointer-events-auto grid size-12 place-items-center border border-white/65 bg-black/70 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffbd45]"
            aria-label="게임 나가기"
            title="게임 나가기"
            onClick={onExit}
          >
            <LogOut aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <div className="mb-28 grid w-44 gap-1.5 text-xs font-bold [text-shadow:0_1px_2px_#000] md:mb-0">
        <div className="flex justify-between"><span>DASH</span><span>{state.dashCharges}/{state.dashMax}</span></div>
        <div className="flex justify-between"><span>E</span><span>{state.swordStormCooldownMs > 0 ? `${(state.swordStormCooldownMs / 1000).toFixed(1)}s` : "READY"}</span></div>
        <div aria-label={`궁극기 충전 ${state.ultimateCharge}%`}>
          <div className="mb-1 flex justify-between"><span>Q</span><span>{state.ultimateCharge}%</span></div>
          <div className="h-2 overflow-hidden border border-white/70 bg-black/65">
            <div className="h-full bg-[#4dd5b8]" style={{ width: `${percentage(state.ultimateCharge, 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}