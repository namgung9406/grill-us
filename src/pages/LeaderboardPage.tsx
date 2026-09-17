import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useMemo } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { LeaderboardApiError, createLeaderboardApi, type LeaderboardApi } from "@/leaderboard/api";
import { PendingResultsPanel } from "@/leaderboard/PendingResultsPanel";
import { isLeaderboardEnabled, leaderboardQueryOptions } from "@/leaderboard/queries";
import type { LeaderboardEntry } from "@/shared/leaderboard";

interface LeaderboardPageProps {
  api?: LeaderboardApi;
  enabled?: boolean;
}

function formatBossTime(elapsedMs: number | null): string {
  if (elapsedMs === null) {
    return "-";
  }
  const totalTenths = Math.floor(elapsedMs / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${totalTenths % 10}`;
}

function outcomeLabel(outcome: LeaderboardEntry["outcome"]): string {
  return outcome === "cleared" ? "클리어" : "패배";
}

function LeaderboardRows({ entries }: { entries: readonly LeaderboardEntry[] }) {
  return (
    <>
      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-y border-[#344452] font-mono text-xs text-[#aab8c2]">
            <tr>
              <th className="px-3 py-3" scope="col">순위</th>
              <th className="px-3 py-3" scope="col">플레이어</th>
              <th className="px-3 py-3 text-right" scope="col">점수</th>
              <th className="px-3 py-3" scope="col">결과</th>
              <th className="px-3 py-3 text-right" scope="col">처치</th>
              <th className="px-3 py-3 text-right" scope="col">피격</th>
              <th className="px-3 py-3 text-right" scope="col">보스 1</th>
              <th className="px-3 py-3 text-right" scope="col">보스 2</th>
              <th className="px-3 py-3 text-right" scope="col">보스 3</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#283640]">
            {entries.map((entry, index) => (
              <tr key={entry.resultId}>
                <td className="px-3 py-4 font-mono font-black text-[#ffbd45]">{index + 1}</td>
                <td className="px-3 py-4 font-bold text-white">{entry.displayName}</td>
                <td className="px-3 py-4 text-right font-mono font-black text-[#48d7e8]">{entry.score.toLocaleString()}</td>
                <td className="px-3 py-4">{outcomeLabel(entry.outcome)}</td>
                <td className="px-3 py-4 text-right">{entry.enemyKills}</td>
                <td className="px-3 py-4 text-right">{entry.hitCount}</td>
                {entry.bossTimesMs.map((bossTime, bossIndex) => (
                  <td key={bossIndex} className="px-3 py-4 text-right font-mono">{formatBossTime(bossTime)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="mt-6 divide-y divide-[#344452] border-y border-[#344452] md:hidden">
        {entries.map((entry, index) => (
          <li key={entry.resultId} className="py-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="min-w-0 truncate font-bold text-white">
                <span className="mr-3 font-mono text-[#ffbd45]">#{index + 1}</span>{entry.displayName}
              </p>
              <p className="shrink-0 font-mono font-black text-[#48d7e8]">{entry.score.toLocaleString()}</p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
              <div><dt className="text-[#7f909c]">결과</dt><dd>{outcomeLabel(entry.outcome)}</dd></div>
              <div><dt className="text-[#7f909c]">처치</dt><dd>{entry.enemyKills}</dd></div>
              <div><dt className="text-[#7f909c]">피격</dt><dd>{entry.hitCount}</dd></div>
              {entry.bossTimesMs.map((bossTime, bossIndex) => (
                <div key={bossIndex}><dt className="text-[#7f909c]">보스 {bossIndex + 1}</dt><dd className="font-mono">{formatBossTime(bossTime)}</dd></div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </>
  );
}

export function LeaderboardPage({ api, enabled }: LeaderboardPageProps) {
  const { acquireApiToken } = useAuth();
  const featureEnabled = enabled ?? isLeaderboardEnabled();
  const defaultApi = useMemo(() => createLeaderboardApi(acquireApiToken), [acquireApiToken]);
  const leaderboardApi = api ?? defaultApi;
  const query = useQuery(leaderboardQueryOptions(leaderboardApi, featureEnabled));

  if (!featureEnabled) {
    return null;
  }

  const isAuthError = query.error instanceof LeaderboardApiError &&
    (query.error.status === 401 || query.error.status === 403);

  return (
    <section className="mx-auto max-w-6xl py-8" aria-labelledby="leaderboard-heading">
      <p className="font-mono text-xs font-black text-[#ffbd45]">TOP 10 RUNS</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 id="leaderboard-heading" className="font-mono text-3xl font-black text-white sm:text-4xl">리더보드</h1>
        <button
          type="button"
          className="game-command px-4"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw aria-hidden="true" size={17} /> 새로고침
        </button>
      </div>

      {query.isPending ? (
        <div className="mt-8 grid gap-3" role="status" aria-label="리더보드 불러오는 중">
          {[0, 1, 2].map((row) => <div key={row} className="h-12 animate-pulse bg-[#202931]" />)}
        </div>
      ) : query.isError ? (
        <div className="mt-8 border-l-4 border-[#ff5d62] bg-[#2a1c20] p-4" role="alert">
          <p className="font-bold text-white">
            {isAuthError ? "리더보드 인증이 필요합니다." : "리더보드를 불러오지 못했습니다."}
          </p>
          <p className="mt-1 text-sm text-[#ffd8d9]">잠시 후 다시 시도해주세요.</p>
        </div>
      ) : query.data.length === 0 ? (
        <p className="mt-8 border-y border-[#344452] py-10 text-center text-[#aab8c2]">아직 등록된 기록이 없습니다.</p>
      ) : (
        <LeaderboardRows entries={query.data} />
      )}

      <PendingResultsPanel />
    </section>
  );
}