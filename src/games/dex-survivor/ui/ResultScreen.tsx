import { LogOut, RotateCcw } from "lucide-react";

import type { RunResult } from "../domain/types";

interface ResultScreenProps {
  result: RunResult;
  rescuedCount: number;
  pendingSaved: boolean;
  onRetry: () => void;
  onExit: () => void;
}

function formatTime(elapsedMs: number | null): string {
  if (elapsedMs === null) {
    return "-";
  }
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function ResultScreen({ result, rescuedCount, pendingSaved, onRetry, onExit }: ResultScreenProps) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-black/80 p-4">
      <section className="w-full max-w-lg border border-[#ffbd45] bg-[#10171d] p-6 text-white" aria-label="게임 결과">
        <p className="font-mono text-xs font-black text-[#ffbd45]">RUN COMPLETE</p>
        <h2 className="mt-2 font-mono text-3xl font-black">
          {result.outcome === "cleared" ? "클리어" : "패배"}
        </h2>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-[#aab8c2]">점수</dt><dd className="text-right font-mono font-black">{result.score}</dd>
          <dt className="text-[#aab8c2]">결과</dt><dd className="text-right">{result.outcome}</dd>
          <dt className="text-[#aab8c2]">적 처치</dt><dd className="text-right">{result.enemyKills}</dd>
          <dt className="text-[#aab8c2]">피격 횟수</dt><dd className="text-right">{result.hitCount}</dd>
          <dt className="text-[#aab8c2]">보스 1</dt><dd className="text-right">{formatTime(result.bossTimesMs[0])}</dd>
          <dt className="text-[#aab8c2]">보스 2</dt><dd className="text-right">{formatTime(result.bossTimesMs[1])}</dd>
          <dt className="text-[#aab8c2]">보스 3</dt><dd className="text-right">{formatTime(result.bossTimesMs[2])}</dd>
          <dt className="text-[#aab8c2]">구조한 시민</dt><dd className="text-right">{rescuedCount}</dd>
        </dl>

        {pendingSaved ? (
          <p className="mt-6 border border-[#48d7e8] bg-[#14292d] p-3 text-sm text-[#bdebf0]" role="status">
            결과가 제출 대기열에 저장되었습니다.
          </p>
        ) : (
          <div className="mt-6 border border-[#ff5d62] bg-[#2a1c20] p-3" role="alert">
            <p className="text-sm text-[#ffd8d9]">결과를 저장하지 못했습니다. 진행 상황은 유지됩니다.</p>
            <button type="button" className="game-command mt-3" onClick={onRetry}>
              <RotateCcw aria-hidden="true" size={17} /> 결과 저장 재시도
            </button>
          </div>
        )}

        <button type="button" className="game-command mt-6" onClick={onExit}>
          <LogOut aria-hidden="true" size={17} /> 게임 나가기
        </button>
      </section>
    </div>
  );
}