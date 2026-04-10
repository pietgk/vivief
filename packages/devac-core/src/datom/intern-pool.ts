/**
 * InternPool — Bidirectional string-to-integer mapping.
 *
 * Strings are interned once and referenced by a monotonic integer ID.
 * Lookups in both directions are O(1).
 *
 * WHY: V8 Maps keyed by number use SMI (Small Integer) optimization,
 * which avoids hash table overhead for integers < 2^31. A Map<number, X>
 * uses ~40 bytes less per entry than Map<string, X> for typical attribute
 * strings. With ~50 unique attributes appearing across 50K entities, the
 * savings are not in the pool itself but in every index that uses interned
 * IDs as keys instead of strings.
 */
export class InternPool {
  private stringToId = new Map<string, number>();
  private idToString: string[] = [];
  private nextId = 0;

  /** Intern a string, returning its stable integer ID. Idempotent. */
  intern(s: string): number {
    const existing = this.stringToId.get(s);
    if (existing !== undefined) return existing;

    const id = this.nextId++;
    this.stringToId.set(s, id);
    this.idToString.push(s);
    return id;
  }

  /** Resolve an integer ID back to its original string. */
  resolve(id: number): string {
    const s = this.idToString[id];
    if (s === undefined) {
      throw new Error(`InternPool: unknown ID ${id}`);
    }
    return s;
  }

  /** Check if a string has been interned. */
  has(s: string): boolean {
    return this.stringToId.has(s);
  }

  /** Number of unique strings in the pool. */
  get size(): number {
    return this.nextId;
  }

  /**
   * Estimated memory usage of the pool itself in bytes.
   *
   * Breakdown:
   * - stringToId Map: ~100 base + ~80 per entry (key pointer + hash + value)
   * - idToString array: ~30 base + ~8 per slot (pointer)
   * - String storage: each string = ~40 header + length*2 (UTF-16)
   */
  estimateMemoryBytes(): number {
    const mapBase = 100;
    const mapPerEntry = 80;
    const arrayBase = 30;
    const arrayPerSlot = 8;
    const stringHeaderBytes = 40;

    let stringBytes = 0;
    for (const s of this.idToString) {
      stringBytes += stringHeaderBytes + s.length * 2;
    }

    return (
      mapBase + mapPerEntry * this.nextId + arrayBase + arrayPerSlot * this.nextId + stringBytes
    );
  }
}
