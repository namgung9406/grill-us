import { Gamepad2, RefreshCw } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";

export function HomePage() {
  const { errorMessage, retry, status, user } = useAuth();

  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col justify-center border-l-4 border-[#48d7e8] px-6 py-10 sm:px-10">
      <p className="font-mono text-xs font-black text-[#ffbd45]">GRILL US ARCADE</p>
      <h1 className="mt-4 max-w-4xl font-mono text-4xl font-black leading-tight text-white sm:text-6xl">
        게임을 준비하고 있습니다
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-7 text-[#c5d0d8] sm:text-lg">
        Microsoft Entra ID로 연결되는 사내 픽셀 아케이드입니다. 로그인한 구성원은 Games 메뉴에서
        DEX Survivor를 플레이할 수 있습니다.
      </p>

      {status === "authenticated" && user !== null && (
        <div className="mt-8 flex items-center gap-3 font-mono text-sm text-[#48d7e8]">
          <Gamepad2 aria-hidden="true" size={20} />
          {user.displayName} 님, 게임이 준비됐습니다.
        </div>
      )}

      {status === "error" && (
        <div className="mt-8 border border-[#ff5d62] bg-[#2a1c20] p-4" role="alert">
          <p className="text-sm text-[#ffd8d9]">{errorMessage}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex min-h-11 items-center gap-2 border border-[#ff5d62] px-4 font-mono text-sm font-bold text-white"
          >
            <RefreshCw aria-hidden="true" size={17} />
            다시 시도
          </button>
        </div>
      )}
    </section>
  );
}