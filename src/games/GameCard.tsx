import { ArrowRight, Swords } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { GameDefinition } from "./types";

interface GameCardProps {
  game: GameDefinition;
}

export function GameCard({ game }: GameCardProps) {
  const navigate = useNavigate();

  return (
    <article className="grid gap-6 border-y border-[#344452] py-7 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="mb-3 flex items-center gap-3 text-[#ff5d62]">
          <Swords aria-hidden="true" size={22} />
          <span className="font-mono text-xs font-black">SURVIVAL / 01</span>
        </div>
        <h2 className="font-mono text-2xl font-black text-white">{game.title}</h2>
        <p className="mt-3 max-w-2xl leading-7 text-[#aab8c2]">{game.description}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigate(`/games/${game.id}`, { state: { startRequested: true } });
        }}
        className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#48d7e8] bg-[#14292d] px-5 font-mono text-sm font-black text-white shadow-[4px_4px_0_#48d7e8] hover:bg-[#1d373c]"
      >
        게임 시작
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </article>
  );
}