import { CircleAlert, LoaderCircle, Play, RotateCcw, X } from "lucide-react";

import type { LaunchState } from "./types";

interface GamePreparationProps {
  state: Extract<LaunchState, "preparing" | "ready" | "error">;
  errorMessage: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onEnter: () => void;
}

export function GamePreparation({
  state,
  errorMessage,
  onCancel,
  onRetry,
  onEnter,
}: GamePreparationProps) {
  if (state === "error") {
    return (
      <section className="border border-[#ff5d62] bg-[#2a1c20] p-6" role="alert">
        <CircleAlert aria-hidden="true" className="text-[#ff5d62]" size={28} />
        <h2 className="mt-4 font-mono text-xl font-black text-white">게임 준비에 실패했습니다</h2>
        <p className="mt-2 text-sm text-[#ffd8d9]">{errorMessage}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={onRetry} className="game-command">
            <RotateCcw aria-hidden="true" size={17} /> 재시도
          </button>
          <button type="button" onClick={onCancel} className="game-command">
            <X aria-hidden="true" size={17} /> 취소
          </button>
        </div>
      </section>
    );
  }

  if (state === "ready") {
    return (
      <section className="border border-[#48d7e8] bg-[#14292d] p-6" role="status">
        <h2 className="font-mono text-xl font-black text-white">출격 준비 완료</h2>
        <p className="mt-2 text-sm text-[#bdebf0]">프로필과 게임 모듈을 안전하게 준비했습니다.</p>
        <button type="button" onClick={onEnter} className="game-command mt-6">
          <Play aria-hidden="true" size={17} /> 게임 입장
        </button>
      </section>
    );
  }

  return (
    <section className="border border-[#344452] bg-[#151b21] p-6" role="status">
      <LoaderCircle aria-hidden="true" className="animate-spin text-[#48d7e8]" size={28} />
      <h2 className="mt-4 font-mono text-xl font-black text-white">플레이어 준비 중...</h2>
      <ol className="mt-5 grid gap-2 text-sm text-[#aab8c2]">
        <li>01 로그인 확인</li>
        <li>02 프로필 준비</li>
        <li>03 게임 로드</li>
      </ol>
      <button type="button" onClick={onCancel} className="game-command mt-6">
        <X aria-hidden="true" size={17} /> 취소
      </button>
    </section>
  );
}