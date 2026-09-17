import { GAME_BALANCE } from "../../domain/constants";
import type { ProjectileSnapshot, Vector2 } from "../../domain/types";

const FULL_TURN = Math.PI * 2;
const PROJECTILE_RADIUS = 6;
const PROJECTILE_RANGE = Math.hypot(GAME_BALANCE.arena.width, GAME_BALANCE.arena.height) * 2;

export interface RingPatternOptions {
  origin: Vector2;
  projectileCount: number;
  speed: number;
  damage: number;
  seed: number;
  patternIndex: number;
  rotationDirection?: 1 | -1;
  createId: () => string;
}

export interface AimedBurstOptions {
  origin: Vector2;
  target: Vector2;
  projectileCount: number;
  speed: number;
  damage: number;
  createId: () => string;
}

export interface EdgeCompressionOptions {
  edges: "horizontal" | "vertical";
  projectileCount: number;
  speed: number;
  damage: number;
  createId: () => string;
}

function mix(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function deterministicUnit(seed: number, patternIndex: number, salt: number): number {
  return mix(seed ^ Math.imul(patternIndex + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) / 0x1_0000_0000;
}

function createProjectile(
  id: string,
  position: Vector2,
  angleRadians: number,
  speed: number,
  damage: number,
): ProjectileSnapshot {
  return {
    id,
    owner: "enemy",
    position: { ...position },
    velocity: { x: Math.cos(angleRadians) * speed, y: Math.sin(angleRadians) * speed },
    damage,
    remainingRange: PROJECTILE_RANGE,
    radius: PROJECTILE_RADIUS,
  };
}

export function spawnRing(options: RingPatternOptions): readonly ProjectileSnapshot[] {
  const direction = options.rotationDirection ?? 1;
  const rotation = deterministicUnit(options.seed, options.patternIndex, 0) * FULL_TURN * direction;
  return Array.from({ length: options.projectileCount }, (_, index) =>
    createProjectile(
      options.createId(),
      options.origin,
      rotation + direction * ((index * FULL_TURN) / options.projectileCount),
      options.speed,
      options.damage,
    ),
  );
}

export function spawnAimedBurst(options: AimedBurstOptions): readonly ProjectileSnapshot[] {
  const baseAngle = Math.atan2(options.target.y - options.origin.y, options.target.x - options.origin.x);
  const spreadRadians = Math.PI / 36;
  const centerIndex = (options.projectileCount - 1) / 2;
  return Array.from({ length: options.projectileCount }, (_, index) =>
    createProjectile(
      options.createId(),
      options.origin,
      baseAngle + (index - centerIndex) * spreadRadians,
      options.speed,
      options.damage,
    ),
  );
}

export function spawnEdgeCompression(options: EdgeCompressionOptions): readonly ProjectileSnapshot[] {
  const projectilesPerEdge = Math.floor(options.projectileCount / 2);
  const center = { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 };
  const positions: Vector2[] = [];
  for (let index = 0; index < projectilesPerEdge; index += 1) {
    const fraction = (index + 0.5) / projectilesPerEdge;
    if (options.edges === "horizontal") {
      const x = fraction * GAME_BALANCE.arena.width;
      positions.push({ x, y: 0 }, { x, y: GAME_BALANCE.arena.height });
    } else {
      const y = fraction * GAME_BALANCE.arena.height;
      positions.push({ x: 0, y }, { x: GAME_BALANCE.arena.width, y });
    }
  }
  return positions.slice(0, options.projectileCount).map((position) =>
    createProjectile(
      options.createId(),
      position,
      Math.atan2(center.y - position.y, center.x - position.x),
      options.speed,
      options.damage,
    ),
  );
}

export function createSafeZone(seed: number, patternIndex: number, positionIndex: number): Vector2 {
  const { radius } = GAME_BALANCE.bosses.bossThree.safeZone;
  const availableWidth = GAME_BALANCE.arena.width - radius * 2;
  const availableHeight = GAME_BALANCE.arena.height - radius * 2;
  return {
    x: radius + deterministicUnit(seed, patternIndex, positionIndex * 2 + 1) * availableWidth,
    y: radius + deterministicUnit(seed, patternIndex, positionIndex * 2 + 2) * availableHeight,
  };
}