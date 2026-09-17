import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { PendingResultSync } from "@/leaderboard/PendingResultSync";
import { isLeaderboardEnabled } from "@/leaderboard/queries";
import { AppShell } from "@/layout/AppShell";
import { GamePage } from "@/pages/GamePage";
import { GamesPage } from "@/pages/GamesPage";
import { HomePage } from "@/pages/HomePage";
import { LeaderboardPage } from "@/pages/LeaderboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRoutes() {
  const leaderboardEnabled = isLeaderboardEnabled();

  return (
    <>
      {leaderboardEnabled ? <PendingResultSync /> : null}
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="games" element={<GamesPage />} />
            {leaderboardEnabled ? <Route path="games/leaderboard" element={<LeaderboardPage />} /> : null}
            <Route path="games/:gameId" element={<GamePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}