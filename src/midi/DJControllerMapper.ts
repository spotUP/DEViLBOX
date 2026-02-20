/**
 * DJControllerMapper - Routes MIDI from DJ controllers to the DJ engine
 *
 * Handles:
 * - CC messages → DJ parameters (crossfader, EQ, filter, pitch, volume)
 * - Note messages → DJ actions (play, cue, sync, hot cues)
 * - Jog wheel → scratch control (touch = start scratch, spin = velocity)
 *
 * Registers as a MIDI message handler alongside the existing useMIDIStore handler.
 * Only active when a DJ controller preset is selected AND the DJ view is active.
 */

import { getMIDIManager } from './MIDIManager';
import { isDJContext } from './MIDIContextRouter';
import { routeDJParameter } from './performance/parameterRouter';
import { getDJEngine } from '../engine/dj/DJEngine';
import { useDJStore } from '../stores/useDJStore';
import { DJBeatSync } from '../engine/dj/DJBeatSync';
import type { DJControllerPreset, DJControllerCCMapping, DJControllerNoteMapping } from './djControllerPresets';
import type { MIDIMessage } from './types';
class DJControllerMapper {
  private static instance: DJControllerMapper | null = null;

  private activePreset: DJControllerPreset | null = null;
  private handlerRegistered = false;

  // Lookup tables built from preset (for fast message routing)
  private ccLookup = new Map<string, DJControllerCCMapping>();
  private noteLookup = new Map<string, DJControllerNoteMapping>();
  private jogCCs = new Set<string>();       // "channel:cc" keys for jog wheel CCs
  private jogTouchNotes = new Map<string, 'A' | 'B'>(); // "channel:note" → deck

  private constructor() {}

  static getInstance(): DJControllerMapper {
    if (!DJControllerMapper.instance) {
      DJControllerMapper.instance = new DJControllerMapper();
    }
    return DJControllerMapper.instance;
  }

  /**
   * Activate a controller preset. Builds lookup tables and registers the MIDI handler.
   */
  setPreset(preset: DJControllerPreset | null): void {
    this.activePreset = preset;
    this.ccLookup.clear();
    this.noteLookup.clear();
    this.jogCCs.clear();
    this.jogTouchNotes.clear();

    if (preset) {
      // Build CC lookup: "channel:cc" → mapping
      for (const m of preset.ccMappings) {
        this.ccLookup.set(`${m.channel}:${m.cc}`, m);
      }

      // Build note lookup: "channel:note" → mapping
      for (const m of preset.noteMappings) {
        this.noteLookup.set(`${m.channel}:${m.note}`, m);
      }

      // Build jog wheel lookup
      if (preset.jogMapping) {
        const { deckA, deckB } = preset.jogMapping;
        this.jogCCs.add(`${deckA.channel}:${deckA.cc}`);
        this.jogCCs.add(`${deckB.channel}:${deckB.cc}`);
        if (deckA.touchNote !== undefined) {
          this.jogTouchNotes.set(`${deckA.channel}:${deckA.touchNote}`, 'A');
        }
        if (deckB.touchNote !== undefined) {
          this.jogTouchNotes.set(`${deckB.channel}:${deckB.touchNote}`, 'B');
        }
      }

      this.ensureHandlerRegistered();
    }
  }

  getPreset(): DJControllerPreset | null {
    return this.activePreset;
  }

  /**
   * Register our MIDI message handler with MIDIManager.
   * Called once — persists across preset changes.
   */
  private ensureHandlerRegistered(): void {
    if (this.handlerRegistered) return;
    this.handlerRegistered = true;

    const manager = getMIDIManager();
    manager.addMessageHandler((msg) => {
      if (!this.activePreset || !isDJContext()) return;
      this.handleMessage(msg);
    });
  }

  /**
   * Process a MIDI message against the active preset.
   */
  private handleMessage(msg: MIDIMessage): void {
    if (msg.type === 'cc' && msg.cc !== undefined && msg.value !== undefined) {
      this.handleCC(msg.channel, msg.cc, msg.value);
    } else if (msg.type === 'noteOn' && msg.note !== undefined && msg.velocity !== undefined) {
      // Jog wheel touch
      const touchKey = `${msg.channel}:${msg.note}`;
      const touchDeck = this.jogTouchNotes.get(touchKey);
      if (touchDeck) {
        this.handleJogTouch(touchDeck, true);
        return;
      }

      // Action button (only trigger on velocity > 0)
      if (msg.velocity > 0) {
        this.handleNote(msg.channel, msg.note);
      }
    } else if (msg.type === 'noteOff' && msg.note !== undefined) {
      // Jog wheel release
      const touchKey = `${msg.channel}:${msg.note}`;
      const touchDeck = this.jogTouchNotes.get(touchKey);
      if (touchDeck) {
        this.handleJogTouch(touchDeck, false);
      }
    }
  }

  /**
   * Handle a CC message — route to DJ parameter or jog wheel.
   */
  private handleCC(channel: number, cc: number, value: number): void {
    const key = `${channel}:${cc}`;

    // Check jog wheel
    if (this.jogCCs.has(key) && this.activePreset?.jogMapping) {
      const isA = this.activePreset.jogMapping.deckA.channel === channel
        && this.activePreset.jogMapping.deckA.cc === cc;
      this.handleJogSpin(isA ? 'A' : 'B', value);
      return;
    }

    // Check parameter mapping
    const mapping = this.ccLookup.get(key);
    if (!mapping) return;

    let normalized = value / 127;
    if (mapping.invert) normalized = 1 - normalized;

    routeDJParameter(mapping.param, normalized);

    // Also update the store for UI feedback
    this.syncParamToStore(mapping.param, normalized);
  }

  /**
   * Handle a note-on message — trigger a DJ action.
   */
  private handleNote(channel: number, note: number): void {
    const key = `${channel}:${note}`;
    const mapping = this.noteLookup.get(key);
    if (!mapping) return;

    this.executeDJAction(mapping.action);
  }

  /**
   * Execute a named DJ action (play, cue, sync, hot cue, etc.)
   */
  private executeDJAction(action: string): void {
    try {
      const engine = getDJEngine();
      const store = useDJStore.getState();

      switch (action) {
        case 'play_a': {
          if (engine.deckA.isPlaying()) {
            engine.deckA.pause();
            store.setDeckPlaying('A', false);
          } else {
            engine.deckA.play();
            store.setDeckPlaying('A', true);
          }
          break;
        }
        case 'play_b': {
          if (engine.deckB.isPlaying()) {
            engine.deckB.pause();
            store.setDeckPlaying('B', false);
          } else {
            engine.deckB.play();
            store.setDeckPlaying('B', true);
          }
          break;
        }
        case 'cue_a': {
          const cuePoint = store.decks.A.cuePoint;
          engine.deckA.cue(cuePoint);
          break;
        }
        case 'cue_b': {
          const cuePoint = store.decks.B.cuePoint;
          engine.deckB.cue(cuePoint);
          break;
        }
        case 'sync_a': {
          try {
            const semitones = DJBeatSync.syncBPM(engine.deckB, engine.deckA);
            store.setDeckPitch('A', semitones);
          } catch { /* other deck may not be loaded */ }
          break;
        }
        case 'sync_b': {
          try {
            const semitones = DJBeatSync.syncBPM(engine.deckA, engine.deckB);
            store.setDeckPitch('B', semitones);
          } catch { /* other deck may not be loaded */ }
          break;
        }
        default: {
          // Hot cue actions: hotcue{N}_{a|b}
          const hotcueMatch = action.match(/^hotcue(\d)_([ab])$/);
          if (hotcueMatch) {
            const cueIndex = parseInt(hotcueMatch[1]) - 1;
            const deckId = hotcueMatch[2].toUpperCase() as 'A' | 'B';
            const cuePoints = store.decks[deckId].seratoCuePoints;
            const cue = cuePoints.find(c => c.index === cueIndex);
            if (cue) {
              const deck = engine.getDeck(deckId);
              if (deck.playbackMode === 'audio') {
                deck.audioPlayer.seek(cue.position / 1000);
                store.setDeckState(deckId, {
                  audioPosition: cue.position / 1000,
                  elapsedMs: cue.position,
                });
              }
            }
          }
        }
      }
    } catch {
      // DJ engine not initialized
    }
  }

  /**
   * Handle jog wheel touch on/off — starts/stops scratch mode.
   */
  private handleJogTouch(deckId: 'A' | 'B', touching: boolean): void {
    try {
      const deck = getDJEngine().getDeck(deckId);
      if (touching) {
        deck.startScratch();
        useDJStore.getState().setDeckScratchActive(deckId, true);
      } else {
        deck.stopScratch();
        useDJStore.getState().setDeckScratchActive(deckId, false);
      }
    } catch {
      // Engine not ready
    }
  }

  /**
   * Handle jog wheel spin CC — converts relative CC to scratch velocity.
   *
   * Most DJ controllers send relative values:
   *   0-63 = clockwise (forward), 65-127 = counter-clockwise (backward)
   *   64 = no movement (some controllers), value distance from 64 = speed
   */
  private handleJogSpin(deckId: 'A' | 'B', value: number): void {
    try {
      const deck = getDJEngine().getDeck(deckId);

      // Convert relative CC to velocity: 0-63 = forward, 65-127 = backward
      let velocity: number;
      if (value <= 63) {
        velocity = value / 63;         // 0 to 1 (forward, slow to fast)
      } else {
        velocity = -(128 - value) / 63; // -1 to 0 (backward, fast to slow)
      }

      // Scale up for more dramatic effect
      velocity *= 2;

      deck.setScratchVelocity(velocity);
    } catch {
      // Engine not ready
    }
  }

  /**
   * Sync DJ parameter changes back to the Zustand store for UI feedback.
   */
  private syncParamToStore(param: string, normalized: number): void {
    const store = useDJStore.getState();

    switch (param) {
      case 'dj.crossfader':
        store.setCrossfader(normalized);
        break;
      case 'dj.deckA.volume':
        store.setDeckVolume('A', normalized * 1.5);
        break;
      case 'dj.deckB.volume':
        store.setDeckVolume('B', normalized * 1.5);
        break;
      case 'dj.masterVolume':
        store.setMasterVolume(normalized * 1.5);
        break;
      case 'dj.deckA.pitch':
        store.setDeckPitch('A', -6 + normalized * 12);
        break;
      case 'dj.deckB.pitch':
        store.setDeckPitch('B', -6 + normalized * 12);
        break;
      case 'dj.deckA.eqHi':
        store.setDeckEQ('A', 'high', -24 + normalized * 30);
        break;
      case 'dj.deckA.eqMid':
        store.setDeckEQ('A', 'mid', -24 + normalized * 30);
        break;
      case 'dj.deckA.eqLow':
        store.setDeckEQ('A', 'low', -24 + normalized * 30);
        break;
      case 'dj.deckB.eqHi':
        store.setDeckEQ('B', 'high', -24 + normalized * 30);
        break;
      case 'dj.deckB.eqMid':
        store.setDeckEQ('B', 'mid', -24 + normalized * 30);
        break;
      case 'dj.deckB.eqLow':
        store.setDeckEQ('B', 'low', -24 + normalized * 30);
        break;
      case 'dj.deckA.filter':
        store.setDeckFilter('A', -1 + normalized * 2);
        break;
      case 'dj.deckB.filter':
        store.setDeckFilter('B', -1 + normalized * 2);
        break;
    }
  }
}

export function getDJControllerMapper(): DJControllerMapper {
  return DJControllerMapper.getInstance();
}
