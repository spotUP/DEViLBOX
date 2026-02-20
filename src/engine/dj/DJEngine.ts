/**
 * DJEngine - Top-level orchestrator for DJ mode
 *
 * Creates 2 DeckEngines + DJMixerEngine and wires them together.
 * This is the main entry point for all DJ audio operations.
 */

import { DeckEngine, type DeckId } from './DeckEngine';
import { DJMixerEngine, type CrossfaderCurve } from './DJMixerEngine';
import type { TrackerSong } from '@/engine/TrackerReplayer';

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
    const deck = this.getDeck(id);
    await deck.loadSong(song);
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
