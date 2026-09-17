import { GAME_BALANCE } from "../../domain/constants";
import type { PlayerSnapshot, Vector2 } from "../../domain/types";
import { derivedStats } from "../../domain/upgrades";
import type { InputFrame } from "../input/types";

export type PlayerAction =
  | {
      type: "gun";
      origin: Vector2;
      direction: Vector2;
      damage: number;
      speed: number;
      range: number;
    }
  | {
      type: "sword";
      origin: Vector2;
      direction: Vector2;
      damage: number;
      range: number;
      arcRadians: number;
      activeMs: number;
    }
  | { type: "dash"; direction: Vector2; distance: number; durationMs: number }
  | { type: "sword-storm"; origin: Vector2; damage: number; radius: number }
  | { type: "ultimate"; damage: number };

export interface PlayerStepResult {
  player: PlayerSnapshot;
  actions: readonly PlayerAction[];
}

export interface PlayerDamageResult {
  applied: boolean;
  player: PlayerSnapshot;
  hitCount: number;
}

function copyVector(vector: Vector2): Vector2 {
  return { x: vector.x, y: vector.y };
}

function copyPlayer(player: PlayerSnapshot): PlayerSnapshot {
  return {
    ...player,
    position: copyVector(player.position),
    velocity: copyVector(player.velocity),
    dashRecoveryRemainingMs: [...player.dashRecoveryRemainingMs],
    upgrades: { ...player.upgrades },
  };
}

function normalized(vector: Vector2): Vector2 | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return null;
  }

  return { x: vector.x / length, y: vector.y / length };
}

function directionFromRadians(radians: number): Vector2 {
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function boundedPosition(position: Vector2): Vector2 {
  return {
    x: Math.min(GAME_BALANCE.arena.width, Math.max(0, position.x)),
    y: Math.min(GAME_BALANCE.arena.height, Math.max(0, position.y)),
  };
}

function remaining(current: number, deltaMs: number): number {
  return Math.max(0, current - deltaMs);
}

export class PlayerSystem {
  #player: PlayerSnapshot;
  #hitCount: number;
  #dashDirection: Vector2;

  public constructor(initialPlayer: PlayerSnapshot, initialHitCount = 0) {
    this.#player = copyPlayer(initialPlayer);
    this.#hitCount = initialHitCount;
    this.#dashDirection =
      initialPlayer.dashRemainingMs > 0
        ? (normalized(initialPlayer.velocity) ?? directionFromRadians(initialPlayer.facingRadians))
        : directionFromRadians(initialPlayer.facingRadians);
  }

  public get snapshot(): PlayerSnapshot {
    return copyPlayer(this.#player);
  }

  public get hitCount(): number {
    return this.#hitCount;
  }

  public reset(player: PlayerSnapshot, hitCount = 0): void {
    this.#player = copyPlayer(player);
    this.#hitCount = hitCount;
    this.#dashDirection = normalized(player.velocity) ?? directionFromRadians(player.facingRadians);
  }

  public step(deltaMs: number, input: InputFrame): PlayerStepResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("deltaMs must be a nonnegative finite number");
    }

    const player = copyPlayer(this.#player);
    const stats = derivedStats(player.upgrades);
    const actions: PlayerAction[] = [];
    player.invulnerableRemainingMs = remaining(player.invulnerableRemainingMs, deltaMs);
    player.gunCooldownMs = remaining(player.gunCooldownMs, deltaMs);
    player.swordCooldownMs = remaining(player.swordCooldownMs, deltaMs);
    player.swordActiveRemainingMs = remaining(player.swordActiveRemainingMs, deltaMs);
    player.swordStormCooldownMs = remaining(player.swordStormCooldownMs, deltaMs);
    player.swordStormActiveRemainingMs = remaining(player.swordStormActiveRemainingMs, deltaMs);

    const moveDirection = normalized(input.move);
    const aimDirection = input.aimWorld
      ? normalized({ x: input.aimWorld.x - player.position.x, y: input.aimWorld.y - player.position.y })
      : null;

    if (aimDirection) {
      player.facingRadians = Math.atan2(aimDirection.y, aimDirection.x);
    } else if (moveDirection) {
      player.facingRadians = Math.atan2(moveDirection.y, moveDirection.x);
    }

    let startedDash = false;
    if (input.dashPressed && player.dashCharges > 0 && player.dashRemainingMs === 0) {
      startedDash = true;
      this.#dashDirection = moveDirection ?? directionFromRadians(player.facingRadians);
      player.dashCharges -= 1;
      player.dashRecoveryRemainingMs = [...player.dashRecoveryRemainingMs, stats.dashRecoveryMs];
      player.dashRemainingMs = GAME_BALANCE.player.dash.durationMs;
      player.invulnerableRemainingMs = Math.max(
        player.invulnerableRemainingMs,
        GAME_BALANCE.player.dash.invulnerabilityMs,
      );
      actions.push({
        type: "dash",
        direction: copyVector(this.#dashDirection),
        distance: GAME_BALANCE.player.dash.distance,
        durationMs: GAME_BALANCE.player.dash.durationMs,
      });
    }

    const facingDirection = directionFromRadians(player.facingRadians);
    if (input.shoot && player.gunCooldownMs === 0) {
      actions.push({
        type: "gun",
        origin: copyVector(player.position),
        direction: facingDirection,
        damage: stats.gunDamage,
        speed: GAME_BALANCE.player.gun.projectileSpeed,
        range: stats.gunRange,
      });
      player.gunCooldownMs = GAME_BALANCE.player.gun.intervalMs;
    }

    if (input.sword && player.swordCooldownMs === 0) {
      actions.push({
        type: "sword",
        origin: copyVector(player.position),
        direction: facingDirection,
        damage: stats.swordDamage,
        range: stats.swordRange,
        arcRadians: (GAME_BALANCE.player.sword.arcDegrees * Math.PI) / 180,
        activeMs: GAME_BALANCE.player.sword.activeMs,
      });
      player.swordCooldownMs = GAME_BALANCE.player.sword.cooldownMs;
      player.swordActiveRemainingMs = GAME_BALANCE.player.sword.activeMs;
    }

    if (input.swordStormPressed && player.swordStormCooldownMs === 0) {
      actions.push({
        type: "sword-storm",
        origin: copyVector(player.position),
        damage: GAME_BALANCE.player.swordStorm.damage,
        radius: GAME_BALANCE.player.swordStorm.radius,
      });
      player.swordStormCooldownMs = GAME_BALANCE.player.swordStorm.cooldownMs;
      player.swordStormActiveRemainingMs = GAME_BALANCE.player.sword.activeMs;
    }

    if (input.ultimatePressed && player.ultimateCharge >= GAME_BALANCE.player.ultimate.maxCharge) {
      actions.push({ type: "ultimate", damage: GAME_BALANCE.player.ultimate.damage });
      player.ultimateCharge = 0;
      player.ultimateChargeTickRemainderMs = 0;
    }

    const dashMovementMs = Math.min(deltaMs, player.dashRemainingMs);
    if (dashMovementMs > 0) {
      const dashSpeed = GAME_BALANCE.player.dash.distance / GAME_BALANCE.player.dash.durationMs;
      player.velocity = {
        x: this.#dashDirection.x * dashSpeed * 1000,
        y: this.#dashDirection.y * dashSpeed * 1000,
      };
      player.position = boundedPosition({
        x: player.position.x + this.#dashDirection.x * dashSpeed * dashMovementMs,
        y: player.position.y + this.#dashDirection.y * dashSpeed * dashMovementMs,
      });
    } else {
      player.velocity = moveDirection
        ? { x: moveDirection.x * GAME_BALANCE.player.moveSpeed, y: moveDirection.y * GAME_BALANCE.player.moveSpeed }
        : { x: 0, y: 0 };
      player.position = boundedPosition({
        x: player.position.x + (player.velocity.x * deltaMs) / 1000,
        y: player.position.y + (player.velocity.y * deltaMs) / 1000,
      });
    }

    player.dashRemainingMs = remaining(player.dashRemainingMs, deltaMs);
    if (startedDash) {
      player.invulnerableRemainingMs = remaining(player.invulnerableRemainingMs, deltaMs);
    }

    const recovering = player.dashRecoveryRemainingMs.map((cooldownMs) => remaining(cooldownMs, deltaMs));
    const recoveredCharges = recovering.filter((cooldownMs) => cooldownMs === 0).length;
    player.dashCharges = Math.min(stats.dashMaxCharges, player.dashCharges + recoveredCharges);
    player.dashRecoveryRemainingMs = recovering.filter((cooldownMs) => cooldownMs > 0);

    if (player.ultimateCharge < GAME_BALANCE.player.ultimate.maxCharge) {
      const accumulatedMs = player.ultimateChargeTickRemainderMs + deltaMs;
      const gainedCharge = Math.floor(accumulatedMs / GAME_BALANCE.player.ultimate.chargeTickMs);
      player.ultimateCharge = Math.min(GAME_BALANCE.player.ultimate.maxCharge, player.ultimateCharge + gainedCharge);
      player.ultimateChargeTickRemainderMs =
        player.ultimateCharge === GAME_BALANCE.player.ultimate.maxCharge
          ? 0
          : accumulatedMs % GAME_BALANCE.player.ultimate.chargeTickMs;
    }

    this.#player = player;
    return { player: copyPlayer(player), actions };
  }

  public takeDamage(damage: number): PlayerDamageResult {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new RangeError("damage must be a nonnegative finite number");
    }

    if (damage === 0 || this.#player.hp === 0 || this.#player.invulnerableRemainingMs > 0) {
      return { applied: false, player: this.snapshot, hitCount: this.#hitCount };
    }

    this.#player.hp = Math.max(0, this.#player.hp - damage);
    this.#player.invulnerableRemainingMs = GAME_BALANCE.player.hitInvulnerabilityMs;
    this.#hitCount += 1;
    return { applied: true, player: this.snapshot, hitCount: this.#hitCount };
  }
}