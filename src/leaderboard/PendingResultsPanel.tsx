import { RefreshCw, Trash2 } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import type { PendingResultStore } from "@/games/dex-survivor/persistence/PendingResultStore";

import {
  pendingResultStore,
  requestPendingResultRetry,
  usePendingResults,
  usePendingResultStatuses,
} from "./usePendingResults";

function statusLabel(state: "pending" | "syncing" | "waiting" | "action-required"): string {
  switch (state) {
    case "syncing":
      return "제출 중";
    case "waiting":
      return "재시도 대기";
    case "action-required":
      return "조치 필요";
    default:
      return "제출 대기";
  }
}

interface PendingResultsPanelProps {
  store?: PendingResultStore;
}

export function PendingResultsPanel({ store = pendingResultStore }: PendingResultsPanelProps) {
  const { status, user } = useAuth();
  const ownerObjectId = status === "authenticated" ? user?.objectId ?? null : null;
  const results = usePendingResults(ownerObjectId, store);
  const statuses = usePendingResultStatuses(ownerObjectId);

  if (ownerObjectId === null || results.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-[#344452] pt-6" aria-labelledby="pending-results-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black text-[#ffbd45]">UPLOAD QUEUE</p>
          <h2 id="pending-results-heading" className="mt-1 font-mono text-xl font-black text-white">
            제출 대기 결과
          </h2>
        </div>
        <button
          type="button"
          className="game-command px-4"
          onClick={() => requestPendingResultRetry(ownerObjectId)}
        >
          <RefreshCw aria-hidden="true" size={17} /> 다시 시도
        </button>
      </div>

      <ul className="mt-4 divide-y divide-[#344452] border-y border-[#344452]">
        {results.map((result) => {
          const resultStatus = statuses.get(result.resultId) ?? {
            state: "pending" as const,
            message: null,
            retryAtEpochMs: null,
          };
          return (
            <li key={result.resultId} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-black text-white">#{result.resultId.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-[#aab8c2]">
                  {new Date(result.completedAtEpochMs).toLocaleString("ko-KR")} · {statusLabel(resultStatus.state)}
                </p>
                {resultStatus.message !== null ? (
                  <p className="mt-1 text-xs text-[#ffbd45]" role="status">{resultStatus.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`결과 ${result.resultId.slice(0, 8)} 삭제`}
                title="삭제"
                className="grid size-11 place-items-center border border-[#ff5d62] text-[#ffd8d9] hover:bg-[#2a1c20]"
                onClick={() => {
                  if (window.confirm("이 제출 대기 결과를 삭제하시겠습니까?")) {
                    store.remove(ownerObjectId, result.resultId);
                  }
                }}
              >
                <Trash2 aria-hidden="true" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}