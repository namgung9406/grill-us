import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";

import App from "./App";
import { consumeReturnTo } from "./auth/ProtectedRoute";
import { createMsalInstance, initializeMsal } from "./auth/msal";
import { parseClientEnv } from "./env";
import "./styles.css";

const clientEnv = parseClientEnv(import.meta.env, import.meta.env.MODE);
const msalInstance = createMsalInstance(clientEnv);

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("앱 루트 요소를 찾을 수 없습니다.");
}
const appRootElement = rootElement;

async function bootstrap() {
  const account = await initializeMsal(msalInstance);
  if (account !== null) {
    const returnTo = consumeReturnTo();
    if (returnTo !== null) {
      window.history.replaceState(null, "", returnTo);
    }
  }

  createRoot(appRootElement).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
}

void bootstrap();