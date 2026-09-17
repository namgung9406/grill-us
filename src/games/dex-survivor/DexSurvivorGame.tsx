import { LogOut } from "lucide-react";

import type { GameLaunchProps } from "../types";

export default function DexSurvivorGame({ profileAssets, onExit }: GameLaunchProps) {
  return (
    <section className="grid min-h-[60vh] place-items-center border border-[#344452] bg-[#151b21] p-8 text-center">
      <div>
        <p className="font-mono text-xs font-black text-[#ffbd45]">DEX SURVIVOR</p>
        <h1 className="mt-4 font-mono text-3xl font-black text-white">게임 구현 준비 중</h1>
        <p className="mt-3 text-[#aab8c2]">구출 대상 {profileAssets.citizens.length}명의 자산이 준비되었습니다.</p>
        <button type="button" onClick={onExit} className="game-command mt-7">
          <LogOut aria-hidden="true" size={17} /> 게임 나가기
        </button>
      </div>
    </section>
  );
}