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

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function noteNameToMidi(name: string): number {
  const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) return 69;
  const semitone = NOTE_SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + semitone;
}

function midiToHz(note: number | string): number {
  const midi = typeof note === 'string' ? noteNameToMidi(note) : note;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let _nextGlobalNodeId = 1000;

// ---------------------------------------------------------------------------
// SuperColliderSynth
// ---------------------------------------------------------------------------

export class SuperColliderSynth implements DevilboxSynth {
  readonly name = 'SuperCollider';
  readonly output: AudioNode;

  private _config: SuperColliderConfig;
  private _audioContext: AudioContext;
  private _engine: SuperColliderEngine | null = null;
  private _enginePromise: Promise<SuperColliderEngine> | null = null;
  private _currentNodeId: number | null = null;
  private _disposed = false;
  private _gainNode: GainNode;

  constructor(config: SuperColliderConfig, audioContext: AudioContext) {
    this._config = config;
    this._audioContext = audioContext;
    this._gainNode = audioContext.createGain();
    this.output = this._gainNode;
    // Connect to destination temporarily so ScriptProcessor's onaudioprocess fires.
    // ToneEngine will later route this._gainNode → synthBus → destination.
    this._gainNode.connect(audioContext.destination);
    this._initEngine();
  }

  async ensureInitialized(): Promise<void> {
    if (this._enginePromise) await this._enginePromise;
  }

  private _initEngine(): void {
    console.log('[SC:Synth] _initEngine called, binary length:', this._config.binary?.length ?? 0, 'synthDefName:', this._config.synthDefName);

    // Decode the SynthDef binary to pass during engine init
    let synthDefBinary: Uint8Array | undefined;
    if (this._config.binary) {
      synthDefBinary = Uint8Array.from(atob(this._config.binary), c => c.charCodeAt(0));
    }

    this._enginePromise = SuperColliderEngine.getInstance(
      this._audioContext,
      synthDefBinary,
      this._config.synthDefName,
    )
      .then(engine => {
        if (this._disposed) return engine;
        this._engine = engine;
        engine.output.connect(this._gainNode);
        // Now that audio flows proc→engine.output→_gainNode→(synthBus)→destination,
        // disconnect ALL temporary direct-to-destination paths so audio is
        // gain-controlled and goes through the mixer chain only.
        try { engine.output.disconnect(this._audioContext.destination); } catch { /* ok */ }
        try { this._gainNode.disconnect(this._audioContext.destination); } catch { /* ok */ }
        console.log('[SC:Synth] engine.output → gainNode connected, temporary destination paths disconnected');
        return engine;
      })
      .catch(err => {
        console.error('[SuperColliderSynth] Engine init failed:', err);
        throw err;
      });
  }

  // ---------------------------------------------------------------------------
  // DevilboxSynth: note API
  // ---------------------------------------------------------------------------

  triggerAttack(note: string | number, time?: number, velocity?: number): void {
    if (this._disposed || !this._config.binary || !this._config.synthDefName) return;
    void time;

    if (this._currentNodeId != null) {
      this._engine?.noteOff(this._currentNodeId);
      this._currentNodeId = null;
    }

    const nodeId = _nextGlobalNodeId++;
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
      console.log('[SC:Synth] noteOn:', nodeId, defName, 'freq:', params.freq?.toFixed(1));
      this._engine.noteOn(nodeId, defName, params);
    } else {
      this._enginePromise?.then(engine => {
        if (!this._disposed) engine.noteOn(nodeId, defName, params);
      });
    }
  }

  triggerRelease(note?: string | number, time?: number): void {
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
    const p = this._config.params.find(p => p.name === param);
    if (p) p.value = value;

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

  updateConfig(config: SuperColliderConfig): void {
    this._config = config;
    // Note: binary changes require engine reboot (not supported in singleton pattern)
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._currentNodeId != null) {
      this._engine?.noteOff(this._currentNodeId);
      this._currentNodeId = null;
    }
    this._gainNode.disconnect();
  }
}
