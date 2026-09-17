import { LogOut, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

interface PauseOverlayProps {
  saveWarning: boolean;
  onContinue: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export function PauseOverlay({ saveWarning, onContinue, onRestart, onExit }: PauseOverlayProps) {
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    continueButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-4">
      <section
        className="w-full max-w-sm border border-[#48d7e8] bg-[#10171d] p-6 text-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-dialog-title"
      >
        <p className="font-mono text-xs font-black text-[#48d7e8]">PAUSED</p>
        <h2 id="pause-dialog-title" className="mt-2 font-mono text-2xl font-black">일시정지</h2>
        {saveWarning ? (
          <p className="mt-4 border border-[#ff5d62] bg-[#2a1c20] p-3 text-sm text-[#ffd8d9]" role="alert">
            진행 상황을 저장하지 못했습니다.
          </p>
        ) : null}
        <div className="mt-6 grid gap-3">
          <button ref={continueButtonRef} type="button" className="game-command" onClick={onContinue}>
            <Play aria-hidden="true" size={17} /> 계속하기
          </button>
          <button type="button" className="game-command" onClick={onRestart}>
            <RotateCcw aria-hidden="true" size={17} /> 재시작
          </button>
          <button type="button" className="game-command" onClick={onExit}>
            <LogOut aria-hidden="true" size={17} /> 나가기
          </button>
        </div>
      </section>
    </div>
  );
}