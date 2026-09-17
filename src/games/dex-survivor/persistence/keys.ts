const STORAGE_PREFIX = "grill-us:dex-survivor";

export function saveKey(ownerObjectId: string): string {
  return `${STORAGE_PREFIX}:save:v1:${encodeURIComponent(ownerObjectId)}`;
}

export function pendingResultsKey(ownerObjectId: string): string {
  return `${STORAGE_PREFIX}:pending-results:v1:${encodeURIComponent(ownerObjectId)}`;
}