/**
 * DX7 Synth — VDX7 cycle-accurate Yamaha DX7 emulation (WASM)
 * Thin worklet wrapper. All DSP in WASM.
 * Requires 16KB firmware ROM to produce audio.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export interface DX7PatchBank {
  file: string;
  voices: string[];
}

export interface DX7PatchManifest {
  banks: DX7PatchBank[];
}

export class DX7Synth implements DevilboxSynth {
  readonly name = 'DX7Synth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();
  private static wasmCache: { wasmBinary: ArrayBuffer; jsCode: string } | null = null;
  private static wasmFetchPromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;
  private static patchManifest: DX7PatchManifest | null = null;
  private static manifestPromise: Promise<DX7PatchManifest | null> | null = null;

  private audioContext: AudioContext;
  private _disposed = false;
  private _ready = false;
  private _wasmLoaded = false;
  private _pendingMessages: Array<Record<string, unknown>> = [];
  private _romLoaded = false;
  private _currentBankFile = '';
  private _currentVoice = 0;
  private _onPatchChange: ((bankFile: string, voiceIndex: number, voiceName: string) => void) | null = null;
  private _resolveInit!: () => void;
  private _initPromise: Promise<void>;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1.0;
    this._initPromise = new Promise((resolve) => { this._resolveInit = resolve; });
    this.initWorklet();
  }

  /** Wait for WASM + ROM to be fully initialized */
  async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initWorklet() {
    try {
      const [, assets] = await Promise.all([
        DX7Synth.ensureModuleLoaded(this.audioContext),
        DX7Synth.fetchWasmAssets(),
        DX7Synth.fetchPatchManifest(),
      ]);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'dx7-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'ready') {
          this._ready = true;
          this._romLoaded = true;
          for (const msg of this._pendingMessages) this.workletNode?.port.postMessage(msg);
          this._pendingMessages = [];
          this._resolveInit();
          this.tryAutoLoadVoices();
          this.tryAutoLoadFirstPatchBank();
        } else if (data.type === 'wasmLoaded') {
          this._wasmLoaded = true;
          this.tryAutoLoadRom();
        } else if (data.type === 'error') {
          console.error('[DX7]', data.message);
        } else if (data.type === 'patchName') {
          console.log(`[DX7] Patch ${data.index}: ${data.name}`);
        }
      };

      this.workletNode.connect(this.output);
      this.workletNode.port.postMessage({
        type: 'init', sampleRate: this.audioContext.sampleRate,
        wasmBinary: assets.wasmBinary, jsCode: assets.jsCode,
      });
    } catch (err) {
      console.error('[DX7] Init failed:', err);
    }
  }

  /** Auto-load ROM from well-known paths */
  private async tryAutoLoadRom() {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const romPaths = [
      `${baseUrl}roms/dx7/DX7-V1-8.OBJ`,
      `${baseUrl}roms/dx7/dx7_rom.bin`,
      `${baseUrl}roms/dx7/DX7_ROM.bin`,
      `${baseUrl}roms/dx7/firmware.bin`,
      `${baseUrl}roms/gearmulator/extracted/dx7.bin`,
    ];

    for (const path of romPaths) {
      try {
        const resp = await fetch(path);
        if (resp.ok) {
          const data = await resp.arrayBuffer();
          if (data.byteLength === 16384) {
            console.log(`[DX7] Auto-loaded ROM from ${path}`);
            this.loadFirmware(data);
            return;
          }
        }
      } catch { /* try next */ }
    }
    console.warn('[DX7] No firmware ROM found. Load manually via loadFirmware()');
  }

  /** Auto-load voice banks from well-known paths */
  private async tryAutoLoadVoices() {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const voicePaths = [
      `${baseUrl}roms/dx7/DX7_Voice_Rom2.BIN`,
      `${baseUrl}roms/dx7/voices.bin`,
    ];

    for (const path of voicePaths) {
      try {
        const resp = await fetch(path);
        if (resp.ok) {
          const data = await resp.arrayBuffer();
          if (data.byteLength >= 4096) {
            console.log(`[DX7] Auto-loaded voices from ${path} (${data.byteLength} bytes)`);
            this.loadVoices(data);
            return;
          }
        }
      } catch { /* try next */ }
    }
  }

  /** Auto-load the first patch bank from manifest */
  private async tryAutoLoadFirstPatchBank() {
    const manifest = await DX7Synth.fetchPatchManifest();
    if (manifest && manifest.banks.length > 0) {
      // Load rom1a.syx first if available, otherwise first bank
      const preferred = manifest.banks.find(b => b.file === 'rom1a.syx') ?? manifest.banks[0];
      await this.loadPatchBank(preferred.file, 0);
    }
  }

  /** Fetch patch manifest (cached, shared across instances) */
  static async fetchPatchManifest(): Promise<DX7PatchManifest | null> {
    if (DX7Synth.patchManifest) return DX7Synth.patchManifest;
    if (DX7Synth.manifestPromise) return DX7Synth.manifestPromise;
    DX7Synth.manifestPromise = (async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const resp = await fetch(`${baseUrl}roms/dx7/Patches/manifest.json`);
        if (!resp.ok) return null;
        const data = await resp.json() as DX7PatchManifest;
        DX7Synth.patchManifest = data;
        console.log(`[DX7] Loaded patch manifest: ${data.banks.length} banks, ${data.banks.length * 32} voices`);
        return data;
      } catch {
        return null;
      }
    })();
    return DX7Synth.manifestPromise;
  }

  /** Get available patch banks (from manifest) */
  static getPatchManifest(): DX7PatchManifest | null {
    return DX7Synth.patchManifest;
  }

  /** Load a sysex patch bank by filename and optionally select a voice */
  async loadPatchBank(bankFile: string, voiceIndex = 0) {
    const baseUrl = import.meta.env.BASE_URL || '/';
    try {
      const resp = await fetch(`${baseUrl}roms/dx7/Patches/${bankFile}`);
      if (!resp.ok) throw new Error(`Failed to fetch ${bankFile}`);
      const data = await resp.arrayBuffer();
      this.loadSysex(data);
      this._currentBankFile = bankFile;
      // Select the voice after a short delay to let the firmware process the sysex
      setTimeout(() => {
        this.selectVoice(voiceIndex);
      }, 100);
    } catch (err) {
      console.error(`[DX7] Failed to load patch bank ${bankFile}:`, err);
    }
  }

  /** Select a voice within the currently loaded bank (0-31) */
  selectVoice(index: number) {
    const voiceIndex = Math.max(0, Math.min(31, Math.round(index)));
    this._currentVoice = voiceIndex;
    this.send({ type: 'programChange', program: voiceIndex });
    // Notify listener
    if (this._onPatchChange) {
      const manifest = DX7Synth.patchManifest;
      const bank = manifest?.banks.find(b => b.file === this._currentBankFile);
      const voiceName = bank?.voices[voiceIndex] ?? `Voice ${voiceIndex + 1}`;
      this._onPatchChange(this._currentBankFile, voiceIndex, voiceName);
    }
  }

  /** Register callback for patch changes */
  onPatchChange(cb: (bankFile: string, voiceIndex: number, voiceName: string) => void) {
    this._onPatchChange = cb;
  }

  get currentBankFile(): string { return this._currentBankFile; }
  get currentVoice(): number { return this._currentVoice; }

  /** Load 16KB firmware ROM */
  loadFirmware(data: ArrayBuffer) {
    if (this._wasmLoaded && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'loadFirmware', data });
    }
  }

  /** Load factory voice banks (multiples of 4096 bytes) */
  loadVoices(data: ArrayBuffer) {
    this.send({ type: 'loadVoices', data });
  }

  /** Load DX7 sysex data (4104 bytes for 32-voice bulk dump) */
  loadSysex(data: ArrayBuffer) {
    this.send({ type: 'loadSysex', data });
  }

  private send(msg: Record<string, unknown>) {
    if (this._ready && this.workletNode) this.workletNode.port.postMessage(msg);
    else this._pendingMessages.push(msg);
  }

  private static async ensureModuleLoaded(ctx: AudioContext): Promise<void> {
    if (DX7Synth.loadedContexts.has(ctx)) return;
    let p = DX7Synth.initPromises.get(ctx);
    if (p) return p;
    p = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      await ctx.audioWorklet.addModule(`${baseUrl}dx7/DX7.worklet.js`);
      DX7Synth.loadedContexts.add(ctx);
    })();
    DX7Synth.initPromises.set(ctx, p);
    return p;
  }

  private static async fetchWasmAssets(): Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> {
    if (DX7Synth.wasmCache) return DX7Synth.wasmCache;
    if (DX7Synth.wasmFetchPromise) return DX7Synth.wasmFetchPromise;
    DX7Synth.wasmFetchPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${baseUrl}dx7/DX7.wasm`), fetch(`${baseUrl}dx7/DX7.js`),
      ]);
      const wasmBinary = await wasmResp.arrayBuffer();
      let jsCode = await jsResp.text();
      jsCode = jsCode.replace(/import\.meta\.url/g, "'.'");
      const result = { wasmBinary, jsCode };
      DX7Synth.wasmCache = result;
      return result;
    })();
    return DX7Synth.wasmFetchPromise;
  }

  triggerAttack(note: string | number, _time?: number, velocity = 1) {
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this.send({ type: 'noteOn', note: midi, velocity: Math.round(velocity * 127) });
  }

  triggerRelease(note?: string | number, _time?: number) {
    if (note !== undefined) {
      const midi = typeof note === 'string' ? noteToMidi(note) : note;
      this.send({ type: 'noteOff', note: midi });
    } else {
      this.send({ type: 'allNotesOff' });
    }
  }

  triggerAttackRelease(note: string | number, duration: number, _time?: number, velocity?: number) {
    this.triggerAttack(note, _time, velocity);
    setTimeout(() => this.triggerRelease(note), duration * 1000);
  }

  /** Select voice bank (0-7) */
  setBank(bank: number) {
    this.send({ type: 'setBank', bank });
  }

  /** Select program within current bank (0-31) */
  programChange(program: number) {
    this.send({ type: 'programChange', program });
  }

  pitchBend(value: number) {
    // Convert -1..1 range to 0..127 MIDI MSB
    const msb = Math.round((value + 1) * 63.5);
    this.send({ type: 'pitchBend', value: msb });
  }

  modWheel(value: number) {
    this.send({ type: 'modWheel', value: Math.round(value * 127) });
  }

  set(param: string, value: number) {
    switch (param) {
      case 'volume': this.send({ type: 'setVolume', volume: value }); break;
      case 'bank': {
        // Bank index maps to sysex files from the manifest
        const manifest = DX7Synth.patchManifest;
        if (manifest && manifest.banks.length > 0) {
          const idx = Math.max(0, Math.min(manifest.banks.length - 1, Math.round(value)));
          const bank = manifest.banks[idx];
          if (bank.file !== this._currentBankFile) {
            this.loadPatchBank(bank.file, 0);
          }
        } else {
          this.setBank(value);
        }
        break;
      }
      case 'program': this.selectVoice(value); break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'bank': {
        const manifest = DX7Synth.patchManifest;
        if (manifest) {
          const idx = manifest.banks.findIndex(b => b.file === this._currentBankFile);
          return idx >= 0 ? idx : 0;
        }
        return 0;
      }
      case 'program': return this._currentVoice;
      default: return undefined;
    }
  }

  get isReady(): boolean { return this._ready; }
  get hasRom(): boolean { return this._romLoaded; }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'destroy' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.disconnect();
  }
}
