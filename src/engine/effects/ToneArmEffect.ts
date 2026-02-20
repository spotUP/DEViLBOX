// src/engine/effects/ToneArmEffect.ts
/**
 * ToneArmEffect — vinyl record physics simulation via AudioWorklet.
 * DSP ported from the Python ToneArm library.
 * Wraps public/tonearm/ToneArm.worklet.js.
 *
 * Signal path:
 *   input → [worklet → wetGain] → output
 *          ↘ [dryGain]         ↗
 *
 * The worklet itself handles wet/dry internally per-sample, so the
 * wetGain node here is used only for the gain-node routing topology;
 * wet is also forwarded as a message param to keep the worklet in sync.
 */

import * as Tone from 'tone';

// ─── Utility: unwrap the underlying AudioNode from a Tone.Gain ────────────────
function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── Public interface ─────────────────────────────────────────────────────────
export interface ToneArmOptions {
  /** 0-1  slow pitch wobble (one rotation per revolution) */
  wow?:     number;
  /** 0-1  cartridge non-linearity (Faraday induction distortion) */
  coil?:    number;
  /** 0-1  fast AM wobble (~10 Hz at 33 rpm) */
  flutter?: number;
  /** 0-1  RIAA playback EQ blend */
  riaa?:    number;
  /** 0-1  stylus HF rolloff (0 = 4.5 kHz, 1 = 1 kHz) */
  stylus?:  number;
  /** 0-1  surface hiss level */
  hiss?:    number;
  /** 0-1  pop/click density */
  pops?:    number;
  /** 33.333 | 45 | 78 — turntable speed in RPM */
  rpm?:     number;
  /** 0-1  wet/dry */
  wet?:     number;
}

// ─── ToneArmEffect ────────────────────────────────────────────────────────────
export class ToneArmEffect extends Tone.ToneAudioNode {
  readonly name = 'ToneArm';
  readonly input:  Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain:    Tone.Gain;
  private wetGain:    Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;

  private _wow:     number;
  private _coil:    number;
  private _flutter: number;
  private _riaa:    number;
  private _stylus:  number;
  private _hiss:    number;
  private _pops:    number;
  private _rpm:     number;
  private _wet:     number;

  // One worklet registration per BaseAudioContext
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises   = new Map<BaseAudioContext, Promise<void>>();

  // ─── Constructor ────────────────────────────────────────────────────────────
  constructor(options: ToneArmOptions = {}) {
    super();

    this._wow     = options.wow     ?? 0.0;
    this._coil    = options.coil    ?? 0.5;
    this._flutter = options.flutter ?? 0.0;
    this._riaa    = options.riaa    ?? 0.5;
    this._stylus  = options.stylus  ?? 0.0;
    this._hiss    = options.hiss    ?? 0.0;
    this._pops    = options.pops    ?? 0.0;
    this._rpm     = options.rpm     ?? 33.333;
    this._wet     = options.wet     ?? 1.0;

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(this._wet);

    // Dry path bypasses worklet entirely
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this._initWorklet();
  }

  // ─── Worklet initialisation ─────────────────────────────────────────────────
  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await ToneArmEffect._ensureRegistered(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'tonearm-processor', {
        numberOfInputs:     1,
        numberOfOutputs:    1,
        outputChannelCount: [2],
      });

      // input → worklet → wetGain → output
      const rawInput = getRawNode(this.input);
      const rawWet   = getRawNode(this.wetGain);
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Push current state into the just-created worklet
      this._send('wow',     this._wow);
      this._send('coil',    this._coil);
      this._send('flutter', this._flutter);
      this._send('riaa',    this._riaa);
      this._send('stylus',  this._stylus);
      this._send('hiss',    this._hiss);
      this._send('pops',    this._pops);
      this._send('rpm',     this._rpm);
      this._send('wet',     this._wet);
    } catch (err) {
      console.error('[ToneArm] Worklet init failed:', err);
      // Fallback: wire input directly into wetGain so audio still passes through
      this.input.connect(this.wetGain);
    }
  }

  // ─── Registration (once per AudioContext) ───────────────────────────────────
  private static async _ensureRegistered(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;

    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      await ctx.audioWorklet.addModule(`${base}tonearm/ToneArm.worklet.js`);
      this.loadedContexts.add(ctx);
    })();

    this.initPromises.set(ctx, p);
    return p;
  }

  // ─── Internal message helper ─────────────────────────────────────────────────
  private _send(param: string, value: number): void {
    this.workletNode?.port.postMessage({ param, value });
  }

  // ─── Parameter setters ───────────────────────────────────────────────────────

  setWow(v: number): void {
    this._wow = clamp01(v);
    this._send('wow', this._wow);
  }

  setCoil(v: number): void {
    this._coil = clamp01(v);
    this._send('coil', this._coil);
  }

  setFlutter(v: number): void {
    this._flutter = clamp01(v);
    this._send('flutter', this._flutter);
  }

  setRiaa(v: number): void {
    this._riaa = clamp01(v);
    this._send('riaa', this._riaa);
  }

  setStylus(v: number): void {
    this._stylus = clamp01(v);
    this._send('stylus', this._stylus);
  }

  setHiss(v: number): void {
    this._hiss = clamp01(v);
    this._send('hiss', this._hiss);
  }

  setPops(v: number): void {
    this._pops = clamp01(v);
    this._send('pops', this._pops);
  }

  setRpm(v: number): void {
    this._rpm = v;
    this._send('rpm', this._rpm);
  }

  // ─── Wet / dry ───────────────────────────────────────────────────────────────
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp01(value);
    // Keep the wetGain node in sync (controls overall wet bus level)
    this.wetGain.gain.value = this._wet;
    // Also forward to worklet so its per-sample wet/dry crossfade matches
    this._send('wet', this._wet);
  }

  // ─── Read-back accessors ─────────────────────────────────────────────────────
  get wow():     number { return this._wow;     }
  get coil():    number { return this._coil;    }
  get flutter(): number { return this._flutter; }
  get riaa():    number { return this._riaa;    }
  get stylus():  number { return this._stylus;  }
  get hiss():    number { return this._hiss;    }
  get pops():    number { return this._pops;    }
  get rpm():     number { return this._rpm;     }

  // ─── Dispose ─────────────────────────────────────────────────────────────────
  dispose(): this {
    try { this.workletNode?.disconnect(); } catch { /**/ }
    this.workletNode = null;
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
