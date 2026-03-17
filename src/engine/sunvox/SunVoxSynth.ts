/**
 * SunVoxSynth.ts — DevilboxSynth wrapper for SunVox WASM engine
 *
 * Supports two modes of use:
 * 1. Synth mode: load a .sunsynth patch, trigger notes per-instrument.
 * 2. Song mode: load a full .sunvox song, play/stop via triggerAttack/Release.
 *
 * All SunVoxSynth instances share the same physical audio output: engine.output.
 * The SunVoxEngine singleton mixes all active handles into its single GainNode,
 * so there is no per-instance output to manage. This avoids the routing break
 * that occurred when ToneEngine's routeNativeEngineOutput saw a different GainNode
 * for each instance and disconnected the previous synth from synthBus.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SunVoxEngine } from './SunVoxEngine';
import type { SunVoxControl, SunVoxPatternData, SunVoxSongMeta } from './SunVoxEngine';

export class SunVoxSynth implements DevilboxSynth {
  readonly name = 'SunVoxSynth';
  readonly output: GainNode;

  private engine: SunVoxEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _handle = -1;
  private _moduleId = -1;
  // Promise that resolves when setModule/setSong fully completes (handle created + synth loaded).
  // Exposed via ensureInitialized() so ensureWASMSynthsReady can await all instruments before play.
  private _loadReady: Promise<void> = Promise.resolve();
  private _songMeta: SunVoxSongMeta | null = null;

  // Cached control values from the last setControl call, keyed by ctlId string.
  private _controlValues: Map<string, number> = new Map();

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.engine = SunVoxEngine.getInstance();
    // All instances share the engine's single output GainNode. The worklet mixes
    // all active handles into it, so routing through a per-instance node is wrong.
    this.output = this.engine.output;
  }

  // ── Module / song loading ─────────────────────────────────────────────────

  /**
   * Load a .sunsynth patch (ArrayBuffer) into this synth.
   * Creates an engine handle on first call.
   */
  async setModule(data: ArrayBuffer): Promise<void> {
    const p = this._doSetModule(data);
    this._loadReady = p;
    return p;
  }

  private async _doSetModule(data: ArrayBuffer): Promise<void> {
    await this.engine.ready();

    if (this._handle < 0) {
      this._handle = await this.engine.createHandle(this.audioContext.sampleRate);
    }

    this._moduleId = await this.engine.loadSynth(this._handle, data);
  }

  /**
   * Load a full .sunvox song (ArrayBuffer) for pattern playback.
   * Creates an engine handle on first call.
   */
  async setSong(data: ArrayBuffer): Promise<void> {
    const p = this._doSetSong(data);
    this._loadReady = p;
    return p;
  }

  private async _doSetSong(data: ArrayBuffer): Promise<void> {
    await this.engine.ready();

    if (this._handle < 0) {
      this._handle = await this.engine.createHandle(this.audioContext.sampleRate);
    }

    this._songMeta = await this.engine.loadSong(this._handle, data);
  }

  /** Returns song metadata (bpm, speed, name) after setSong completes. */
  getSongMeta(): SunVoxSongMeta | null {
    return this._songMeta;
  }

  /** Read all patterns from the loaded song. */
  async getPatterns(): Promise<SunVoxPatternData[]> {
    if (this._handle < 0) return [];
    return this.engine.getPatterns(this._handle);
  }

  /** Read all module names from the loaded song/synth. */
  async getModules(): Promise<import('./SunVoxEngine').SunVoxModuleInfo[]> {
    if (this._handle < 0) return [];
    return this.engine.getModules(this._handle);
  }

  /** Called by ToneEngine.ensureWASMSynthsReady — resolves when handle + module are ready. */
  ensureInitialized(): Promise<void> {
    return this._loadReady;
  }

  // ── Parameter access ──────────────────────────────────────────────────────

  /** Get the parameter descriptions for the currently loaded module. */
  async getControls(): Promise<SunVoxControl[]> {
    if (this._handle < 0 || this._moduleId < 0) return [];
    return this.engine.getControls(this._handle, this._moduleId);
  }

  /** Save the current module as a .sunsynth ArrayBuffer. */
  async saveSynth(): Promise<ArrayBuffer> {
    if (this._handle < 0 || this._moduleId < 0) {
      throw new Error('[SunVoxSynth] No module loaded');
    }
    return this.engine.saveSynth(this._handle, this._moduleId);
  }

  /**
   * Extract a specific module by ID from the loaded song handle as a .sunsynth ArrayBuffer.
   * Useful for extracting individual modules from a loaded .sunvox song before disposing
   * the reader handle.
   */
  async extractModule(moduleId: number): Promise<ArrayBuffer> {
    if (this._handle < 0) {
      throw new Error('[SunVoxSynth] No handle');
    }
    return this.engine.saveSynth(this._handle, moduleId);
  }

  /** Save the current song as a .sunvox ArrayBuffer. */
  async saveSong(): Promise<ArrayBuffer> {
    if (this._handle < 0) {
      throw new Error('[SunVoxSynth] No song loaded');
    }
    return this.engine.saveSong(this._handle);
  }

  // ── DevilboxSynth interface ───────────────────────────────────────────────

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;
    if (this._handle < 0) return;

    // Song mode (no module loaded)
    if (this._moduleId < 0) {
      this.engine.play(this._handle);
      return;
    }

    // Synth mode — send a note-on to the module
    let midiNote: number;
    if (typeof note === 'string') {
      midiNote = noteToMidi(note);
    } else if (typeof note === 'number') {
      midiNote = note;
    } else {
      midiNote = 60; // default C4
    }

    // SunVox velocity range: 1-128 (0 = previous value)
    const vel = Math.max(1, Math.min(128, Math.round((velocity ?? 1) * 127) + 1));

    this.engine.sendMessage({
      type: 'noteOn',
      handle: this._handle,
      moduleId: this._moduleId,
      note: midiNote,
      vel,
    });
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;
    if (this._handle < 0) return;

    if (this._moduleId < 0) {
      // Song mode
      this.engine.stop(this._handle);
      return;
    }

    this.engine.sendMessage({
      type: 'noteOff',
      handle: this._handle,
      moduleId: this._moduleId,
    });
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  /**
   * Set a module control parameter.
   * @param param - The control ID as a string (e.g. "0", "1", "2")
   * @param value - The raw control value
   */
  set(param: string, value: number): void {
    if (this._disposed) return;
    if (this._handle < 0 || this._moduleId < 0) return;

    const ctlId = parseInt(param, 10);
    if (isNaN(ctlId)) return;

    this._controlValues.set(param, value);
    this.engine.sendMessage({
      type: 'setControl',
      handle: this._handle,
      moduleId: this._moduleId,
      ctlId,
      value,
    });
  }

  /**
   * Get the last-set value for a control parameter.
   * Returns undefined if the parameter has never been set.
   */
  get(param: string): number | undefined {
    return this._controlValues.get(param);
  }

  /** Expose the underlying engine for advanced use. */
  getEngine(): SunVoxEngine {
    return this.engine;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._handle >= 0) {
      this.engine.destroyHandle(this._handle);
      this._handle = -1;
      this._moduleId = -1;
    }
  }
}
