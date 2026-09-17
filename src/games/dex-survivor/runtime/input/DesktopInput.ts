import { GAME_BALANCE } from "../../domain/constants";
import type { Vector2 } from "../../domain/types";
import type { InputFrame } from "./types";

export type ScreenToWorld = (clientX: number, clientY: number) => Vector2;

const PREVENTED_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export class DesktopInput {
  readonly #canvas: HTMLCanvasElement;
  readonly #screenToWorld: ScreenToWorld;
  readonly #keys = new Set<string>();
  #aimWorld: Vector2 | null = null;
  #shoot = false;
  #sword = false;
  #dashPressed = false;
  #swordStormPressed = false;
  #ultimatePressed = false;
  #destroyed = false;

  public constructor(canvas: HTMLCanvasElement, screenToWorld?: ScreenToWorld) {
    this.#canvas = canvas;
    this.#screenToWorld = screenToWorld ?? ((clientX, clientY) => this.#defaultScreenToWorld(clientX, clientY));
    if (canvas.tabIndex < 0) {
      canvas.tabIndex = 0;
    }

    canvas.addEventListener("keydown", this.#onKeyDown);
    canvas.addEventListener("keyup", this.#onKeyUp);
    canvas.addEventListener("pointerdown", this.#onPointerDown);
    canvas.addEventListener("pointermove", this.#onPointerMove);
    canvas.addEventListener("pointerup", this.#onPointerUp);
    canvas.addEventListener("pointercancel", this.#onPointerCancel);
    canvas.addEventListener("contextmenu", this.#onContextMenu);
    canvas.addEventListener("blur", this.#onBlur);
    window.addEventListener("pointerup", this.#onWindowPointerUp);
    window.addEventListener("blur", this.#onBlur);
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
  }

  public readFrame(): InputFrame {
    const frame: InputFrame = {
      move: {
        x: Number(this.#keys.has("KeyD") || this.#keys.has("ArrowRight")) -
          Number(this.#keys.has("KeyA") || this.#keys.has("ArrowLeft")),
        y: Number(this.#keys.has("KeyS") || this.#keys.has("ArrowDown")) -
          Number(this.#keys.has("KeyW") || this.#keys.has("ArrowUp")),
      },
      aimWorld: this.#aimWorld ? { ...this.#aimWorld } : null,
      shoot: this.#shoot,
      sword: this.#sword,
      dashPressed: this.#dashPressed,
      swordStormPressed: this.#swordStormPressed,
      ultimatePressed: this.#ultimatePressed,
    };

    this.#dashPressed = false;
    this.#swordStormPressed = false;
    this.#ultimatePressed = false;
    return frame;
  }

  public reset(): void {
    this.#keys.clear();
    this.#aimWorld = null;
    this.#shoot = false;
    this.#sword = false;
    this.#dashPressed = false;
    this.#swordStormPressed = false;
    this.#ultimatePressed = false;
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.reset();
    this.#canvas.removeEventListener("keydown", this.#onKeyDown);
    this.#canvas.removeEventListener("keyup", this.#onKeyUp);
    this.#canvas.removeEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.removeEventListener("pointermove", this.#onPointerMove);
    this.#canvas.removeEventListener("pointerup", this.#onPointerUp);
    this.#canvas.removeEventListener("pointercancel", this.#onPointerCancel);
    this.#canvas.removeEventListener("contextmenu", this.#onContextMenu);
    this.#canvas.removeEventListener("blur", this.#onBlur);
    window.removeEventListener("pointerup", this.#onWindowPointerUp);
    window.removeEventListener("blur", this.#onBlur);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (PREVENTED_KEYS.has(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) {
      return;
    }

    this.#keys.add(event.code);
    if (event.code === "Space") {
      this.#dashPressed = true;
    } else if (event.code === "KeyE") {
      this.#swordStormPressed = true;
    } else if (event.code === "KeyQ") {
      this.#ultimatePressed = true;
    }
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    if (PREVENTED_KEYS.has(event.code)) {
      event.preventDefault();
    }
    this.#keys.delete(event.code);
  };

  readonly #onPointerDown = (event: PointerEvent): void => {
    this.#canvas.focus({ preventScroll: true });
    this.#updateAim(event);
    if (event.button === 0) {
      this.#shoot = true;
    } else if (event.button === 2) {
      this.#sword = true;
    }
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    this.#updateAim(event);
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    this.#releaseButton(event.button);
  };

  readonly #onWindowPointerUp = (event: PointerEvent): void => {
    this.#releaseButton(event.button);
  };

  readonly #onPointerCancel = (): void => {
    this.reset();
  };

  readonly #onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  readonly #onBlur = (): void => {
    this.reset();
  };

  readonly #onVisibilityChange = (): void => {
    if (document.hidden) {
      this.reset();
    }
  };

  #releaseButton(button: number): void {
    if (button === 0) {
      this.#shoot = false;
    } else if (button === 2) {
      this.#sword = false;
    }
  }

  #updateAim(event: PointerEvent): void {
    this.#aimWorld = this.#screenToWorld(event.clientX, event.clientY);
  }

  #defaultScreenToWorld(clientX: number, clientY: number): Vector2 {
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 };
    }

    return {
      x: ((clientX - bounds.left) / bounds.width) * GAME_BALANCE.arena.width,
      y: ((clientY - bounds.top) / bounds.height) * GAME_BALANCE.arena.height,
    };
  }
}