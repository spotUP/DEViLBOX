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
  private _channelIndex = -1; // -1 = keyboard mode, 0+ = tracker channel
  private _unmuted = false; // Start muted to prevent transient on preload

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 0; // Muted until first note trigger
    this._initPromise = this.initWorklet();
  }

  private _initPromise: Promise<void>;

  /** Wait until the AudioWorklet + WASM are loaded and ready */
  async ensureInitialized(): Promise<void> {
    await this._initPromise;
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

  private _currentMidiNote = 69;

  triggerAttack(note: string | number, _time?: number, velocity = 1) {
    if (!this._unmuted) {
      this.output.gain.value = 1.0;
      this._unmuted = true;
    }
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this._currentMidiNote = midi;
    if (this._channelIndex >= 0) {
      this.send({ type: 'chNoteOn', ch: this._channelIndex, note: midi, velocity: Math.round(velocity * 127) });
    } else {
      this.send({ type: 'noteOn', note: midi, velocity: Math.round(velocity * 127) });
    }
  }

  triggerRelease(note?: string | number, _time?: number) {
    if (this._channelIndex >= 0) {
      this.send({ type: 'chNoteOff', ch: this._channelIndex });
    } else if (note !== undefined) {
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
    if (this._channelIndex >= 0) {
      this.send({ type: 'chSetPatch', ch: this._channelIndex, regs });
    } else {
      this.send({ type: 'setPatch', regs });
    }
  }

  /** Set the OPL channel index for tracker playback (0-17).
   *  When set, noteOn/noteOff/setPatch address that specific OPL voice
   *  instead of using round-robin voice allocation. */
  setChannel(ch: number) {
    this._channelIndex = ch;
  }

  pitchBend(semitones: number) {
    this.send({ type: 'pitchBend', semitones });
  }

  /**
   * Set oscillator frequency in Hz for tracker effect commands.
   * Converts to semitone offset for OPL3 pitch bend.
   */
  setFrequency(hz: number): void {
    if (hz <= 0) return;
    const currentNoteHz = 440 * Math.pow(2, (this._currentMidiNote - 69) / 12);
    const semitoneOffset = 12 * Math.log2(hz / currentNoteHz);
    this.pitchBend(semitoneOffset);
  }

  /**
   * Current patch state (individual parameters).
   * Packed into OPL3 registers when sending to worklet.
   */
  private patchState = {
    // Operator 1 (modulator) — ADSR, level, multiplier, waveform, flags
    op1Attack: 1, op1Decay: 4, op1Sustain: 2, op1Release: 5,
    op1Level: 32, op1Multi: 1, op1Waveform: 0,
    op1Tremolo: 0, op1Vibrato: 0, op1SustainHold: 0, op1KSR: 0, op1KSL: 0,
    // Operator 2 (carrier)
    op2Attack: 1, op2Decay: 4, op2Sustain: 2, op2Release: 5,
    op2Level: 0, op2Multi: 1, op2Waveform: 0,
    op2Tremolo: 0, op2Vibrato: 0, op2SustainHold: 0, op2KSR: 0, op2KSL: 0,
    // Global
    feedback: 0, connection: 0,
  };

  /** Pack current patch state into 11 OPL3 registers */
  private packRegisters(): number[] {
    const s = this.patchState;
    return [
      // 0x20 mod: Tremolo(1) | Vibrato(1) | SustainHold(1) | KSR(1) | Multi(4)
      ((s.op1Tremolo & 1) << 7) | ((s.op1Vibrato & 1) << 6) | ((s.op1SustainHold & 1) << 5) | ((s.op1KSR & 1) << 4) | (s.op1Multi & 0xF),
      // 0x20 car
      ((s.op2Tremolo & 1) << 7) | ((s.op2Vibrato & 1) << 6) | ((s.op2SustainHold & 1) << 5) | ((s.op2KSR & 1) << 4) | (s.op2Multi & 0xF),
      // 0x40 mod: KSL(2) | TL(6) — level is inverted (63=quiet, 0=loud)
      ((s.op1KSL & 3) << 6) | ((63 - (s.op1Level & 0x3F)) & 0x3F),
      // 0x40 car
      ((s.op2KSL & 3) << 6) | ((63 - (s.op2Level & 0x3F)) & 0x3F),
      // 0x60 mod: AR(4) | DR(4)
      ((s.op1Attack & 0xF) << 4) | (s.op1Decay & 0xF),
      // 0x60 car
      ((s.op2Attack & 0xF) << 4) | (s.op2Decay & 0xF),
      // 0x80 mod: SL(4) | RR(4)
      ((s.op1Sustain & 0xF) << 4) | (s.op1Release & 0xF),
      // 0x80 car
      ((s.op2Sustain & 0xF) << 4) | (s.op2Release & 0xF),
      // 0xE0 mod: waveform (0-7)
      s.op1Waveform & 0x7,
      // 0xE0 car: waveform (0-7)
      s.op2Waveform & 0x7,
      // 0xC0: L+R(2) | FB(3) | CNT(1)
      0x30 | ((s.feedback & 0x7) << 1) | (s.connection & 0x1),
    ];
  }

  /** Batch-update all patch parameters and send a single setPatch message */
  applyPatch(params: Record<string, number>) {
    for (const [k, v] of Object.entries(params)) {
      if (k in this.patchState) {
        (this.patchState as Record<string, number>)[k] = Math.round(v);
      }
    }
    this.setPatchRegisters(this.packRegisters());
  }

  set(param: string, value: number) {
    if (param in this.patchState) {
      (this.patchState as Record<string, number>)[param] = Math.round(value);
      this.setPatchRegisters(this.packRegisters());
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
