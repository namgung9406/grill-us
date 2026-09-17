import type { ComponentType } from "react";

import type { GameProfileAssets } from "@/graph/types";

export interface GameProfileContext {
  profileAssets: GameProfileAssets;
  ownerObjectId: string;
}

export interface GameLaunchProps extends GameProfileContext {
  onExit: () => void;
}

export interface GameDefinition {
  id: "dex-survivor";
  title: "DEX Survivor";
  description: string;
  load: () => Promise<{ default: ComponentType<GameLaunchProps> }>;
}

export type LaunchState = "idle" | "preparing" | "ready" | "running" | "error";