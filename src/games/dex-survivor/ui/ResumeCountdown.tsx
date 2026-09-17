interface ResumeCountdownProps {
  remainingMs: number | null;
}

export function ResumeCountdown({ remainingMs }: ResumeCountdownProps) {
  if (remainingMs === null || remainingMs <= 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45" aria-live="assertive">
      <div className="text-center [text-shadow:0_4px_0_#10171d]">
        <div className="text-sm font-black uppercase text-[#8ad8ff]">BOSS RESUMING</div>
        <div className="text-8xl font-black leading-none text-white">{Math.ceil(remainingMs / 1000)}</div>
      </div>
    </div>
  );
}