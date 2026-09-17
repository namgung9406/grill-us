import { BOSS_THREE_BALANCE } from "../../domain/bosses";
import type {
  ActiveHazardSnapshot,
  BossOneSnapshot,
  BossTwoSnapshot,
  Vector2,
} from "../../domain/types";
import { BossOneSystem } from "./BossOneSystem";
import { BossTwoSystem } from "./BossTwoSystem";

export interface FinaleAddsSystemOptions {
  bossOne: BossOneSnapshot;
  bossTwo: BossTwoSnapshot;
  activeHazards?: readonly ActiveHazardSnapshot[];
  createId?: () => string;
}

export interface FinaleDamageTarget {
  id: string;
  boss: "boss1" | "boss2";
  position: Vector2;
  radius: number;
  active: boolean;
}

export interface FinaleAddsStepResult {
  bossOne: BossOneSnapshot;
  bossTwo: BossTwoSnapshot;
  activeHazards: readonly ActiveHazardSnapshot[];
  contacts: readonly { sourceId: string; damage: number }[];
}

export interface FinaleAddsDamageResult extends FinaleAddsStepResult {
  completed: boolean;
  completedNow: boolean;
  blocked: boolean;
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `60000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`;
}

export function resumeCountdownRemaining(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

export class FinaleAddsSystem {
  readonly #bossOneSystem: BossOneSystem;
  readonly #bossTwoSystem: BossTwoSystem;

  public constructor(options: FinaleAddsSystemOptions) {
    const createId = options.createId ?? createSequentialIdFactory();
    const bossOneHazards = (options.activeHazards ?? []).filter(({ kind }) => kind === "boss1-sweep");
    const bossTwoHazards = (options.activeHazards ?? []).filter(
      ({ kind }) => kind === "boss2-mace" || kind === "boss2-shockwave",
    );
    this.#bossOneSystem = new BossOneSystem({
      boss: options.bossOne,
      activeHazards: bossOneHazards,
      rescuedCitizenIds: [],
      createId,
    });
    this.#bossTwoSystem = new BossTwoSystem({ boss: options.bossTwo, activeHazards: bossTwoHazards, createId });
  }

  public get bossOne(): BossOneSnapshot {
    return this.#bossOneSystem.boss;
  }

  public get bossTwo(): BossTwoSnapshot {
    return this.#bossTwoSystem.boss;
  }

  public get completed(): boolean {
    return this.bossOne.hp === 0 && this.bossTwo.stage === "defeated";
  }

  public get activeHazards(): readonly ActiveHazardSnapshot[] {
    return [...this.#bossOneSystem.activeHazards, ...this.#bossTwoSystem.activeHazards];
  }

  public get damageTargets(): readonly FinaleDamageTarget[] {
    const bossOneTargets = this.bossOne.hp === 0
      ? []
      : this.#bossOneSystem.damageTargets.map((target) => ({ ...target, boss: "boss1" as const, active: true }));
    const bossTwoTargets = this.bossTwo.stage === "defeated"
      ? []
      : this.#bossTwoSystem.damageTargets.map((target) => ({ ...target, boss: "boss2" as const }));
    return [...bossOneTargets, ...bossTwoTargets];
  }

  public projectileTarget(position: Vector2, projectileRadius: number): FinaleDamageTarget | null {
    const bossOneTarget = this.damageTargets.find(
      (target) => target.boss === "boss1" && this.#distance(position, target.position) <= projectileRadius + target.radius,
    );
    if (bossOneTarget !== undefined) {
      return bossOneTarget;
    }
    const bossTwoTarget = this.#bossTwoSystem.projectileTarget(position, projectileRadius);
    return bossTwoTarget === null ? null : { ...bossTwoTarget, boss: "boss2" };
  }

  public step(deltaMs: number, playerPosition: Vector2): FinaleAddsStepResult {
    const contacts: { sourceId: string; damage: number }[] = [];
    if (this.bossOne.hp > 0) {
      const result = this.#bossOneSystem.step(deltaMs, playerPosition);
      contacts.push(...result.contacts.map((contact) => this.#weakenContact(contact)));
    }
    if (this.bossTwo.stage !== "defeated") {
      const result = this.#bossTwoSystem.step(deltaMs, playerPosition);
      contacts.push(...result.contacts.map((contact) => this.#weakenContact(contact)));
    }
    return this.#stepResult(contacts);
  }

  public damageTarget(targetId: string, damage: number): FinaleAddsDamageResult {
    const wasCompleted = this.completed;
    let blocked = false;
    if (this.#bossOneSystem.damageTargets.some(({ id }) => id === targetId)) {
      this.#bossOneSystem.damageTarget(targetId, damage);
    } else {
      const result = this.#bossTwoSystem.damageTarget(targetId, damage);
      blocked = result.blocked;
    }
    const result = this.#stepResult([]);
    return {
      ...result,
      completed: this.completed,
      completedNow: !wasCompleted && this.completed,
      blocked,
    };
  }

  #stepResult(contacts: readonly { sourceId: string; damage: number }[]): FinaleAddsStepResult {
    return {
      bossOne: this.bossOne,
      bossTwo: this.bossTwo,
      activeHazards: this.activeHazards,
      contacts,
    };
  }

  #weakenContact(contact: { sourceId: string; damage: number }): { sourceId: string; damage: number } {
    return { ...contact, damage: Math.round(contact.damage * BOSS_THREE_BALANCE.weakenedDamageMultiplier) };
  }

  #distance(left: Vector2, right: Vector2): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }
}