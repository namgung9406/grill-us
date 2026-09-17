import { Crosshair, Gauge, Sparkles, Swords, Zap } from "lucide-react";

const ACTION_BUTTON =
  "pointer-events-auto grid size-14 touch-none place-items-center rounded-full border border-white/70 bg-black/65 text-white shadow-lg active:bg-[#ffbd45] active:text-black";

export function TouchControls() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between p-4 md:hidden" aria-label="터치 조작">
      <div
        data-touch-control="joystick"
        className="pointer-events-auto relative size-28 touch-none rounded-full border-2 border-white/60 bg-black/45"
        role="group"
        aria-label="이동 조이스틱"
      >
        <span className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/20" />
      </div>

      <div className="grid grid-cols-3 items-end gap-2">
        <button type="button" data-touch-control="sword-storm" className={ACTION_BUTTON} aria-label="소드 스톰" title="소드 스톰">
          <Sparkles aria-hidden="true" size={23} />
        </button>
        <button type="button" data-touch-control="ultimate" className={ACTION_BUTTON} aria-label="궁극기" title="궁극기">
          <Zap aria-hidden="true" size={23} />
        </button>
        <button type="button" data-touch-control="dash" className={ACTION_BUTTON} aria-label="대시" title="대시">
          <Gauge aria-hidden="true" size={23} />
        </button>
        <button type="button" data-touch-control="sword" className={`${ACTION_BUTTON} col-start-2`} aria-label="검 공격" title="검 공격">
          <Swords aria-hidden="true" size={25} />
        </button>
        <button type="button" data-touch-control="shoot" className={`${ACTION_BUTTON} size-16`} aria-label="총 공격" title="총 공격">
          <Crosshair aria-hidden="true" size={28} />
        </button>
      </div>
    </div>
  );
}