import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const databasePath = resolve(".tmp/e2e-leaderboard.sqlite");

export default async function globalSetup(): Promise<void> {
  await mkdir(resolve(".tmp"), { recursive: true });
  await Promise.all([
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true }),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await globalSetup();
}