/**
 * The playhead subscription a replayer engine exposes as `onPositionUpdate`.
 * NativeEngineRouting wires any engine instance that has that method to
 * reportEnginePosition(key, row, songPos), so the pattern editor follows the
 * worklet's own position: songPos is the index into the song's order list
 * (TrackerSong.songPositions) and row is the row inside that grid pattern.
 */
export interface EnginePositionUpdate {
  songPos: number;
  row: number;
}

export class PositionCallbacks {
  private readonly callbacks = new Set<(update: EnginePositionUpdate) => void>();

  /** Subscribe; returns the unsubscriber. */
  add(cb: (update: EnginePositionUpdate) => void): () => void {
    this.callbacks.add(cb);
    return () => { this.callbacks.delete(cb); };
  }

  /** Deliver a worklet 'position' message to every subscriber. */
  emit(data: { songPos?: number; row?: number }): void {
    if (typeof data.songPos !== 'number' || typeof data.row !== 'number') return;
    for (const cb of this.callbacks) cb({ songPos: data.songPos, row: data.row });
  }

  clear(): void { this.callbacks.clear(); }
}
