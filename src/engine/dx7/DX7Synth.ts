/**
 * DX7 Synth — VDX7 cycle-accurate Yamaha DX7 emulation (WASM)
 * Thin worklet wrapper. All DSP in WASM.
 * Requires 16KB firmware ROM to produce audio.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { DX7_LIBRARY_DIR } from './dx7Library';
import { packDX7Voice } from './dx7sysex';
import { dx7VoiceTrimDb } from './dx7Loudness';
import type { Dx7VoiceStatus } from './dx7VoiceStatus';

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
  /** Evens out the loudness of voices (dx7Loudness.ts); between the worklet and `output`, whose gain the instrument volume owns. */
  private readonly trim: GainNode;
  private _trimTimer: ReturnType<typeof setTimeout> | undefined;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();
  private static wasmCache: { wasmBinary: ArrayBuffer; jsCode: string } | null = null;
  private static wasmFetchPromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;
  private static patchManifest: DX7PatchManifest | null = null;
  private static manifestPromise: Promise<DX7PatchManifest | null> | null = null;

  /** Every live instance, and who watches their voices (the editor's curve markers). */
  private static instances = new Set<DX7Synth>();
  private static voiceListeners = new Set<(status: Dx7VoiceStatus) => void>();

  /**
   * Live voice state of every DX7 voice (EG level and segment per operator, voice pitch, LFO), for the editor curves'
   * markers. The worklets report only while somebody is subscribed.
   */
  static subscribeVoiceStatus(cb: (status: Dx7VoiceStatus) => void): () => void {
    DX7Synth.voiceListeners.add(cb);
    if (DX7Synth.voiceListeners.size === 1) for (const s of DX7Synth.instances) s.send({ type: 'watchVoices', on: true });
    return () => {
      if (!DX7Synth.voiceListeners.delete(cb)) return;
      if (DX7Synth.voiceListeners.size === 0) for (const s of DX7Synth.instances) s.send({ type: 'watchVoices', on: false });
    };
  }

  /** Ask the firmware for the voice it is playing (155 VCED bytes); resolves null if it does not answer in time. */
  readVoice(timeoutMs = 400): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      if (!this.workletNode || !this._ready) { resolve(null); return; }
      const node = this.workletNode;
      const timer = setTimeout(() => { node.port.removeEventListener('message', onMsg); resolve(null); }, timeoutMs);
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type !== 'vced') return;
        clearTimeout(timer);
        node.port.removeEventListener('message', onMsg);
        resolve(new Uint8Array(e.data.values as number[]));
      };
      node.port.addEventListener('message', onMsg);
      this.send({ type: 'getVced' });
    });
  }

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
  private _vcedPresetName: string | undefined;

  private _libraryStart: { file: string; program: number } | undefined;

  constructor(vcedPreset?: string, library?: { file: string; program: number }) {
    this.audioContext = getDevilboxAudioContext();
    this._libraryStart = library;
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1.0;
    this.trim = this.audioContext.createGain();
    this.trim.connect(this.output);
    this._vcedPresetName = vcedPreset;
    this._initPromise = new Promise((resolve) => { this._resolveInit = resolve; });
    DX7Synth.instances.add(this);
    if (DX7Synth.voiceListeners.size > 0) this.send({ type: 'watchVoices', on: true });
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
          // Load voices + patches, then resolve init when everything is ready
          this._finishInit();
        } else if (data.type === 'wasmLoaded') {
          this._wasmLoaded = true;
          this.tryAutoLoadRom();
        } else if (data.type === 'error') {
          console.error('[DX7]', data.message);
        } else if (data.type === 'voiceStatus') {
          for (const cb of DX7Synth.voiceListeners) cb({ voices: data.voices, lfo: data.lfo });
        } else if (data.type === 'patchName') {
          console.log(`[DX7] Patch ${data.index}: ${data.name}`);
        } else if (data.type === 'debugInfo') {
          console.log(`[DX7:DEBUG] State dump:`, data);
        } else if (data.type === 'debugLoadResult') {
          console.log(`[DX7:DEBUG] Load+check result:`, data);
        }
      };

      this.workletNode.connect(this.trim);
      this.workletNode.port.postMessage({
        type: 'init', sampleRate: this.audioContext.sampleRate,
        wasmBinary: assets.wasmBinary, jsCode: assets.jsCode,
      });
    } catch (err) {
      console.error('[DX7] Init failed:', err);
    }
  }

  /** Load first patch bank, then resolve ensureInitialized() */
  private async _finishInit() {
    try {
      // Only load patch bank — dx7LoadSysex in the bridge handles BOTH internal RAM
      // and cartridge sync. Do NOT call loadVoices separately (causes double-load).
      await this.tryAutoLoadFirstPatchBank();
    } catch {
      // Non-fatal — synth works without patches, just silent
    }

    // A library voice saved with the instrument replaces the default first bank
    if (this._libraryStart) {
      await this.loadLibraryBank(this._libraryStart.file, this._libraryStart.program);
    }

    // If a VCED preset was requested, load it now
    if (this._vcedPresetName) {
      this._loadVcedPreset(this._vcedPresetName);
    }

    this._resolveInit();
  }

  /** Load a named VCED preset (156-byte single-voice patch) */
  private _loadVcedPreset(name: string) {
    if (this._disposed) return;
    import('./dx7presets').then(({ DX7_VCED_PRESETS }) => {
      if (this._disposed) return;
      const preset = DX7_VCED_PRESETS.find(p => p.name === name);
      if (preset && preset.data.length === 156) {
        this._loadVcedData(preset.data.subarray(0, 155));
        console.log(`[DX7] Loaded VCED preset: ${name}`);
      } else {
        console.warn(`[DX7] VCED preset not found: ${name}`);
      }
    }).catch(err => {
      console.error(`[DX7] Failed to load VCED preset:`, err);
    });
  }

  /** Load raw VCED data (155 bytes unpacked) via 32-voice bulk dump sysex.
   *  Places the packed voice at slot 0. The bridge's dx7LoadSysex handles
   *  writing to BOTH internal RAM and cartridge, plus sends program change 0. */
  _loadVcedData(vced: Uint8Array) {
    const packed = DX7Synth.vcedToVmem(vced);
    // Build 4104-byte bulk dump: voice 0 = our preset, voices 1-31 = init patch
    const sysex = new Uint8Array(4104);
    sysex[0] = 0xF0;
    sysex[1] = 0x43; // Yamaha
    sysex[2] = 0x00; // Channel 0
    sysex[3] = 0x09; // Format 9 = 32-voice bulk dump
    sysex[4] = 0x20; // Byte count MSB (4096)
    sysex[5] = 0x00; // Byte count LSB
    sysex.set(packed, 6); // Voice 0 at offset 6
    // Checksum
    let sum = 0;
    for (let i = 6; i < 4102; i++) sum += sysex[i];
    sysex[4102] = (-sum) & 0x7F;
    sysex[4103] = 0xF7;
    // Bridge dx7LoadSysex: memcpy to 0x1000, cartridge update, setBank(0),
    // and program change 0 via serial. The serial PC needs firmware CPU cycles
    // to process — send a redundant PC after 100ms to ensure EGS reloads.
    this.loadSysex(sysex.buffer);
    setTimeout(() => { if (!this._disposed) this.selectVoice(0); }, 100);
    console.log(`[DX7] _loadVcedData: sent 4104-byte bulk dump`);
  }

  /** Convert VCED (155 bytes unpacked) to VMEM (128 bytes packed) */
  static vcedToVmem(vced: Uint8Array): Uint8Array {
    return packDX7Voice(vced);
  }

  /** Load a VCED preset by name (public API for preset switching) */
  loadVcedPreset(name: string) {
    if (this._ready) {
      this._loadVcedPreset(name);
    } else {
      this._vcedPresetName = name;
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
  async loadPatchBank(bankFile: string, voiceIndex = 0, dir = 'roms/dx7/Patches/') {
    const baseUrl = import.meta.env.BASE_URL || '/';
    try {
      const resp = await fetch(`${baseUrl}${dir}${bankFile}`);
      if (!resp.ok) throw new Error(`Failed to fetch ${bankFile}`);
      const data = await resp.arrayBuffer();
      console.log(`[DX7] loadPatchBank: ${bankFile} (${data.byteLength} bytes), voiceIndex=${voiceIndex}`);
      this.loadSysex(data);
      this._currentBankFile = bankFile;
      await new Promise<void>(resolve => setTimeout(() => {
        this.selectVoice(voiceIndex);
        resolve();
      }, 100));
    } catch (err) {
      console.error(`[DX7] Failed to load patch bank ${bankFile}:`, err);
    }
  }

  /** Load a bank from the curated library (public/data/sysex/dx7) and select a voice. */
  async loadLibraryBank(bankFile: string, voiceIndex = 0) {
    await this.loadPatchBank(bankFile, voiceIndex, DX7_LIBRARY_DIR);
  }

  /** Select a voice within the currently loaded bank (0-31) */
  selectVoice(index: number) {
    const voiceIndex = Math.max(0, Math.min(31, Math.round(index)));
    this._currentVoice = voiceIndex;
    this.send({ type: 'programChange', program: voiceIndex });
    this.scheduleTrim();
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
    this.scheduleTrim();
  }

  /**
   * After a voice load, once the firmware has processed it: read the voice it now plays and set the output trim that gives
   * it the level of the default voice. Computed once per distinct voice; a knob edit (setVcedParam) does not come here, so
   * tweaking a sound never moves its level underneath the hand.
   */
  private scheduleTrim(delayMs = 250) {
    clearTimeout(this._trimTimer);
    this._trimTimer = setTimeout(async () => {
      if (this._disposed) return;
      const bytes = await this.readVoice();
      if (!bytes || this._disposed) return;
      this.trim.gain.value = Math.pow(10, dx7VoiceTrimDb(bytes) / 20);
    }, delayMs);
  }

  /** Set a single VCED voice parameter via SysEx parameter change message.
   *  paramNum: 0-155 (VCED byte offset), value: 0-99 (or max for that param).
   *  This sends a DX7 SysEx parameter change: F0 43 10 gg pp dd F7 */
  setVcedParam(paramNum: number, value: number) {
    const group = paramNum > 127 ? 0x01 : 0x00; // pp bits for params 128-155
    const paramByte = paramNum > 127 ? paramNum - 128 : paramNum;
    const sysex = new Uint8Array([0xF0, 0x43, 0x10, group, paramByte, value & 0x7F, 0xF7]);
    this.send({ type: 'loadSysex', data: sysex.buffer });
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

  private _currentMidiNote = 69;

  triggerAttack(note: string | number, _time?: number, velocity = 1) {
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this._currentMidiNote = midi;
    // velocity is 0..1; the bridge's velocity table has 128 entries, so a stray value above 1 must not reach it
    this.send({ type: 'noteOn', note: midi, velocity: Math.max(0, Math.min(127, Math.round(velocity * 127))) });
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
    this.scheduleTrim();
  }

  pitchBend(value: number) {
    // Convert -1..1 range to 0..127 MIDI MSB
    const msb = Math.round((value + 1) * 63.5);
    this.send({ type: 'pitchBend', value: msb });
  }

  /**
   * Set oscillator frequency in Hz for tracker effect commands.
   * Converts to DX7 pitch bend (-1..1 mapped to 0..127 MSB).
   */
  setFrequency(hz: number): void {
    if (hz <= 0) return;
    const currentNoteHz = 440 * Math.pow(2, (this._currentMidiNote - 69) / 12);
    const semitoneOffset = 12 * Math.log2(hz / currentNoteHz);
    // DX7 pitch bend range is ±2 semitones by default
    const bendRange = 2;
    const normalized = Math.max(-1, Math.min(1, semitoneOffset / bendRange));
    this.pitchBend(normalized);
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
      // NKS automation params → VCED SysEx
      case 'op1Level': this.setVcedParam(0 * 21 + 14, Math.round(value)); break;
      case 'op2Level': this.setVcedParam(1 * 21 + 14, Math.round(value)); break;
      case 'op3Level': this.setVcedParam(2 * 21 + 14, Math.round(value)); break;
      case 'op4Level': this.setVcedParam(3 * 21 + 14, Math.round(value)); break;
      case 'op5Level': this.setVcedParam(4 * 21 + 14, Math.round(value)); break;
      case 'op6Level': this.setVcedParam(5 * 21 + 14, Math.round(value)); break;
      case 'algorithm': this.setVcedParam(134, Math.round(value)); break;
      case 'feedback': this.setVcedParam(135, Math.round(value)); break;
      case 'lfoSpeed': this.setVcedParam(137, Math.round(value)); break;
      case 'lfoDelay': this.setVcedParam(138, Math.round(value)); break;
      case 'lfoPMD': this.setVcedParam(139, Math.round(value)); break;
      case 'lfoAMD': this.setVcedParam(140, Math.round(value)); break;
      case 'lfoWaveform': this.setVcedParam(142, Math.round(value)); break;
      case 'transpose': this.setVcedParam(144, Math.round(value)); break;
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
    DX7Synth.instances.delete(this);
    clearTimeout(this._trimTimer);
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'destroy' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.trim.disconnect();
    this.output.disconnect();
  }

  /** Debug: dump internal state to console */
  debug() {
    this.send({ type: 'debug' });
  }

  /** Debug: load sysex and check if EGS registers change */
  debugLoadAndCheck(data: ArrayBuffer) {
    if (this._ready && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'debugLoadAndCheck', data });
    }
  }
}
