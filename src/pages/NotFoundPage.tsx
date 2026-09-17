import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-3xl py-24 text-center">
      <p className="font-mono text-sm font-black text-[#ff5d62]">404 / SIGNAL LOST</p>
      <h1 className="mt-4 font-mono text-4xl font-black text-white">페이지를 찾을 수 없습니다</h1>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-11 items-center border border-[#48d7e8] px-5 font-mono text-sm font-bold text-white"
      >
        홈으로 돌아가기
      </Link>
    </section>
  );
}