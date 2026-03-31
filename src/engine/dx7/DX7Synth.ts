/**
 * DX7 Synth — VDX7 cycle-accurate Yamaha DX7 emulation (WASM)
 * Thin worklet wrapper. All DSP in WASM.
 * Requires 16KB firmware ROM to produce audio.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export class DX7Synth implements DevilboxSynth {
  readonly name = 'DX7Synth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();
  private static wasmCache: { wasmBinary: ArrayBuffer; jsCode: string } | null = null;
  private static wasmFetchPromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;

  private audioContext: AudioContext;
  private _disposed = false;
  private _ready = false;
  private _wasmLoaded = false;
  private _pendingMessages: Array<Record<string, unknown>> = [];
  private _romLoaded = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1.0;
    this.initWorklet();
  }

  private async initWorklet() {
    try {
      const [, assets] = await Promise.all([
        DX7Synth.ensureModuleLoaded(this.audioContext),
        DX7Synth.fetchWasmAssets(),
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
      case 'bank': this.setBank(value); break;
      case 'program': this.programChange(value); break;
    }
  }

  get(_param: string): number | undefined { return undefined; }

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
