/**
 * SunVoxModularSynth — DevilboxSynth bridging ModularPatchConfig to SunVox WASM.
 *
 * Owns a SunVox slot and maintains a bidirectional mapping between UI module IDs
 * (strings from ModularPatchConfig) and SunVox module IDs (ints from WASM).
 *
 * UI is source of truth — changes sync to SunVox WASM via the engine.
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

export class SunVoxModularSynth implements DevilboxSynth {
  readonly name = 'SunVoxModularSynth';
  readonly output: GainNode;

  private engine: SunVoxEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _handle = -1;
  private _initPromise: Promise<void>;

  /** UI module ID (string) → SunVox module ID (int) */
  private uiToSv = new Map<string, number>();
  /** SunVox module ID (int) → UI module ID (string) */
  private svToUi = new Map<number, string>();

  /** The SunVox module ID to send note events to (first generator found) */
  private _noteTargetSvId = -1;

  /** Optional raw .sunvox file data — when set, load the song instead of building from config */
  private _songData: ArrayBuffer | null = null;

  constructor(patchConfig: ModularPatchConfig, songData?: ArrayBuffer | null) {
    this.audioContext = getDevilboxAudioContext();
    this.engine = SunVoxEngine.getInstance();
    this.output = this.engine.output;
    this._songData = songData ?? null;

    if (this._songData) {
      this._initPromise = this._loadSong(this._songData, patchConfig);
    } else {
      this._initPromise = this._buildGraph(patchConfig);
    }
  }

  /** Load a .sunvox file and build UI↔SunVox ID mappings from the existing graph */
  private async _loadSong(data: ArrayBuffer, config: ModularPatchConfig): Promise<void> {
    await this.engine.ready();
    this._handle = await this.engine.createHandle(this.audioContext.sampleRate);
    await this.engine.loadSong(this._handle, data);

    for (const mod of config.modules) {
      const match = mod.id.match(/^sv_m(\d+)$/);
      if (match) {
        const svId = parseInt(match[1], 10);
        this.uiToSv.set(mod.id, svId);
        this.svToUi.set(svId, mod.id);

        if (this._noteTargetSvId < 0 && svId > 0) {
          const graph = await this.engine.getModuleGraph(this._handle);
          const entry = graph.find(g => g.id === svId);
          if (entry && this._isGenerator(entry.typeName)) {
            this._noteTargetSvId = svId;
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

      if (this._noteTargetSvId < 0) {
        const desc = SV_ID_TO_TYPE_STRING.get(mod.descriptorId);
        if (desc && this._isGenerator(desc)) {
          this._noteTargetSvId = svModId;
        }
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

    if (this._noteTargetSvId === svModId) {
      this._noteTargetSvId = -1;
    }
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

  // ── Patch sync ──────────────────────────────────────────────────────────

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

  // ── Module graph query ──────────────────────────────────────────────────

  async getModuleGraph(): Promise<SunVoxModuleGraphEntry[]> {
    await this._initPromise;
    if (this._handle < 0) return [];
    return this.engine.getModuleGraph(this._handle);
  }

  getSvModuleId(uiId: string): number | undefined {
    return this.uiToSv.get(uiId);
  }

  setNoteTarget(uiId: string): void {
    const svId = this.uiToSv.get(uiId);
    if (svId !== undefined) this._noteTargetSvId = svId;
  }

  // ── Save/Load ───────────────────────────────────────────────────────────

  async save(): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._handle < 0) throw new Error('[SunVoxModularSynth] No slot');
    return this.engine.saveSong(this._handle);
  }

  async loadPatch(data: ArrayBuffer): Promise<SunVoxModuleGraphEntry[]> {
    await this._initPromise;
    if (this._handle < 0) throw new Error('[SunVoxModularSynth] No slot');
    await this.engine.loadSong(this._handle, data);
    return this.engine.getModuleGraph(this._handle);
  }

  // ── DevilboxSynth interface ─────────────────────────────────────────────

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed) return;

    if (this._songData) {
      void this._initPromise.then(() => {
        if (!this._disposed && this._handle >= 0) this.engine.play(this._handle);
      });
      return;
    }

    if (this._handle < 0 || this._noteTargetSvId < 0) return;

    let midiNote: number;
    if (typeof note === 'string') midiNote = noteToMidi(note);
    else if (typeof note === 'number') midiNote = note;
    else midiNote = 60;

    const vel = Math.max(1, Math.min(128, Math.round((velocity ?? 1) * 127) + 1));
    this.engine.noteOn(this._handle, this._noteTargetSvId, midiNote, vel);
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;

    if (this._songData) {
      if (this._handle >= 0) this.engine.stop(this._handle);
      return;
    }

    if (this._handle < 0 || this._noteTargetSvId < 0) return;
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

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._handle >= 0) {
      this.engine.destroyHandle(this._handle);
      this._handle = -1;
    }
    this.uiToSv.clear();
    this.svToUi.clear();
  }
}
