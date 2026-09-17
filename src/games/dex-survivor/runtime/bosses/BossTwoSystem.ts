import {
  BOSS_TWO_BALANCE,
  BOSS_TWO_PART_LAYOUT,
  activeBossTwoParts,
  advanceBossTwoStage,
  bossTwoPartPosition,
  type BossTwoPartKey,
} from "../../domain/bosses";
import type { ActiveHazardSnapshot, BossTwoSnapshot, Vector2 } from "../../domain/types";
import {
  updateBossTwoAttacks,
  type BossTwoAttackContact,
} from "./BossTwoAttacks";

const PLAYER_RADIUS = 20;
const BODY_CONTACT_RADIUS = 76;
const PART_KEYS: readonly BossTwoPartKey[] = ["shield", "maceArm", "leftLeg", "rightLeg", "core"];

export interface BossTwoSystemOptions {
  boss: BossTwoSnapshot;
  activeHazards?: readonly ActiveHazardSnapshot[];
  createId?: () => string;
}

export interface BossTwoDamageTarget {
  id: string;
  part: BossTwoPartKey;
  position: Vector2;
  radius: number;
  active: boolean;
}

export interface BossTwoSummonRequest {
  position: Vector2;
}

export interface BossTwoStepResult {
  boss: BossTwoSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  contacts: readonly BossTwoAttackContact[];
  summons: readonly BossTwoSummonRequest[];
}

export interface BossTwoDamageResult {
  boss: BossTwoSnapshot;
  appliedDamage: number;
  blocked: boolean;
  targetPart: BossTwoPartKey | null;
  completed: boolean;
}

function copyBoss(boss: BossTwoSnapshot): BossTwoSnapshot {
  return {
    ...boss,
    position: { ...boss.position },
    parts: {
      shield: { ...boss.parts.shield },
      maceArm: { ...boss.parts.maceArm },
      leftLeg: { ...boss.parts.leftLeg },
      rightLeg: { ...boss.parts.rightLeg },
      core: { ...boss.parts.core },
    },
  };
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `40000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`;
}

export function bossTwoTargetId(part: BossTwoPartKey): string {
  return `boss2-${part}`;
}

export function bossTwoMoveSpeed(boss: BossTwoSnapshot): number {
  const survivingLegs = Number(!boss.parts.leftLeg.destroyed) + Number(!boss.parts.rightLeg.destroyed);
  if (survivingLegs === 2) {
    return BOSS_TWO_BALANCE.moveSpeed;
  }
  if (survivingLegs === 1) {
    return BOSS_TWO_BALANCE.oneLegMoveSpeed;
  }
  return 0;
}

export class BossTwoSystem {
  readonly #createId: () => string;
  #boss: BossTwoSnapshot;
  #activeHazards: ActiveHazardSnapshot[];

  public constructor(options: BossTwoSystemOptions) {
    this.#boss = advanceBossTwoStage(copyBoss(options.boss));
    this.#activeHazards = structuredClone(options.activeHazards ? [...options.activeHazards] : []);
    this.#createId = options.createId ?? createSequentialIdFactory();
  }

  public get boss(): BossTwoSnapshot {
    return copyBoss(this.#boss);
  }

  public get activeHazards(): readonly ActiveHazardSnapshot[] {
    return structuredClone(this.#activeHazards);
  }

  public get moveSpeed(): number {
    return bossTwoMoveSpeed(this.#boss);
  }

  public get damageTargets(): readonly BossTwoDamageTarget[] {
    const activeParts = new Set(activeBossTwoParts(this.#boss));
    return PART_KEYS.filter((part) => !this.#boss.parts[part].destroyed)
      .map((part) => ({
        id: bossTwoTargetId(part),
        part,
        position: bossTwoPartPosition(this.#boss, part),
        radius: BOSS_TWO_PART_LAYOUT[part].radius,
        active: activeParts.has(part),
      }))
      .sort((left, right) => Number(right.active) - Number(left.active));
  }

  public projectileTarget(position: Vector2, projectileRadius: number): BossTwoDamageTarget | null {
    const shieldTarget = this.damageTargets.find(({ part }) => part === "shield");
    if (
      shieldTarget &&
      (this.#distance(position, shieldTarget.position) <= projectileRadius + shieldTarget.radius ||
        this.#distance(position, this.#boss.position) <= projectileRadius + BOSS_TWO_PART_LAYOUT.core.radius)
    ) {
      return shieldTarget;
    }
    return (
      this.damageTargets.find(
        (target) => this.#distance(position, target.position) <= projectileRadius + target.radius,
      ) ?? null
    );
  }

  public step(deltaMs: number, playerPosition: Vector2): BossTwoStepResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("deltaMs must be a nonnegative finite number");
    }

    const direction = this.#direction(this.#boss.position, playerPosition);
    const travelDistance = (this.moveSpeed * deltaMs) / 1000;
    if (direction.distance > BODY_CONTACT_RADIUS + PLAYER_RADIUS && travelDistance > 0) {
      const boundedTravel = Math.min(travelDistance, direction.distance - BODY_CONTACT_RADIUS - PLAYER_RADIUS);
      this.#boss = {
        ...this.#boss,
        position: {
          x: this.#boss.position.x + direction.vector.x * boundedTravel,
          y: this.#boss.position.y + direction.vector.y * boundedTravel,
        },
      };
    }

    const attackResult = updateBossTwoAttacks({
      boss: this.#boss,
      activeHazards: this.#activeHazards,
      deltaMs,
      playerPosition,
      createId: this.#createId,
    });
    this.#boss = attackResult.boss;
    this.#activeHazards = [...attackResult.activeHazards];

    const contacts = [...attackResult.contacts];
    if (this.#distance(this.#boss.position, playerPosition) <= BODY_CONTACT_RADIUS + PLAYER_RADIUS) {
      contacts.push({ sourceId: "boss2-body", damage: BOSS_TWO_BALANCE.contactDamage });
    }

    const summons = Array.from({ length: attackResult.summonCount }, (_, index) => {
      const angle = (index * Math.PI * 2) / attackResult.summonCount;
      return {
        position: {
          x: this.#boss.position.x + Math.cos(angle) * (BODY_CONTACT_RADIUS + 40),
          y: this.#boss.position.y + Math.sin(angle) * (BODY_CONTACT_RADIUS + 40),
        },
      };
    });
    return { boss: this.boss, activeHazards: this.activeHazards, contacts, summons };
  }

  public damageTarget(targetId: string, damage: number): BossTwoDamageResult {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new RangeError("damage must be a nonnegative finite number");
    }

    const targetPart = PART_KEYS.find((part) => bossTwoTargetId(part) === targetId) ?? null;
    const activeParts = activeBossTwoParts(this.#boss);
    const blocked =
      targetPart !== null &&
      damage > 0 &&
      !this.#boss.parts[targetPart].destroyed &&
      !activeParts.includes(targetPart);
    if (
      targetPart === null ||
      damage === 0 ||
      this.#boss.stage === "defeated" ||
      this.#boss.parts[targetPart].destroyed ||
      !activeParts.includes(targetPart)
    ) {
      return this.#damageResult(0, blocked, targetPart);
    }

    const currentPart = this.#boss.parts[targetPart];
    const hp = Math.max(0, currentPart.hp - damage);
    const appliedDamage = currentPart.hp - hp;
    this.#boss = advanceBossTwoStage({
      ...this.#boss,
      parts: { ...this.#boss.parts, [targetPart]: { hp, destroyed: hp === 0 } },
    });
    if (targetPart === "maceArm" && hp === 0) {
      this.#activeHazards = this.#activeHazards.filter(({ kind }) => kind !== "boss2-mace");
    }
    if (this.#boss.parts.leftLeg.destroyed && this.#boss.parts.rightLeg.destroyed) {
      this.#activeHazards = this.#activeHazards.filter(({ kind }) => kind !== "boss2-shockwave");
    }
    return this.#damageResult(appliedDamage, false, targetPart);
  }

  #damageResult(appliedDamage: number, blocked: boolean, targetPart: BossTwoPartKey | null): BossTwoDamageResult {
    return {
      boss: this.boss,
      appliedDamage,
      blocked,
      targetPart,
      completed: this.#boss.stage === "defeated",
    };
  }

  #direction(from: Vector2, to: Vector2): { vector: Vector2; distance: number } {
    const offset = { x: to.x - from.x, y: to.y - from.y };
    const distance = Math.hypot(offset.x, offset.y);
    return {
      vector: distance === 0 ? { x: 0, y: 0 } : { x: offset.x / distance, y: offset.y / distance },
      distance,
    };
  }

  #distance(left: Vector2, right: Vector2): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }
}