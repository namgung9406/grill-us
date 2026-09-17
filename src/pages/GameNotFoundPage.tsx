import { Link } from "react-router-dom";

export function GameNotFoundPage() {
  return (
    <section className="mx-auto max-w-3xl py-20 text-center">
      <p className="font-mono text-sm font-black text-[#ff5d62]">UNKNOWN GAME</p>
      <h1 className="mt-4 font-mono text-3xl font-black text-white">등록되지 않은 게임입니다</h1>
      <Link to="/games" className="game-command mt-8">
        게임 목록으로
      </Link>
    </section>
  );
}