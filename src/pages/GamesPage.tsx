import { GameCard } from "@/games/GameCard";
import { GAME_REGISTRY } from "@/games/registry";

export function GamesPage() {
  return (
    <section className="mx-auto max-w-5xl py-8">
      <p className="font-mono text-xs font-black text-[#ffbd45]">SELECT MISSION</p>
      <h1 className="mt-3 font-mono text-3xl font-black text-white sm:text-4xl">게임</h1>
      <div className="mt-10">
        {GAME_REGISTRY.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}