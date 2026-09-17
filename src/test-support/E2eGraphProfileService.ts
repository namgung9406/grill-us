import type { ProfileService } from "@/graph/createProfileService";
import type { GameProfileAssets, PrepareProfileOptions, ProfileAsset } from "@/graph/types";

const FIXTURE_COLORS = [
  "#ffbd45",
  "#39a6a3",
  "#ed6a5a",
  "#5b8def",
  "#8f6ed5",
  "#5ca658",
  "#e37a2d",
  "#cb5d8f",
  "#54717a",
  "#d34f4f",
] as const;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("요청이 취소되었습니다.", "AbortError");
  }
}

function createPngBlob(index: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (context === null) {
    return Promise.reject(new Error("E2E PNG fixture를 생성하지 못했습니다."));
  }

  context.fillStyle = FIXTURE_COLORS[index % FIXTURE_COLORS.length] ?? "#39a6a3";
  context.fillRect(0, 0, 48, 48);
  context.fillStyle = "#10282d";
  context.font = "bold 22px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(index + 1), 24, 25);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("E2E PNG fixture를 생성하지 못했습니다."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function createAsset(
  userId: string,
  displayName: string,
  index: number,
  signal: AbortSignal,
  objectUrls: string[],
): Promise<ProfileAsset> {
  throwIfAborted(signal);
  const objectUrl = URL.createObjectURL(await createPngBlob(index));
  objectUrls.push(objectUrl);
  return { userId, displayName, objectUrl, kind: "photo" };
}

export class E2eGraphProfileService implements ProfileService {
  public async prepare(options: PrepareProfileOptions): Promise<GameProfileAssets> {
    const objectUrls: string[] = [];
    const player = await createAsset(
      options.player.objectId,
      options.player.displayName,
      0,
      options.signal,
      objectUrls,
    );
    const citizens = await Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        createAsset(
          `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
          `E2E 시민 ${index + 1}`,
          index + 1,
          options.signal,
          objectUrls,
        ),
      ),
    );

    return {
      player,
      citizens,
      release: () => {
        for (const objectUrl of objectUrls.splice(0)) {
          URL.revokeObjectURL(objectUrl);
        }
      },
    };
  }
}