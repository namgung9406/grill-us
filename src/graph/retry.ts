interface GraphErrorDetails {
  statusCode: number | null;
  retryAfter: string | null;
}

export type GraphSleeper = (delayMs: number, signal: AbortSignal) => Promise<void>;

export class RetryAfterTooLongError extends Error {
  public constructor() {
    super("Graph Retry-After가 허용된 30초를 초과했습니다.");
    this.name = "RetryAfterTooLongError";
  }
}

export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1_000;
  }

  const retryAt = Date.parse(trimmed);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - nowMs);
}

function readGraphError(error: unknown): GraphErrorDetails {
  if (typeof error !== "object" || error === null) {
    return { statusCode: null, retryAfter: null };
  }

  const record = error as Record<string, unknown>;
  const statusCode =
    typeof record.statusCode === "number"
      ? record.statusCode
      : typeof record.status === "number"
        ? record.status
        : null;
  const headers = record.headers;
  const retryAfter = headers instanceof Headers ? headers.get("Retry-After") : null;
  return { statusCode, retryAfter };
}

const defaultSleeper: GraphSleeper = (delayMs, signal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        const reason: unknown = signal.reason;
        reject(reason instanceof Error ? reason : new DOMException("요청이 취소되었습니다.", "AbortError"));
      },
      { once: true },
    );
  });

export async function withGraphRetry<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  sleeper: GraphSleeper = defaultSleeper,
  now: () => number = Date.now,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      signal.throwIfAborted();
      const { retryAfter, statusCode } = readGraphError(error);
      const retryable = statusCode === 429 || (statusCode !== null && statusCode >= 500);
      if (!retryable || attempt === 2) {
        throw error;
      }

      const retryAfterMs = parseRetryAfter(retryAfter, now());
      if (retryAfterMs !== null && retryAfterMs > 30_000) {
        throw new RetryAfterTooLongError();
      }

      await sleeper(retryAfterMs ?? 500 * 2 ** attempt, signal);
    }
  }

  throw new Error("Graph retry 루프가 예기치 않게 종료되었습니다.");
}