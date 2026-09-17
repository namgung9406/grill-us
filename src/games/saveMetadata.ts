import { GameSaveStore } from "./dex-survivor/persistence/GameSaveStore";
import { saveKey } from "./dex-survivor/persistence/keys";

export interface GameSaveMetadata {
  version: 1;
  gameId: "dex-survivor";
  ownerObjectId: string;
  citizenUserIds: readonly string[];
}

export const gameSaveKey = saveKey;

export function readSaveMetadata(ownerObjectId: string): GameSaveMetadata | null {
  const save = new GameSaveStore().read(ownerObjectId);
  return save === null
    ? null
    : {
        version: save.version,
        gameId: save.gameId,
        ownerObjectId: save.ownerObjectId,
        citizenUserIds: save.citizenUserIds,
      };
}