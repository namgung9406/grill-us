import type { ErrorRequestHandler, Response } from "express";

import type { ApiErrorBody } from "../../src/shared/leaderboard";

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Readonly<Record<string, readonly string[]>>,
    public readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface JsonSyntaxError extends SyntaxError {
  status?: number;
  type?: string;
}

function sendApiError(response: Response, error: ApiError): void {
  for (const [name, value] of Object.entries(error.headers ?? {})) {
    response.setHeader(name, value);
  }
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors === undefined ? {} : { fieldErrors: error.fieldErrors }),
    },
  };
  response.status(error.status).json(body);
}

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  if (error instanceof ApiError) {
    sendApiError(response, error);
    return;
  }

  const jsonError = error as JsonSyntaxError;
  if (jsonError instanceof SyntaxError && (jsonError.status === 400 || jsonError.type === "entity.parse.failed")) {
    sendApiError(response, new ApiError(400, "MALFORMED_JSON", "JSON 요청 본문이 올바르지 않습니다."));
    return;
  }

  if (error instanceof Error && /SQLITE_BUSY|database is locked/i.test(error.message)) {
    sendApiError(response, new ApiError(503, "DATABASE_BUSY", "잠시 후 다시 시도해 주세요."));
    return;
  }

  sendApiError(response, new ApiError(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다."));
};