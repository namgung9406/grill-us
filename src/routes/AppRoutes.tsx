import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppShell } from "@/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";

function PendingPage({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-5xl py-16">
      <p className="font-mono text-xs font-black text-[#ffbd45]">COMING ONLINE</p>
      <h1 className="mt-3 font-mono text-4xl font-black text-white">{title}</h1>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="games" element={<PendingPage title="게임" />} />
          <Route path="games/leaderboard" element={<PendingPage title="리더보드" />} />
          <Route path="games/:gameId" element={<PendingPage title="게임 준비" />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}