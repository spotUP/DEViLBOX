/**
 * SuperColliderSynth.ts - DevilboxSynth wrapper for SuperColliderEngine
 *
 * Bridges DEViLBOX's note API to the SuperColliderEngine singleton.
 * Lazy-initializes the engine on construction, manages per-note nodeIds,
 * and converts MIDI note numbers / note names to Hz for scsynth.
 */

import type { DevilboxSynth } from '../../types/synth';
import type { SuperColliderConfig } from '../../types/instrument';
import { SuperColliderEngine } from './SuperColliderEngine';

// ---------------------------------------------------------------------------
// Note conversion helpers
// ---------------------------------------------------------------------------

/** Map note letter → semitone offset within octave (C=0) */
const NOTE_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Parse a note name like "C4", "F#3", "Bb2" → MIDI number */
function noteNameToMidi(name: string): number {
  const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) return 69; // fallback A4
  const semitone = NOTE_SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + semitone;
}

/** Convert a MIDI note number or note name string to Hz */
function midiToHz(note: number | string): number {
  const midi = typeof note === 'string' ? noteNameToMidi(note) : note;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// SuperColliderSynth
// ---------------------------------------------------------------------------

export class SuperColliderSynth implements DevilboxSynth {
  readonly name = 'SuperCollider';

  /** Web Audio output node — initially a placeholder GainNode, then wired to the engine output */
  readonly output: AudioNode;

  private _config: SuperColliderConfig;
  private _audioContext: AudioContext;
  private _engine: SuperColliderEngine | null = null;
  private _enginePromise: Promise<SuperColliderEngine> | null = null;
  private _currentNodeId: number | null = null;
  private _nextNodeId = 1000; // scsynth node IDs; start well above reserved range
  private _disposed = false;
  private _gainNode: GainNode; // Placeholder output while engine loads

  constructor(config: SuperColliderConfig, audioContext: AudioContext) {
    this._config = config;
    this._audioContext = audioContext;
    this._gainNode = audioContext.createGain();
    // Expose the gain node as output immediately so callers can connect to the
    // effect chain before the engine finishes booting.
    (this as { output: AudioNode }).output = this._gainNode;
    this._initEngine();
  }

  // ---------------------------------------------------------------------------
  // Private: engine init
  // ---------------------------------------------------------------------------

  private _initEngine(): void {
    this._enginePromise = SuperColliderEngine.getInstance(this._audioContext)
      .then(engine => {
        if (this._disposed) return engine;
        this._engine = engine;
        // Wire engine output → our gain node so the signal reaches the effect chain.
        engine.output.connect(this._gainNode);
        // Load the SynthDef binary if one is configured.
        if (this._config.binary) {
          this._loadBinary(engine, this._config.binary);
        }
        return engine;
      })
      .catch(err => {
        console.error('[SuperColliderSynth] Engine init failed:', err);
        throw err;
      });
  }

  private _loadBinary(engine: SuperColliderEngine, base64: string): void {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    engine.loadSynthDef(bytes);
  }

  // ---------------------------------------------------------------------------
  // DevilboxSynth: note API
  // ---------------------------------------------------------------------------

  triggerAttack(note: string | number, time?: number, velocity?: number): void {
    if (this._disposed || !this._config.binary || !this._config.synthDefName) return;

    // time parameter is not used — scsynth scheduling is handled internally
    void time;

    const nodeId = this._nextNodeId++;
    this._currentNodeId = nodeId;

    const freq = midiToHz(note);
    const amp = velocity ?? 1;

    const params: Record<string, number> = {
      freq,
      amp,
      gate: 1,
      ...Object.fromEntries(this._config.params.map(p => [p.name, p.value])),
    };

    const defName = this._config.synthDefName;

    if (this._engine) {
      this._engine.noteOn(nodeId, defName, params);
    } else {
      this._enginePromise?.then(engine => {
        if (!this._disposed) engine.noteOn(nodeId, defName, params);
      });
    }
  }

  triggerRelease(note?: string | number, time?: number): void {
    // note and time parameters are unused — we track the active node by ID
    void note;
    void time;

    if (this._currentNodeId == null || this._disposed) return;

    const nodeId = this._currentNodeId;
    this._currentNodeId = null;

    if (this._engine) {
      this._engine.noteOff(nodeId);
    } else {
      this._enginePromise?.then(engine => {
        if (!this._disposed) engine.noteOff(nodeId);
      });
    }
  }

  set(param: string, value: number): void {
    // Update the stored config param so future notes use the new value.
    const p = this._config.params.find(p => p.name === param);
    if (p) p.value = value;

    // Update the currently playing node live, if any.
    if (this._currentNodeId == null || this._disposed) return;
    const nodeId = this._currentNodeId;

    if (this._engine) {
      this._engine.setNodeParams(nodeId, { [param]: value });
    } else {
      this._enginePromise?.then(engine => {
        if (!this._disposed && this._currentNodeId === nodeId) {
          engine.setNodeParams(nodeId, { [param]: value });
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Config update (called by the store when config changes)
  // ---------------------------------------------------------------------------

  updateConfig(config: SuperColliderConfig): void {
    const binaryChanged = config.binary !== this._config.binary;
    this._config = config;
    if (binaryChanged && config.binary && this._engine) {
      this._loadBinary(this._engine, config.binary);
    }
  }

  // ---------------------------------------------------------------------------
  // DevilboxSynth: cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._currentNodeId != null) {
      this._engine?.noteOff(this._currentNodeId);
      this._currentNodeId = null;
    }

    this._gainNode.disconnect();
    // The engine is a shared singleton — do NOT dispose it here.
  }
}
