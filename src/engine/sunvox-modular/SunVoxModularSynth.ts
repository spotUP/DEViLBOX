/**
 * SunVoxModularSynth — DevilboxSynth bridging ModularPatchConfig to SunVox WASM.
 *
 * For song mode (.sunvox files): multiple instances share a single WASM handle.
 * Each instance targets a different generator module for note events.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { ModularPatchConfig } from '@/types/modular';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SunVoxEngine } from '@/engine/sunvox/SunVoxEngine';
import type { SunVoxModuleGraphEntry } from '@/engine/sunvox/SunVoxEngine';
import { SV_ID_TO_TYPE_STRING } from './SunVoxModuleDescriptors';

const GENERATOR_TYPES = new Set([
  'Analog generator', 'Generator', 'FM', 'Kicker', 'DrumSynth',
  'Sampler', 'SpectraVoice', 'Vorbis player', 'Input',
]);

/** Shared song-mode handle: all SunVoxModularSynth instances for the same song reuse this */
let _sharedSongHandle = -1;
let _sharedSongRefCount = 0;
let _sharedSongInitPromise: Promise<void> | null = null;
/** Epoch counter — incremented on each resetSharedSunVoxHandle. Old instances with stale
 *  epochs won't touch the new shared handle during async disposal. */
let _sharedEpoch = 0;

/**
 * Wait for any in-flight shared song load to finish before starting new work.
 * The worklet processes messages sequentially — if a loadSong is still running,
 * new createHandle calls queue behind it and can timeout during extraction.
 */
export async function awaitPendingSharedSongLoad(): Promise<void> {
  if (_sharedSongInitPromise) {
    try { await _sharedSongInitPromise; } catch { /* ignore errors */ }
  }
}

/** Force-reset shared state (call before loading a new song to prevent WASM crashes) */
export function resetSharedSunVoxHandle(): void {
  _sharedEpoch++; // Invalidate all existing instances
  if (_sharedSongHandle >= 0) {
    try {
      SunVoxEngine.getInstance().destroyHandle(_sharedSongHandle);
    } catch { /* already destroyed */ }
  }
  _sharedSongHandle = -1;
  _sharedSongRefCount = 0;
  _sharedSongInitPromise = null;
}

/**
 * Donate a pre-loaded handle to be used as the shared song handle.
 * Avoids the double create/destroy/create cycle which corrupts WASM state.
 * The handle must already have a song loaded via engine.loadSong().
 */
/** Get the shared song handle slot number (-1 if none) */
export function getSharedSunVoxHandle(): number {
  return _sharedSongHandle;
}

export function donatePreloadedHandle(handle: number): void {
  _sharedSongHandle = handle;
  _sharedSongRefCount = 1; // prevent _loadSongShared cleanup from destroying it
  _sharedSongInitPromise = Promise.resolve(); // already loaded
}

export class SunVoxModularSynth implements DevilboxSynth {
  readonly name = 'SunVoxModularSynth';
  readonly output: GainNode;

  private engine: SunVoxEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _handle = -1;
  private _initPromise: Promise<void>;
  private _epoch = 0; // epoch at creation — stale instances won't touch shared handle
  private _usesSharedHandle = false;

  private uiToSv = new Map<string, number>();
  private svToUi = new Map<number, string>();
  private _noteTargetSvId = -1;
  private _songData: ArrayBuffer | null = null;

  constructor(
    patchConfig: ModularPatchConfig,
    songData?: ArrayBuffer | null,
    noteTargetModuleId?: number,
  ) {
    this.audioContext = getDevilboxAudioContext();
    this.engine = SunVoxEngine.getInstance();
    this.output = this.engine.output;
    this._songData = songData ?? null;

    if (noteTargetModuleId !== undefined && noteTargetModuleId >= 0) {
      this._noteTargetSvId = noteTargetModuleId;
    }

    if (this._songData) {
      this._initPromise = this._loadSongShared(this._songData, patchConfig);
    } else {
      this._initPromise = this._buildGraph(patchConfig);
    }
  }

  /** Song mode: share a single WASM handle across all instances */
  private async _loadSongShared(data: ArrayBuffer, config: ModularPatchConfig): Promise<void> {
    await this.engine.ready();

    // If a previous shared handle exists from a different song, destroy it first
    if (_sharedSongHandle >= 0 && _sharedSongRefCount <= 0) {
      this.engine.destroyHandle(_sharedSongHandle);
      _sharedSongHandle = -1;
      _sharedSongInitPromise = null;
    }

    // First instance creates the shared handle; others wait for it.
    // If donatePreloadedHandle() was called, the handle is already set and
    // _sharedSongInitPromise is resolved — skip creation entirely.
    if (_sharedSongHandle < 0 && !_sharedSongInitPromise) {
      _sharedSongInitPromise = (async () => {
        _sharedSongHandle = await this.engine.createHandle(this.audioContext.sampleRate);
        await this.engine.loadSong(_sharedSongHandle, data);
      })();
    }
    await _sharedSongInitPromise;

    this._handle = _sharedSongHandle;
    this._usesSharedHandle = true;
    this._epoch = _sharedEpoch;
    _sharedSongRefCount++;

    // Build ID mappings from config modules
    for (const mod of config.modules) {
      const match = mod.id.match(/^sv_m(\d+)$/);
      if (match) {
        const svId = parseInt(match[1], 10);
        this.uiToSv.set(mod.id, svId);
        this.svToUi.set(svId, mod.id);
      }
    }

    // If no explicit target was set, find the first generator in this config
    if (this._noteTargetSvId < 0) {
      for (const mod of config.modules) {
        const match = mod.id.match(/^sv_m(\d+)$/);
        if (match) {
          const svId = parseInt(match[1], 10);
          if (svId > 0) {
            this._noteTargetSvId = svId;
            break;
          }
        }
      }
    }
  }

  private async _buildGraph(config: ModularPatchConfig): Promise<void> {
    await this.engine.ready();
    this._handle = await this.engine.createHandle(this.audioContext.sampleRate);

    for (const mod of config.modules) {
      const typeString = SV_ID_TO_TYPE_STRING.get(mod.descriptorId);
      if (!typeString) continue;

      if (typeString === 'Output') {
        this.uiToSv.set(mod.id, 0);
        this.svToUi.set(0, mod.id);
        continue;
      }

      const svModId = await this.engine.newModule(this._handle, typeString);
      if (svModId < 0) continue;

      this.uiToSv.set(mod.id, svModId);
      this.svToUi.set(svModId, mod.id);

      if (this._noteTargetSvId < 0 && this._isGenerator(typeString)) {
        this._noteTargetSvId = svModId;
      }
    }

    for (const conn of config.connections) {
      const srcSvId = this.uiToSv.get(conn.source.moduleId);
      const dstSvId = this.uiToSv.get(conn.target.moduleId);
      if (srcSvId !== undefined && dstSvId !== undefined) {
        await this.engine.connectModules(this._handle, srcSvId, dstSvId);
      }
    }
  }

  private _isGenerator(typeString: string): boolean {
    return GENERATOR_TYPES.has(typeString);
  }

  async ensureInitialized(): Promise<void> {
    await this._initPromise;
  }

  // ── Incremental updates ─────────────────────────────────────────────────

  async addModule(uiId: string, descriptorId: string): Promise<number> {
    await this._initPromise;
    const typeString = SV_ID_TO_TYPE_STRING.get(descriptorId);
    if (!typeString) throw new Error(`Unknown SunVox descriptor: ${descriptorId}`);

    if (typeString === 'Output') {
      this.uiToSv.set(uiId, 0);
      this.svToUi.set(0, uiId);
      return 0;
    }

    const svModId = await this.engine.newModule(this._handle, typeString);
    this.uiToSv.set(uiId, svModId);
    this.svToUi.set(svModId, uiId);

    if (this._noteTargetSvId < 0 && this._isGenerator(typeString)) {
      this._noteTargetSvId = svModId;
    }
    return svModId;
  }

  async removeModule(uiId: string): Promise<void> {
    await this._initPromise;
    const svModId = this.uiToSv.get(uiId);
    if (svModId === undefined || svModId === 0) return;
    await this.engine.removeModule(this._handle, svModId);
    this.uiToSv.delete(uiId);
    this.svToUi.delete(svModId);
    if (this._noteTargetSvId === svModId) this._noteTargetSvId = -1;
  }

  async addConnection(sourceUiId: string, targetUiId: string): Promise<void> {
    await this._initPromise;
    const srcSvId = this.uiToSv.get(sourceUiId);
    const dstSvId = this.uiToSv.get(targetUiId);
    if (srcSvId === undefined || dstSvId === undefined) return;
    await this.engine.connectModules(this._handle, srcSvId, dstSvId);
  }

  async removeConnection(sourceUiId: string, targetUiId: string): Promise<void> {
    await this._initPromise;
    const srcSvId = this.uiToSv.get(sourceUiId);
    const dstSvId = this.uiToSv.get(targetUiId);
    if (srcSvId === undefined || dstSvId === undefined) return;
    await this.engine.disconnectModules(this._handle, srcSvId, dstSvId);
  }

  async updatePatch(oldConfig: ModularPatchConfig, newConfig: ModularPatchConfig): Promise<void> {
    await this._initPromise;
    if (this._handle < 0) return;

    const oldModuleIds = new Set(oldConfig.modules.map(m => m.id));
    const newModuleIds = new Set(newConfig.modules.map(m => m.id));

    for (const mod of oldConfig.modules) {
      if (!newModuleIds.has(mod.id)) await this.removeModule(mod.id);
    }
    for (const mod of newConfig.modules) {
      if (!oldModuleIds.has(mod.id) && !this.uiToSv.has(mod.id)) {
        await this.addModule(mod.id, mod.descriptorId);
      }
    }

    const connKey = (c: { source: { moduleId: string }; target: { moduleId: string } }) =>
      `${c.source.moduleId}→${c.target.moduleId}`;
    const oldConnSet = new Set(oldConfig.connections.map(connKey));
    const newConnSet = new Set(newConfig.connections.map(connKey));

    for (const conn of oldConfig.connections) {
      if (!newConnSet.has(connKey(conn))) await this.removeConnection(conn.source.moduleId, conn.target.moduleId);
    }
    for (const conn of newConfig.connections) {
      if (!oldConnSet.has(connKey(conn))) await this.addConnection(conn.source.moduleId, conn.target.moduleId);
    }
  }

  // ── Query ───────────────────────────────────────────────────────────────

  async getModuleGraph(): Promise<SunVoxModuleGraphEntry[]> {
    await this._initPromise;
    if (this._handle < 0) return [];
    return this.engine.getModuleGraph(this._handle);
  }

  getSvModuleId(uiId: string): number | undefined {
    return this.uiToSv.get(uiId);
  }

  // ── Save/Load ───────────────────────────────────────────────────────────

  async save(): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._handle < 0) throw new Error('[SunVoxModularSynth] No slot');
    return this.engine.saveSong(this._handle);
  }

  // ── Sequencer control (used by NativeEngineRouting for song-mode playback) ──

  async startSequencer(fromBeginning = false): Promise<void> {
    await this._initPromise;
    if (this._disposed || this._handle < 0) {
      console.warn('[SunVoxModularSynth] startSequencer: disposed or no handle', this._disposed, this._handle);
      return;
    }
    console.log('[SunVoxModularSynth] startSequencer: playing handle', this._handle, 'fromBeginning:', fromBeginning);
    this.engine.play(this._handle, fromBeginning);
  }

  stopSequencer(): void {
    if (this._handle >= 0) this.engine.stop(this._handle);
  }

  // ── DevilboxSynth interface ─────────────────────────────────────────────

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed || this._handle < 0 || this._noteTargetSvId < 0) return;

    let midiNote: number;
    if (typeof note === 'string') midiNote = noteToMidi(note);
    else if (typeof note === 'number') midiNote = note;
    else midiNote = 60;

    const vel = Math.max(1, Math.min(128, Math.round((velocity ?? 1) * 127) + 1));
    this.engine.noteOn(this._handle, this._noteTargetSvId, midiNote, vel);
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed || this._handle < 0 || this._noteTargetSvId < 0) return;
    this.engine.noteOff(this._handle, this._noteTargetSvId);
  }

  set(param: string, value: number): void {
    if (this._disposed || this._handle < 0) return;
    const dotIdx = param.indexOf('.');
    if (dotIdx < 0) return;
    const uiModId = param.slice(0, dotIdx);
    const ctlId = parseInt(param.slice(dotIdx + 1), 10);
    if (isNaN(ctlId)) return;
    const svModId = this.uiToSv.get(uiModId);
    if (svModId === undefined) return;
    this.engine.setModuleControl(this._handle, svModId, ctlId, value);
  }

  get(_param: string): number | undefined {
    return undefined;
  }

  /** Sync a tracker cell edit to the SunVox WASM pattern data.
   *  Pass -1 for any field to leave it unchanged. */
  setPatternEvent(pat: number, track: number, line: number,
    nn: number, vv: number, mm: number, ccee: number, xxyy: number): void {
    if (this._disposed || this._handle < 0) return;
    this.engine.setPatternEvent(this._handle, pat, track, line, nn, vv, mm, ccee, xxyy);
  }

  /** Get the WASM handle (for direct engine calls) */
  getHandle(): number { return this._handle; }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._usesSharedHandle) {
      // Only touch the shared handle if this instance belongs to the CURRENT epoch.
      // Old instances from a previous song (stale epoch) must not destroy the new handle.
      if (this._epoch === _sharedEpoch) {
        _sharedSongRefCount--;
        if (_sharedSongRefCount <= 0 && _sharedSongHandle >= 0) {
          this.engine.destroyHandle(_sharedSongHandle);
          _sharedSongHandle = -1;
          _sharedSongRefCount = 0;
          _sharedSongInitPromise = null;
        }
      }
      // Stale epoch instances: do nothing — handle already managed by reset
    } else if (this._handle >= 0) {
      this.engine.destroyHandle(this._handle);
    }
    this._handle = -1;
    this.uiToSv.clear();
    this.svToUi.clear();
  }
}
