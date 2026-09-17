import { RotateCcw, X } from "lucide-react";

interface RestartDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestartDialog({ onConfirm, onCancel }: RestartDialogProps) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="restart-dialog-title"
        className="w-full max-w-md border border-[#ff5d62] bg-[#171c22] p-6 text-white"
      >
        <h2 id="restart-dialog-title" className="font-mono text-xl font-black">게임 재시작</h2>
        <p className="mt-4 text-sm leading-6 text-[#d8e0e6]">
          현재 진행 상황이 모두 초기화됩니다. 재시작하시겠습니까?
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="game-command" onClick={onCancel}>
            <X aria-hidden="true" size={17} /> 취소
          </button>
          <button type="button" className="game-command" onClick={onConfirm}>
            <RotateCcw aria-hidden="true" size={17} /> 재시작
          </button>
        </div>
      </section>
    </div>
  );
}