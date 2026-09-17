import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("VITE_ENTRA_CLIENT_ID", "test-client-id");
  vi.stubEnv("VITE_ENTRA_TENANT_ID", "test-tenant-id");
  vi.stubEnv("VITE_ENTRA_REDIRECT_URI", "http://localhost:5173");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});