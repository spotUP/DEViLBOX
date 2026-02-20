/**
 * DJEngine - Top-level orchestrator for DJ mode
 *
 * Creates 2 DeckEngines + DJMixerEngine and wires them together.
 * This is the main entry point for all DJ audio operations.
 */

import { DeckEngine, type DeckId } from './DeckEngine';
import { DJMixerEngine, type CrossfaderCurve } from './DJMixerEngine';
import type { TrackerSong } from '@/engine/TrackerReplayer';

// Instrument ID offsets to avoid collisions with the tracker view (IDs 1-999)
// and between decks. Each deck gets a 10000-wide namespace.
const DECK_ID_OFFSETS: Record<DeckId, number> = { A: 10000, B: 20000 };

export class DJEngine {
  readonly deckA: DeckEngine;
  readonly deckB: DeckEngine;
  readonly mixer: DJMixerEngine;

  private disposed = false;

  constructor() {
    // Create mixer first (provides the input nodes for decks)
    this.mixer = new DJMixerEngine();

    // Create decks connected to mixer inputs
    this.deckA = new DeckEngine({ id: 'A', outputNode: this.mixer.inputA });
    this.deckB = new DeckEngine({ id: 'B', outputNode: this.mixer.inputB });
  }

  // ==========================================================================
  // DECK ACCESS
  // ==========================================================================

  getDeck(id: DeckId): DeckEngine {
    return id === 'A' ? this.deckA : this.deckB;
  }

  // ==========================================================================
  // LOAD
  // ==========================================================================

  async loadToDeck(id: DeckId, song: TrackerSong): Promise<void> {
    // Remap instrument IDs to a deck-specific range so they don't collide
    // with the main tracker view or the other deck's instruments.
    const offset = DECK_ID_OFFSETS[id];
    this.remapInstrumentIds(song, offset);

    const deck = this.getDeck(id);
    await deck.loadSong(song);
  }

  /**
   * Shift all instrument IDs in a song by a fixed offset.
   * Mutates the song in-place (instruments array, pattern cells, channel instrumentId).
   */
  private remapInstrumentIds(song: TrackerSong, offset: number): void {
    // Build a map of original → remapped IDs
    const idMap = new Map<number, number>();
    for (const inst of song.instruments) {
      const newId = inst.id + offset;
      idMap.set(inst.id, newId);
      inst.id = newId;
    }

    // Remap pattern cell instrument references
    for (const pattern of song.patterns) {
      for (const channel of pattern.channels) {
        // Channel-level instrument assignment
        if (channel.instrumentId && idMap.has(channel.instrumentId)) {
          channel.instrumentId = idMap.get(channel.instrumentId)!;
        }
        // Per-cell instrument references
        for (const cell of channel.rows) {
          if (cell.instrument && idMap.has(cell.instrument)) {
            cell.instrument = idMap.get(cell.instrument)!;
          }
        }
      }
    }
  }

  // ==========================================================================
  // CROSSFADER SHORTCUTS
  // ==========================================================================

  setCrossfader(position: number): void {
    this.mixer.setCrossfader(position);
  }

  setCrossfaderCurve(curve: CrossfaderCurve): void {
    this.mixer.setCurve(curve);
  }

  // ==========================================================================
  // KILL ALL — Emergency stop
  // ==========================================================================

  killAll(): void {
    this.deckA.stop();
    this.deckB.stop();
    this.mixer.setCrossfader(0.5);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.deckA.dispose();
    this.deckB.dispose();
    this.mixer.dispose();
  }
}

// ============================================================================
// SINGLETON (separate from TrackerReplayer singleton)
// ============================================================================

let djEngineInstance: DJEngine | null = null;

export function getDJEngine(): DJEngine {
  if (!djEngineInstance) {
    djEngineInstance = new DJEngine();
  }
  return djEngineInstance;
}

export function disposeDJEngine(): void {
  if (djEngineInstance) {
    djEngineInstance.dispose();
    djEngineInstance = null;
  }
}
