import type { AuthenticatedUser } from "@/auth/types";

export interface DirectoryUser {
  id: string;
  displayName: string;
  accountEnabled: true;
  userType: "Member";
}

export interface ProfileAsset {
  userId: string;
  displayName: string;
  objectUrl: string | null;
  kind: "photo" | "helmet";
}

export interface GameProfileAssets {
  player: ProfileAsset;
  citizens: readonly ProfileAsset[];
  release: () => void;
}

export interface PrepareProfileOptions {
  player: AuthenticatedUser;
  preferredCitizenIds?: readonly string[];
  signal: AbortSignal;
}

export interface GraphAdapter {
  getJson: (path: string, signal: AbortSignal) => Promise<unknown>;
  getBlob: (path: string, signal: AbortSignal) => Promise<Blob>;
}