import { GAME_BALANCE } from "../../domain/constants";
import type { Vector2 } from "../../domain/types";
import type { InputFrame } from "./types";

export interface AimTarget {
  id: string;
  position: Vector2;
}

type TouchAction = "shoot" | "sword" | "dash" | "sword-storm" | "ultimate";

const JOYSTICK_RADIUS_PX = 52;

export function selectAutoAimTarget(
  playerPosition: Vector2,
  targets: readonly AimTarget[],
  maximumRange = GAME_BALANCE.player.autoAimRange,
): AimTarget | null {
  const maximumDistanceSquared = maximumRange * maximumRange;
  let selected: AimTarget | null = null;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const offsetX = target.position.x - playerPosition.x;
    const offsetY = target.position.y - playerPosition.y;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;
    if (distanceSquared > maximumDistanceSquared) {
      continue;
    }

    if (
      distanceSquared < selectedDistanceSquared ||
      (distanceSquared === selectedDistanceSquared && (selected === null || target.id < selected.id))
    ) {
      selected = target;
      selectedDistanceSquared = distanceSquared;
    }
  }

  return selected;
}

export class TouchInput {
  readonly #root: HTMLElement;
  readonly #actionsByPointer = new Map<number, TouchAction>();
  #joystickPointerId: number | null = null;
  #joystickCenter: Vector2 = { x: 0, y: 0 };
  #move: Vector2 = { x: 0, y: 0 };
  #dashPressed = false;
  #swordStormPressed = false;
  #ultimatePressed = false;
  #destroyed = false;

  public constructor(root: HTMLElement) {
    this.#root = root;
    root.addEventListener("pointerdown", this.#onPointerDown);
    root.addEventListener("pointermove", this.#onPointerMove);
    root.addEventListener("pointerup", this.#onPointerEnd);
    root.addEventListener("pointercancel", this.#onPointerCancel);
    window.addEventListener("blur", this.#onBlur);
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
  }

  public readFrame(playerPosition: Vector2, targets: readonly AimTarget[]): InputFrame {
    const target = selectAutoAimTarget(playerPosition, targets);
    const heldActions = new Set(this.#actionsByPointer.values());
    const frame: InputFrame = {
      move: { ...this.#move },
      aimWorld: target ? { ...target.position } : null,
      shoot: heldActions.has("shoot"),
      sword: heldActions.has("sword"),
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
    this.#actionsByPointer.clear();
    this.#joystickPointerId = null;
    this.#move = { x: 0, y: 0 };
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
    this.#root.removeEventListener("pointerdown", this.#onPointerDown);
    this.#root.removeEventListener("pointermove", this.#onPointerMove);
    this.#root.removeEventListener("pointerup", this.#onPointerEnd);
    this.#root.removeEventListener("pointercancel", this.#onPointerCancel);
    window.removeEventListener("blur", this.#onBlur);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    const control = this.#controlElement(event.target);
    const controlName = control?.dataset.touchControl;
    if (!control || !controlName) {
      return;
    }

    event.preventDefault();
    control.setPointerCapture?.(event.pointerId);
    if (controlName === "joystick") {
      if (this.#joystickPointerId !== null) {
        return;
      }
      const bounds = control.getBoundingClientRect();
      this.#joystickPointerId = event.pointerId;
      this.#joystickCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      this.#updateJoystick(event);
      return;
    }

    if (!this.#isTouchAction(controlName)) {
      return;
    }
    this.#actionsByPointer.set(event.pointerId, controlName);
    if (controlName === "dash") {
      this.#dashPressed = true;
    } else if (controlName === "sword-storm") {
      this.#swordStormPressed = true;
    } else if (controlName === "ultimate") {
      this.#ultimatePressed = true;
    }
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#joystickPointerId) {
      return;
    }
    event.preventDefault();
    this.#updateJoystick(event);
  };

  readonly #onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.#joystickPointerId) {
      this.#joystickPointerId = null;
      this.#move = { x: 0, y: 0 };
    }
    this.#actionsByPointer.delete(event.pointerId);
  };

  readonly #onPointerCancel = (): void => {
    this.reset();
  };

  readonly #onBlur = (): void => {
    this.reset();
  };

  readonly #onVisibilityChange = (): void => {
    if (document.hidden) {
      this.reset();
    }
  };

  #controlElement(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>("[data-touch-control]") : null;
  }

  #isTouchAction(value: string): value is TouchAction {
    return value === "shoot" || value === "sword" || value === "dash" || value === "sword-storm" || value === "ultimate";
  }

  #updateJoystick(event: PointerEvent): void {
    const offsetX = event.clientX - this.#joystickCenter.x;
    const offsetY = event.clientY - this.#joystickCenter.y;
    const distance = Math.hypot(offsetX, offsetY);
    const scale = distance > JOYSTICK_RADIUS_PX ? JOYSTICK_RADIUS_PX / distance : 1;
    this.#move = {
      x: (offsetX * scale) / JOYSTICK_RADIUS_PX,
      y: (offsetY * scale) / JOYSTICK_RADIUS_PX,
    };
  }
}