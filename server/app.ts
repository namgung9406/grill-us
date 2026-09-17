import express, { type Express, type RequestHandler } from "express";
import type Database from "better-sqlite3";

import { requirePrincipal } from "./auth/requirePrincipal";
import type { AccessTokenVerifier } from "./auth/types";
import { createAccessTokenVerifier } from "./auth/verifyAccessToken";
import { LeaderboardRepository } from "./db/LeaderboardRepository";
import { migrate } from "./db/migrate";
import { openDatabase } from "./db/openDatabase";
import type { ServerEnv } from "./env";
import { errorMiddleware } from "./http/errors";
import { createLeaderboardRouter } from "./routes/leaderboard";

export interface AppDependencies {
  databaseFactory: (databasePath: string) => Database.Database;
  verifierFactory: (env: ServerEnv) => AccessTokenVerifier;
}

export interface AppResources {
  app: Express;
  database: Database.Database | null;
  repository: LeaderboardRepository | null;
  authenticate: RequestHandler | null;
}

const defaultDependencies: AppDependencies = {
  databaseFactory: openDatabase,
  verifierFactory: createAccessTokenVerifier,
};

export function createApp(
  env: ServerEnv,
  dependencies: Partial<AppDependencies> = {},
): AppResources {
  if (env.NODE_ENV === "production" && (env.LEADERBOARD_ENABLED || env.LEADERBOARD_DEV_AUTH_BYPASS)) {
    throw new Error("Leaderboard features cannot run in production.");
  }

  const app = express();
  app.disable("x-powered-by");
  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", leaderboardEnabled: env.LEADERBOARD_ENABLED });
  });

  if (!env.LEADERBOARD_ENABLED) {
    app.use("/api/leaderboard", (_request, response) => {
      response.status(404).end();
    });
    return { app, database: null, repository: null, authenticate: null };
  }

  const databaseFactory = dependencies.databaseFactory ?? defaultDependencies.databaseFactory;
  const verifierFactory = dependencies.verifierFactory ?? defaultDependencies.verifierFactory;
  const database = databaseFactory(env.LEADERBOARD_DB_PATH);

  try {
    migrate(database);
    const verifier = env.LEADERBOARD_DEV_AUTH_BYPASS ? null : verifierFactory(env);
    const authenticate = requirePrincipal(env, verifier);
    const repository = new LeaderboardRepository(database);
    app.use("/api/leaderboard", createLeaderboardRouter({
      repository,
      authenticate,
      rateLimitMaximum: env.LEADERBOARD_RATE_LIMIT_MAX,
    }));
    app.use(errorMiddleware);
    return { app, database, repository, authenticate };
  } catch (error) {
    database.close();
    throw error;
  }
}