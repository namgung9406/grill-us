/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENTRA_CLIENT_ID?: string;
  readonly VITE_ENTRA_TENANT_ID?: string;
  readonly VITE_ENTRA_REDIRECT_URI?: string;
  readonly VITE_ENTRA_API_SCOPE?: string;
  readonly VITE_LEADERBOARD_ENABLED?: "true" | "false";
  readonly VITE_E2E_AUTH?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}