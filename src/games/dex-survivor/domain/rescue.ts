export function rescueCitizen(rescuedCitizenIds: readonly string[], citizenUserId: string): readonly string[] {
  if (rescuedCitizenIds.includes(citizenUserId)) {
    return rescuedCitizenIds;
  }
  return [...rescuedCitizenIds, citizenUserId];
}

export function rescueRemainingCitizens(
  rescuedCitizenIds: readonly string[],
  citizenUserIds: readonly string[],
): readonly string[] {
  const rescued = new Set(rescuedCitizenIds);
  const remaining = [...new Set(citizenUserIds)].filter((citizenUserId) => !rescued.has(citizenUserId)).sort();
  return [...rescuedCitizenIds, ...remaining];
}