import type { DirectoryUser } from "./types";

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function selectCitizenCandidates(
  users: readonly DirectoryUser[],
  preferredIds: readonly string[],
  seed: number,
): readonly DirectoryUser[] {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const selectedIds = new Set<string>();
  const preferred: DirectoryUser[] = [];

  for (const id of preferredIds) {
    const user = usersById.get(id);
    if (user !== undefined && !selectedIds.has(id)) {
      selectedIds.add(id);
      preferred.push(user);
    }
  }

  const shuffled = users.filter((user) => !selectedIds.has(user.id));
  const random = createSeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const target = shuffled[swapIndex];
    if (current !== undefined && target !== undefined) {
      shuffled[index] = target;
      shuffled[swapIndex] = current;
    }
  }

  return [...preferred, ...shuffled];
}