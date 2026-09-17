import type { ClientEnv } from "@/env";
import type { AuthAdapter } from "@/auth/createAuthAdapter";
import type { AuthenticatedUser } from "@/auth/types";

const E2E_USER: AuthenticatedUser = Object.freeze({
  objectId: "00000000-0000-4000-8000-000000000001",
  displayName: "E2E 플레이어",
  email: "e2e@example.invalid",
});
const E2E_AUTHENTICATED_KEY = "grill-us:e2e:authenticated";

export class E2eAuthAdapter implements AuthAdapter {
  public readonly kind = "e2e" as const;
  readonly #env: ClientEnv;
  #user: AuthenticatedUser | null = null;

  public constructor(env: ClientEnv) {
    this.#env = env;
  }

  public async initialize(): Promise<AuthenticatedUser | null> {
    this.#user = sessionStorage.getItem(E2E_AUTHENTICATED_KEY) === "false" ? null : E2E_USER;
    return this.#user;
  }

  public getUser(): AuthenticatedUser | null {
    return this.#user;
  }

  public async login(): Promise<void> {
    this.#user = E2E_USER;
    sessionStorage.setItem(E2E_AUTHENTICATED_KEY, "true");
  }

  public async logout(): Promise<void> {
    this.#user = null;
    sessionStorage.setItem(E2E_AUTHENTICATED_KEY, "false");
  }

  public async acquireGraphToken(): Promise<string> {
    return "e2e-graph-token";
  }

  public async acquireApiToken(): Promise<string> {
    if (!this.#env.VITE_LEADERBOARD_ENABLED) {
      throw new Error("개발 리더보드가 비활성화되어 있습니다.");
    }
    return "e2e-api-token";
  }
}