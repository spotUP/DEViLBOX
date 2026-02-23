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
import { getTrackerScratchController } from '../engine/TrackerScratchController';
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
  private jogTouchNotes = new Map<string, 'A' | 'B' | 'C'>(); // "channel:note" → deck

  // Active loop roll state for noteOff handling
  private activeLoopRolls = new Map<string, {
    deckId: 'A' | 'B' | 'C';
    prevLooping: boolean;
    prevSize: 1 | 2 | 4 | 8 | 16 | 32;
    timeoutId?: NodeJS.Timeout;
  }>();

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
      if (!this.activePreset) return;
      // Allow MIDI through for tracker scratch even when not in DJ context
      // Individual handlers check isDJContext() when needed
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

      // Loop roll release
      const loopRollKey = `${msg.channel}:${msg.note}`;
      const loopRollState = this.activeLoopRolls.get(loopRollKey);
      if (loopRollState) {
        this.releaseLoopRoll(loopRollKey, loopRollState);
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

    // Check if this is a loop roll action
    if (mapping.action.startsWith('loop_roll_')) {
      // Store the note key for noteOff handling
      this.executeDJAction(mapping.action, key);
    } else {
      this.executeDJAction(mapping.action);
    }
  }

  /**
   * Execute a named DJ action (play, cue, sync, hot cue, etc.)
   * @param noteKey - Optional MIDI note key for tracking loop rolls
   */
  private executeDJAction(action: string, noteKey?: string): void {
    // Tracker scratch actions work without DJ engine
    if (action.startsWith('tracker_')) {
      this.executeTrackerScratchAction(action);
      return;
    }

    // DJ engine-dependent actions require DJ context
    if (!isDJContext()) return;

    try {
      const engine = getDJEngine();
      const store = useDJStore.getState();

      switch (action) {
        // ── Transport ──────────────────────────────────────────────
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

        // ── Loop Controls ──────────────────────────────────────────
        case 'loop_a': {
          store.toggleLoop('A');
          break;
        }
        case 'loop_b': {
          store.toggleLoop('B');
          break;
        }

        // ── Loop Rolls (momentary loops) ───────────────────────────
        case 'loop_roll_4_a':
        case 'loop_roll_8_a':
        case 'loop_roll_16_a':
        case 'loop_roll_32_a': {
          const size = parseInt(action.match(/\d+/)?.[0] || '4') as 1 | 2 | 4 | 8 | 16 | 32;
          this.activateLoopRoll('A', size, noteKey);
          break;
        }
        case 'loop_roll_4_b':
        case 'loop_roll_8_b':
        case 'loop_roll_16_b':
        case 'loop_roll_32_b': {
          const size = parseInt(action.match(/\d+/)?.[0] || '4') as 1 | 2 | 4 | 8 | 16 | 32;
          this.activateLoopRoll('B', size, noteKey);
          break;
        }

        // ── Beat Jump ──────────────────────────────────────────────
        case 'beatjump_back_a': {
          this.beatJump('A', -4);  // Jump back 4 beats
          break;
        }
        case 'beatjump_fwd_a': {
          this.beatJump('A', 4);  // Jump forward 4 beats
          break;
        }
        case 'beatjump_back_b': {
          this.beatJump('B', -4);
          break;
        }
        case 'beatjump_fwd_b': {
          this.beatJump('B', 4);
          break;
        }

        // ── PFL (Headphone Cue) ────────────────────────────────────
        case 'pfl_a': {
          store.togglePFL('A');
          break;
        }
        case 'pfl_b': {
          store.togglePFL('B');
          break;
        }

        // ── Quantized FX ───────────────────────────────────────────
        case 'fx_echo_a':
        case 'fx_reverb_a':
        case 'fx_delay_a':
        case 'fx_flanger_a': {
          const fxType = action.replace('fx_', '').replace('_a', '');
          this.triggerQuantizedFX('A', fxType);
          break;
        }
        case 'fx_echo_b':
        case 'fx_reverb_b':
        case 'fx_delay_b':
        case 'fx_flanger_b': {
          const fxType = action.replace('fx_', '').replace('_b', '');
          this.triggerQuantizedFX('B', fxType);
          break;
        }

        default: {
          // Hot cue actions: hotcue{N}_{a|b}
          const hotcueMatch = action.match(/^hotcue(\d)_([ab])$/);
          if (hotcueMatch) {
            const cueIndex = parseInt(hotcueMatch[1]) - 1;
            const deckId = hotcueMatch[2].toUpperCase() as 'A' | 'B' | 'C';
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
   * Execute tracker scratch actions (fader cut, pattern toggles).
   * These work without DJ engine — they use TrackerScratchController directly.
   */
  private executeTrackerScratchAction(action: string): void {
    const ctrl = getTrackerScratchController();
    switch (action) {
      case 'tracker_fader_cut':
        ctrl.setFaderCut(true);
        // Auto-release after 50ms if no note-off (CC mode)
        setTimeout(() => ctrl.setFaderCut(false), 50);
        break;
      case 'tracker_fader_cut_on':
        ctrl.setFaderCut(true);
        break;
      case 'tracker_fader_cut_off':
        ctrl.setFaderCut(false);
        break;
      case 'tracker_scratch_trans':
        ctrl.toggleFaderPattern('Transformer');
        break;
      case 'tracker_scratch_crab':
        ctrl.toggleFaderPattern('Crab');
        break;
      case 'tracker_scratch_flare':
        ctrl.toggleFaderPattern('Flare');
        break;
      case 'tracker_scratch_chirp':
        ctrl.toggleFaderPattern('Chirp');
        break;
      case 'tracker_scratch_stab':
        ctrl.toggleFaderPattern('Stab');
        break;
      case 'tracker_scratch_8crab':
        ctrl.toggleFaderPattern('8-Finger Crab');
        break;
      case 'tracker_scratch_twdl':
        ctrl.toggleFaderPattern('Twiddle');
        break;
      case 'tracker_scratch_stop':
        ctrl.stopFaderPattern();
        break;
    }
  }

  /**
   * Handle jog wheel touch on/off — starts/stops scratch mode.
   * Routes to DJ engine in DJ context, or tracker turntable physics otherwise.
   */
  private handleJogTouch(deckId: 'A' | 'B' | 'C', touching: boolean): void {
    if (isDJContext()) {
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
    } else {
      // Tracker context: jog touch = hand on record (grab mode)
      getTrackerScratchController().onMidiJogTouch(touching);
    }
  }

  /**
   * Handle jog wheel spin CC — converts relative CC to scratch velocity.
   *
   * Most DJ controllers send relative values:
   *   0-63 = clockwise (forward), 65-127 = counter-clockwise (backward)
   *   64 = no movement (some controllers), value distance from 64 = speed
   */
  private handleJogSpin(deckId: 'A' | 'B' | 'C', value: number): void {
    // Get jog wheel sensitivity multiplier from store (0.5-2.0x)
    const store = useDJStore.getState();
    const sensitivity = store.jogWheelSensitivity || 1.0;

    // Convert relative CC to velocity: 0-63 = forward, 65-127 = backward
    let velocity: number;
    if (value <= 63) {
      velocity = value / 63;         // 0 to 1 (forward, slow to fast)
    } else {
      velocity = -(128 - value) / 63; // -1 to 0 (backward, fast to slow)
    }
    velocity *= 2 * sensitivity; // Scale up for dramatic effect + apply sensitivity

    // Route to DJ engine if in DJ context, otherwise to tracker scratch
    if (isDJContext()) {
      try {
        const deck = getDJEngine().getDeck(deckId);
        deck.setScratchVelocity(velocity);
      } catch { /* Engine not ready */ }
    } else {
      // Route jog to tracker turntable physics.
      // When jog touch is active, treat as direct velocity (grab);
      // when not touching (outer ring spin), treat as nudge impulse.
      const ctrl = getTrackerScratchController();
      const isTouching = ctrl.turntable.touching;
      ctrl.onMidiJogSpin(value, isTouching);
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

  /**
   * Activate a momentary loop roll (auto-releases when pad is released).
   * Loop roll is a performance technique where a small loop plays momentarily
   * then resumes normal playback.
   * @param noteKey - Optional MIDI note key for tracking state on noteOff
   */
  private activateLoopRoll(
    deckId: 'A' | 'B' | 'C',
    beats: 1 | 2 | 4 | 8 | 16 | 32,
    noteKey?: string
  ): void {
    const store = useDJStore.getState();
    // Store previous loop state
    const wasLooping = store.decks[deckId].loopActive;
    const prevSize = store.decks[deckId].lineLoopSize;
    
    // Activate loop with specified size
    store.setLineLoopSize(deckId, beats);
    if (!wasLooping) {
      store.toggleLoop(deckId);
    }
    
    // If noteKey provided, track for immediate noteOff release
    if (noteKey) {
      // Clear any existing timeout for this note
      const existing = this.activeLoopRolls.get(noteKey);
      if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId);
      }

      // Set fallback timeout (50ms)
      const timeoutId = setTimeout(() => {
        const state = this.activeLoopRolls.get(noteKey);
        if (state) {
          this.releaseLoopRoll(noteKey, state);
        }
      }, 50);

      this.activeLoopRolls.set(noteKey, {
        deckId,
        prevLooping: wasLooping,
        prevSize,
        timeoutId,
      });
    } else {
      // No note tracking (CC-based trigger): use timeout only
      setTimeout(() => {
        if (!wasLooping) {
          store.toggleLoop(deckId);
        }
        store.setLineLoopSize(deckId, prevSize);
      }, 50);
    }
  }

  /**
   * Release a loop roll immediately (called on MIDI noteOff).
   */
  private releaseLoopRoll(
    noteKey: string,
    state: {
      deckId: 'A' | 'B' | 'C';
      prevLooping: boolean;
      prevSize: 1 | 2 | 4 | 8 | 16 | 32;
      timeoutId?: NodeJS.Timeout;
    }
  ): void {
    // Clear fallback timeout
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }

    // Restore previous loop state
    const store = useDJStore.getState();
    if (!state.prevLooping) {
      store.toggleLoop(state.deckId);
    }
    store.setLineLoopSize(state.deckId, state.prevSize);

    // Remove from tracking
    this.activeLoopRolls.delete(noteKey);
  }

  /**
   * Jump forward/backward by beat grid.
   * Uses DJBeatJump engine to snap to nearest beat.
   */
  private beatJump(deckId: 'A' | 'B' | 'C', beats: number): void {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const store = useDJStore.getState();
      const deckState = store.decks[deckId];
      
      // Calculate new position based on BPM and beat count
      const beatsPerSecond = deckState.effectiveBPM / 60;
      const secondsToJump = beats / beatsPerSecond;
      const newPosition = deckState.audioPosition + secondsToJump;
      
      // Clamp to track duration
      const clampedPosition = Math.max(0, Math.min(newPosition, deckState.durationMs / 1000));
      
      if (deck.playbackMode === 'audio') {
        deck.audioPlayer.seek(clampedPosition);
        store.setDeckState(deckId, {
          audioPosition: clampedPosition,
          elapsedMs: clampedPosition * 1000,
        });
      }
    } catch {
      // Engine not ready
    }
  }

  /**
   * Trigger quantized FX (echo, reverb, delay, flanger).
   * FX are beat-synced to the current BPM.
   */
  private async triggerQuantizedFX(deckId: 'A' | 'B' | 'C', fxType: string): Promise<void> {
    try {
      switch (fxType) {
        case 'echo': {
          // Echo out over 4 beats
          const { echoOut } = await import('@/engine/dj/DJQuantizedFX');
          echoOut(deckId, 4);
          break;
        }
        case 'reverb': {
          // Filter sweep up (simulate reverb tail)
          const { filterSweep } = await import('@/engine/dj/DJQuantizedFX');
          filterSweep(deckId, 0.8, 4); // LPF sweep up over 4 beats
          break;
        }
        case 'delay': {
          // Filter sweep down then up (delay-like effect)
          const { filterSweep } = await import('@/engine/dj/DJQuantizedFX');
          filterSweep(deckId, -0.6, 2, () => {
            filterSweep(deckId, 0, 2); // HPF down, then reset
          });
          break;
        }
        case 'flanger': {
          // Quick filter wobble
          const { filterSweep } = await import('@/engine/dj/DJQuantizedFX');
          filterSweep(deckId, 0.5, 1, () => {
            filterSweep(deckId, -0.5, 1, () => {
              filterSweep(deckId, 0, 1); // Up, down, reset
            });
          });
          break;
        }
        default:
          console.log(`Unknown FX type: ${fxType}`);
      }
    } catch (err) {
      console.warn(`[DJControllerMapper] Failed to trigger quantized FX: ${fxType}`, err);
    }
  }
}

export function getDJControllerMapper(): DJControllerMapper {
  return DJControllerMapper.getInstance();
}
