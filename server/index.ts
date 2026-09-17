import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { createApp, type AppDependencies, type AppResources } from "./app";
import { parseServerEnv } from "./env";

export interface RunningServer {
  server: Server;
  resources: AppResources;
  close(): Promise<void>;
}

export async function startServer(
  rawEnv: NodeJS.ProcessEnv = process.env,
  dependencies: Partial<AppDependencies> = {},
): Promise<RunningServer> {
  const env = parseServerEnv(rawEnv);
  const resources = createApp(env, dependencies);
  const server = createServer(resources.app);
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);

    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    if (resources.database?.open === true) {
      resources.database.close();
    }
  };

  const handleSignal = (): void => {
    void close().catch(() => {
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(env.PORT, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await close();
    throw error;
  }

  return { server, resources, close };
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  void startServer().catch(() => {
    process.exitCode = 1;
  });
}