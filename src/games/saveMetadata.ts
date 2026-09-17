import { z } from "zod";

const saveMetadataSchema = z.object({
  version: z.literal(1),
  gameId: z.literal("dex-survivor"),
  ownerObjectId: z.string().min(1),
  citizenUserIds: z.array(z.string().min(1)).max(9),
});

export interface GameSaveMetadata {
  version: 1;
  gameId: "dex-survivor";
  ownerObjectId: string;
  citizenUserIds: readonly string[];
}

export function gameSaveKey(ownerObjectId: string): string {
  return `grill-us:dex-survivor:save:v1:${encodeURIComponent(ownerObjectId)}`;
}

export function readSaveMetadata(ownerObjectId: string): GameSaveMetadata | null {
  const key = gameSaveKey(ownerObjectId);
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return null;
    }

    const parsed = saveMetadataSchema.safeParse(JSON.parse(stored) as unknown);
    if (!parsed.success || parsed.data.ownerObjectId !== ownerObjectId) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}