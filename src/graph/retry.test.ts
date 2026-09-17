import { describe, expect, it, vi } from "vitest";

import { parseRetryAfter, RetryAfterTooLongError, withGraphRetry } from "./retry";

describe("parseRetryAfter", () => {
  it("초와 HTTP-date를 밀리초로 변환한다", () => {
    const now = Date.parse("2026-09-17T00:00:00Z");
    expect(parseRetryAfter("12", now)).toBe(12_000);
    expect(parseRetryAfter("Thu, 17 Sep 2026 00:00:20 GMT", now)).toBe(20_000);
  });

  it("과거 날짜와 잘못된 값을 안전하게 처리한다", () => {
    const now = Date.parse("2026-09-17T00:00:00Z");
    expect(parseRetryAfter("Wed, 16 Sep 2026 00:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("later", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe("withGraphRetry", () => {
  it("429를 지시된 시간 후 재시도한다", async () => {
    const error = Object.assign(new Error("throttled"), {
      statusCode: 429,
      headers: new Headers({ "Retry-After": "2" }),
    });
    const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");
    const sleeper = vi.fn().mockResolvedValue(undefined);

    await expect(withGraphRetry(operation, new AbortController().signal, sleeper)).resolves.toBe("ok");
    expect(sleeper).toHaveBeenCalledWith(2_000, expect.any(AbortSignal));
  });

  it("30초를 넘는 Retry-After는 기다리지 않고 제외 오류를 낸다", async () => {
    const error = Object.assign(new Error("throttled"), {
      statusCode: 429,
      headers: new Headers({ "Retry-After": "31" }),
    });
    const sleeper = vi.fn().mockResolvedValue(undefined);

    await expect(
      withGraphRetry(() => Promise.reject(error), new AbortController().signal, sleeper),
    ).rejects.toBeInstanceOf(RetryAfterTooLongError);
    expect(sleeper).not.toHaveBeenCalled();
  });
});