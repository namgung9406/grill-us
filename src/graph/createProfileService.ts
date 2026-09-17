import type { ClientEnv } from "@/env";

import { createGraphClient } from "./createGraphClient";
import { GraphProfileService } from "./GraphProfileService";
import type { GameProfileAssets, PrepareProfileOptions } from "./types";

export interface ProfileService {
  prepare: (options: PrepareProfileOptions) => Promise<GameProfileAssets>;
}

export function createProfileService(
  env: ClientEnv,
  acquireGraphToken: () => Promise<string>,
): ProfileService {
  if (import.meta.env.MODE === "e2e" && env.VITE_E2E_AUTH) {
    return {
      prepare: async (options) => {
        const { E2eGraphProfileService } = await import("@/test-support/E2eGraphProfileService");
        return new E2eGraphProfileService().prepare(options);
      },
    };
  }

  return new GraphProfileService(createGraphClient(acquireGraphToken));
}