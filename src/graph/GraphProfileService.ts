import { ObjectUrlRegistry } from "./objectUrlRegistry";
import { type GraphSleeper, withGraphRetry } from "./retry";
import { graphUserSchema, graphUsersPageSchema, type GraphUser } from "./schemas";
import { selectCitizenCandidates } from "./selectCandidates";
import type {
  DirectoryUser,
  GameProfileAssets,
  GraphAdapter,
  PrepareProfileOptions,
  ProfileAsset,
} from "./types";

const MAX_DIRECTORY_USERS = 5_000;
const MAX_PHOTO_CANDIDATES = 200;
const MAX_CITIZENS = 9;
const PHOTO_CONCURRENCY = 4;
const USER_FIELDS = "id,displayName,accountEnabled,userType";

interface GraphProfileServiceDependencies {
  sleeper?: GraphSleeper;
  seedFactory?: () => number;
  registryFactory?: () => ObjectUrlRegistry;
}

function toDirectoryUser(user: GraphUser, playerObjectId: string): DirectoryUser | null {
  if (
    user.accountEnabled !== true ||
    user.userType !== "Member" ||
    user.id === playerObjectId
  ) {
    return null;
  }

  return {
    id: user.id,
    displayName: user.displayName,
    accountEnabled: true,
    userType: "Member",
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("요청이 취소되었습니다.", "AbortError");
  }
}

export class GraphProfileService {
  readonly #adapter: GraphAdapter;
  readonly #sleeper: GraphSleeper | undefined;
  readonly #seedFactory: () => number;
  readonly #registryFactory: () => ObjectUrlRegistry;

  public constructor(adapter: GraphAdapter, dependencies: GraphProfileServiceDependencies = {}) {
    this.#adapter = adapter;
    this.#sleeper = dependencies.sleeper;
    this.#seedFactory = dependencies.seedFactory ?? (() => Math.floor(Math.random() * 2 ** 32));
    this.#registryFactory = dependencies.registryFactory ?? (() => new ObjectUrlRegistry());
  }

  public async prepare(options: PrepareProfileOptions): Promise<GameProfileAssets> {
    const registry = this.#registryFactory();

    try {
      const player = await this.#preparePlayer(options, registry);
      const preferredIds = [...new Set(options.preferredCitizenIds ?? [])];
      const preferredUsers = await this.#loadPreferredUsers(
        preferredIds,
        options.player.objectId,
        options.signal,
      );
      const directoryUsers = await this.#loadDirectoryUsers(options.player.objectId, options.signal);
      const usersById = new Map<string, DirectoryUser>();
      for (const user of [...preferredUsers, ...directoryUsers]) {
        usersById.set(user.id, user);
      }

      const candidates = selectCitizenCandidates(
        [...usersById.values()],
        preferredIds,
        this.#seedFactory(),
      ).slice(0, MAX_PHOTO_CANDIDATES);
      const citizens = await this.#prepareCitizens(candidates, options.signal, registry);

      return {
        player,
        citizens,
        release: () => registry.release(),
      };
    } catch (error) {
      registry.release();
      throw error;
    }
  }

  async #preparePlayer(
    options: PrepareProfileOptions,
    registry: ObjectUrlRegistry,
  ): Promise<ProfileAsset> {
    const objectUrl = await this.#loadPhoto("/me/photos/48x48/$value", options.signal, registry);
    return {
      userId: options.player.objectId,
      displayName: options.player.displayName,
      objectUrl,
      kind: objectUrl === null ? "helmet" : "photo",
    };
  }

  async #loadPreferredUsers(
    ids: readonly string[],
    playerObjectId: string,
    signal: AbortSignal,
  ): Promise<readonly DirectoryUser[]> {
    const users: DirectoryUser[] = [];
    for (const id of ids) {
      throwIfAborted(signal);
      try {
        const response = await this.#adapter.getJson(
          `/users/${encodeURIComponent(id)}?$select=${USER_FIELDS}`,
          signal,
        );
        const user = toDirectoryUser(graphUserSchema.parse(response), playerObjectId);
        if (user !== null) {
          users.push(user);
        }
      } catch {
        throwIfAborted(signal);
      }
    }
    return users;
  }

  async #loadDirectoryUsers(
    playerObjectId: string,
    signal: AbortSignal,
  ): Promise<readonly DirectoryUser[]> {
    const users: DirectoryUser[] = [];
    let scannedUsers = 0;
    let nextLink: string | null = `/users?$select=${USER_FIELDS}&$top=100`;

    while (nextLink !== null && scannedUsers < MAX_DIRECTORY_USERS) {
      throwIfAborted(signal);
      const page = graphUsersPageSchema.parse(await this.#adapter.getJson(nextLink, signal));
      for (const graphUser of page.value) {
        scannedUsers += 1;
        const user = toDirectoryUser(graphUser, playerObjectId);
        if (user !== null) {
          users.push(user);
        }
        if (scannedUsers === MAX_DIRECTORY_USERS) {
          break;
        }
      }
      nextLink = page["@odata.nextLink"] ?? null;
    }

    return users;
  }

  async #prepareCitizens(
    candidates: readonly DirectoryUser[],
    signal: AbortSignal,
    registry: ObjectUrlRegistry,
  ): Promise<readonly ProfileAsset[]> {
    const citizens: ProfileAsset[] = [];

    for (let offset = 0; offset < candidates.length && citizens.length < MAX_CITIZENS; offset += PHOTO_CONCURRENCY) {
      const batch = candidates.slice(offset, offset + PHOTO_CONCURRENCY);
      const assets = await Promise.all(
        batch.map(async (user): Promise<ProfileAsset | null> => {
          const objectUrl = await this.#loadPhoto(
            `/users/${encodeURIComponent(user.id)}/photos/48x48/$value`,
            signal,
            registry,
          );
          return objectUrl === null
            ? null
            : {
                userId: user.id,
                displayName: user.displayName,
                objectUrl,
                kind: "photo",
              };
        }),
      );

      for (const asset of assets) {
        if (asset === null) {
          continue;
        }
        if (citizens.length < MAX_CITIZENS) {
          citizens.push(asset);
        } else if (asset.objectUrl !== null) {
          registry.revoke(asset.objectUrl);
        }
      }
    }

    return citizens;
  }

  async #loadPhoto(
    path: string,
    signal: AbortSignal,
    registry: ObjectUrlRegistry,
  ): Promise<string | null> {
    try {
      const operation = () => this.#adapter.getBlob(path, signal);
      const blob =
        this.#sleeper === undefined
          ? await withGraphRetry(operation, signal)
          : await withGraphRetry(operation, signal, this.#sleeper);
      throwIfAborted(signal);
      return registry.create(blob);
    } catch {
      throwIfAborted(signal);
      return null;
    }
  }
}