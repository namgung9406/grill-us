import { GAME_BALANCE } from "./constants";

export type SimulationStep = (deltaMs: number) => void;

export class SimulationClock {
  #accumulatorMs = 0;

  public advance(frameDeltaMs: number, simulate: SimulationStep): number {
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs < 0) {
      throw new RangeError("frameDeltaMs must be a nonnegative finite number");
    }

    const { maxCatchUpSteps, stepMs } = GAME_BALANCE.simulation;
    this.#accumulatorMs += frameDeltaMs;
    const availableSteps = Math.floor(this.#accumulatorMs / stepMs);
    const executedSteps = Math.min(availableSteps, maxCatchUpSteps);

    for (let stepIndex = 0; stepIndex < executedSteps; stepIndex += 1) {
      simulate(stepMs);
    }

    this.#accumulatorMs = availableSteps > maxCatchUpSteps ? 0 : this.#accumulatorMs - executedSteps * stepMs;
    return executedSteps;
  }

  public reset(): void {
    this.#accumulatorMs = 0;
  }

  public remainderMs(): number {
    return this.#accumulatorMs;
  }
}