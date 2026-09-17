export class ObjectUrlRegistry {
  readonly #urls = new Set<string>();
  #released = false;

  public create(blob: Blob): string {
    if (this.#released) {
      throw new Error("해제된 object URL registry는 재사용할 수 없습니다.");
    }
    const objectUrl = URL.createObjectURL(blob);
    this.#urls.add(objectUrl);
    return objectUrl;
  }

  public revoke(objectUrl: string): void {
    if (this.#urls.delete(objectUrl)) {
      URL.revokeObjectURL(objectUrl);
    }
  }

  public release(): void {
    if (this.#released) {
      return;
    }
    this.#released = true;
    for (const objectUrl of this.#urls) {
      URL.revokeObjectURL(objectUrl);
    }
    this.#urls.clear();
  }
}