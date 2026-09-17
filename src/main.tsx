import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { parseClientEnv } from "./env";
import "./styles.css";

parseClientEnv(import.meta.env, import.meta.env.MODE);

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("앱 루트 요소를 찾을 수 없습니다.");
}
const appRootElement = rootElement;

function bootstrap() {
  createRoot(appRootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();