import {
  Client,
  CustomAuthenticationProvider,
  ResponseType,
  RetryHandlerOptions,
} from "@microsoft/microsoft-graph-client";

import type { GraphAdapter } from "./types";

export function createGraphClient(acquireGraphToken: () => Promise<string>): GraphAdapter {
  const authProvider = new CustomAuthenticationProvider((done) => {
    acquireGraphToken()
      .then((accessToken) => done(null, accessToken))
      .catch((error: unknown) =>
        done(error instanceof Error ? error : new Error("Graph 토큰 발급에 실패했습니다."), null),
      );
  });
  const client = Client.initWithMiddleware({ authProvider });
  const noSdkRetry = [new RetryHandlerOptions(0, 0)];

  return {
    getJson: async (path, signal) =>
      (await client.api(path).option("signal", signal).middlewareOptions(noSdkRetry).get()) as unknown,
    getBlob: async (path, signal) => {
      const result = (await client
        .api(path)
        .option("signal", signal)
        .middlewareOptions(noSdkRetry)
        .responseType(ResponseType.BLOB)
        .get()) as unknown;
      if (!(result instanceof Blob)) {
        throw new TypeError("Graph 사진 응답이 Blob이 아닙니다.");
      }
      return result;
    },
  };
}