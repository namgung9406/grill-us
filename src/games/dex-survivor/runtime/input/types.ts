import type { Vector2 } from "../../domain/types";

export interface InputFrame {
  move: Vector2;
  aimWorld: Vector2 | null;
  shoot: boolean;
  sword: boolean;
  dashPressed: boolean;
  swordStormPressed: boolean;
  ultimatePressed: boolean;
}

export function createEmptyInputFrame(): InputFrame {
  return {
    move: { x: 0, y: 0 },
    aimWorld: null,
    shoot: false,
    sword: false,
    dashPressed: false,
    swordStormPressed: false,
    ultimatePressed: false,
  };
}