/**
 * OPL3 Synth — Nuked OPL3 (YMF262) 18-channel FM (WASM)
 * Thin worklet wrapper. All DSP in WASM.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export class OPL3Synth implements DevilboxSynth {
  readonly name = 'OPL3Synth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private static loadedContexts = new WeakSet<AudioContext>();
  private static initPromises = new WeakMap<AudioContext, Promise<void>>();
  private static wasmCache: { wasmBinary: ArrayBuffer; jsCode: string } | null = null;
  private static wasmFetchPromise: Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> | null = null;

  private audioContext: AudioContext;
  private _disposed = false;
  private _ready = false;
  private _pendingMessages: Array<Record<string, unknown>> = [];

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1.0;
    this.initWorklet();
  }

  private async initWorklet() {
    try {
      const [, assets] = await Promise.all([
        OPL3Synth.ensureModuleLoaded(this.audioContext),
        OPL3Synth.fetchWasmAssets(),
      ]);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'opl3-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this._ready = true;
          for (const msg of this._pendingMessages) this.workletNode?.port.postMessage(msg);
          this._pendingMessages = [];
        } else if (e.data.type === 'error') {
          console.error('[OPL3]', e.data.message);
        }
      };

      this.workletNode.connect(this.output);
      this.workletNode.port.postMessage({
        type: 'init', sampleRate: this.audioContext.sampleRate,
        wasmBinary: assets.wasmBinary, jsCode: assets.jsCode,
      });
    } catch (err) {
      console.error('[OPL3] Init failed:', err);
    }
  }

  private send(msg: Record<string, unknown>) {
    if (this._ready && this.workletNode) this.workletNode.port.postMessage(msg);
    else this._pendingMessages.push(msg);
  }

  private static async ensureModuleLoaded(ctx: AudioContext): Promise<void> {
    if (OPL3Synth.loadedContexts.has(ctx)) return;
    let p = OPL3Synth.initPromises.get(ctx);
    if (p) return p;
    p = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      await ctx.audioWorklet.addModule(`${baseUrl}opl3/OPL3.worklet.js`);
      OPL3Synth.loadedContexts.add(ctx);
    })();
    OPL3Synth.initPromises.set(ctx, p);
    return p;
  }

  private static async fetchWasmAssets(): Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> {
    if (OPL3Synth.wasmCache) return OPL3Synth.wasmCache;
    if (OPL3Synth.wasmFetchPromise) return OPL3Synth.wasmFetchPromise;
    OPL3Synth.wasmFetchPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${baseUrl}opl3/OPL3.wasm`), fetch(`${baseUrl}opl3/OPL3.js`),
      ]);
      const wasmBinary = await wasmResp.arrayBuffer();
      let jsCode = await jsResp.text();
      jsCode = jsCode.replace(/import\.meta\.url/g, "'.'");
      const result = { wasmBinary, jsCode };
      OPL3Synth.wasmCache = result;
      return result;
    })();
    return OPL3Synth.wasmFetchPromise;
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

  /** Load an SBI patch file from an ArrayBuffer */
  loadSbi(data: ArrayBuffer) {
    this.send({ type: 'loadSbi', data });
  }

  /** Set patch registers directly (11 OPL2 registers) */
  setPatchRegisters(regs: number[]) {
    this.send({ type: 'setPatch', regs });
  }

  pitchBend(semitones: number) {
    this.send({ type: 'pitchBend', semitones });
  }

  /**
   * Current patch state (individual parameters).
   * Packed into OPL3 registers when sending to worklet.
   */
  private patchState = {
    // Operator 1 (modulator)
    op1Attack: 1, op1Decay: 4, op1Sustain: 2, op1Release: 5,
    op1Level: 32, op1Multi: 1,
    // Operator 2 (carrier)
    op2Attack: 1, op2Decay: 4, op2Sustain: 2, op2Release: 5,
    op2Level: 0, op2Multi: 1,
    // Global
    feedback: 0, connection: 0,
  };

  /** Pack current patch state into 11 OPL3 registers */
  private packRegisters(): number[] {
    const s = this.patchState;
    return [
      (s.op1Multi & 0xF),                                      // 0x20 mod: TVSK(4) | MULTI(4) — tremolo/vibrato/sustain/ksr bits zeroed
      (s.op2Multi & 0xF),                                      // 0x20 car
      ((63 - (s.op1Level & 0x3F)) & 0x3F),                    // 0x40 mod: KSL(2) | TL(6) — level is inverted (63=quiet, 0=loud)
      ((63 - (s.op2Level & 0x3F)) & 0x3F),                    // 0x40 car
      (((s.op1Attack & 0xF) << 4) | (s.op1Decay & 0xF)),     // 0x60 mod: AR(4) | DR(4)
      (((s.op2Attack & 0xF) << 4) | (s.op2Decay & 0xF)),     // 0x60 car
      (((s.op1Sustain & 0xF) << 4) | (s.op1Release & 0xF)),  // 0x80 mod: SL(4) | RR(4) — sustain is inverted (15=quiet, 0=loud)
      (((s.op2Sustain & 0xF) << 4) | (s.op2Release & 0xF)),  // 0x80 car
      0,                                                        // 0xE0 mod: waveform (0=sine)
      0,                                                        // 0xE0 car: waveform (0=sine)
      (((s.feedback & 0x7) << 1) | (s.connection & 0x1) | 0x30), // 0xC0: L+R(2) | FB(3) | CNT(1)
    ];
  }

  set(param: string, value: number) {
    if (param in this.patchState) {
      (this.patchState as Record<string, number>)[param] = Math.round(value);
      this.send({ type: 'setPatch', regs: this.packRegisters() });
    }
  }

  get(param: string): number | undefined {
    if (param in this.patchState)
      return (this.patchState as Record<string, number>)[param];
    return undefined;
  }

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
