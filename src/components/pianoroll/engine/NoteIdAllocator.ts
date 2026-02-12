/**
 * NoteIdAllocator - Stable note IDs for piano roll
 *
 * Current IDs are "ch-row" which break on move. This allocator provides
 * monotonic stable IDs with a position→ID cache.
 *
 * On move: cache entry is transferred to new position.
 * On pattern switch: cache clears.
 */

export class NoteIdAllocator {
  private counter = 0;
  private positionToId = new Map<string, string>();
  private idToPosition = new Map<string, string>();
  private currentPatternIndex = -1;

  /**
   * Get or create a stable ID for a note at the given position.
   */
  getId(channelIndex: number, startRow: number, patternIndex: number): string {
    // Clear cache on pattern switch
    if (patternIndex !== this.currentPatternIndex) {
      this.clear();
      this.currentPatternIndex = patternIndex;
    }

    const posKey = `${channelIndex}-${startRow}`;
    let id = this.positionToId.get(posKey);
    if (!id) {
      id = `n${++this.counter}`;
      this.positionToId.set(posKey, id);
      this.idToPosition.set(id, posKey);
    }
    return id;
  }

  /**
   * Transfer an ID from one position to another (used on note move).
   */
  moveId(id: string, newChannel: number, newRow: number): void {
    const oldPos = this.idToPosition.get(id);
    if (oldPos) {
      this.positionToId.delete(oldPos);
    }
    const newPos = `${newChannel}-${newRow}`;
    this.positionToId.set(newPos, id);
    this.idToPosition.set(id, newPos);
  }

  /**
   * Remove an ID (used on note delete).
   */
  removeId(id: string): void {
    const pos = this.idToPosition.get(id);
    if (pos) {
      this.positionToId.delete(pos);
    }
    this.idToPosition.delete(id);
  }

  /**
   * Look up the position key for an ID.
   * Returns "channelIndex-startRow" or null.
   */
  getPosition(id: string): { channelIndex: number; startRow: number } | null {
    const pos = this.idToPosition.get(id);
    if (!pos) return null;
    const [ch, row] = pos.split('-').map(Number);
    return { channelIndex: ch, startRow: row };
  }

  /**
   * Clear the cache (on pattern switch).
   */
  clear(): void {
    this.positionToId.clear();
    this.idToPosition.clear();
    // Don't reset counter - IDs should be globally unique within session
  }

  /**
   * Get current cache size (for debugging).
   */
  get size(): number {
    return this.positionToId.size;
  }
}
