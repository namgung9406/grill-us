const UINT32_RANGE = 0x1_0000_0000;
const ZERO_SEED_REPLACEMENT = 0x6d2b_79f5;

export interface RandomSource {
  next(): number;
  integer(min: number, max: number): number;
  state(): number;
}

export class XorShift32 implements RandomSource {
  readonly #initialSeed: number;
  #state: number;

  public constructor(seedOrState: number) {
    if (!Number.isInteger(seedOrState) || seedOrState < 0 || seedOrState > 0xffff_ffff) {
      throw new RangeError("seedOrState must be an unsigned 32-bit integer");
    }

    const normalized = seedOrState >>> 0;
    this.#initialSeed = normalized === 0 ? ZERO_SEED_REPLACEMENT : normalized;
    this.#state = this.#initialSeed;
  }

  public next(): number {
    let nextState = this.#state;
    nextState ^= nextState << 13;
    nextState ^= nextState >>> 17;
    nextState ^= nextState << 5;
    this.#state = nextState >>> 0;
    return this.#state / UINT32_RANGE;
  }

  public integer(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError("integer bounds must be ordered safe integers");
    }

    return min + Math.floor(this.next() * (max - min + 1));
  }

  public state(): number {
    return this.#state;
  }
}