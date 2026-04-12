/**
 * TapeDelayEffect — pure JS AudioWorklet tape delay.
 * DSP ported from cyrusasfa/TapeDelay (MIT, Cyrus Vahidi).
 * Original: JUCE RE-201 Space Echo / Echoplex inspired tape delay.
 * Completed with wow/flutter LFO, tape saturation, and tone filter.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface TapeDelayOptions {
  delayTime?:     number;  // 0–2 seconds
  feedback?:      number;  // 0–0.995
  mix?:           number;  // 0–1 dry/wet
  toneFreq?:      number;  // Hz, lowpass on feedback path
  drive?:         number;  // 0–1 tape saturation
  wowRate?:       number;  // Hz, slow wobble rate
  wowDepth?:      number;  // 0–1 wow amount
  flutterRate?:   number;  // Hz, fast wobble rate
  flutterDepth?:  number;  // 0–1 flutter amount
  wet?:           number;  // 0–1 effect level
}

export class TapeDelayEffect extends Tone.ToneAudioNode {
  readonly name = 'TapeDelay';
  readonly input:  Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _pendingParams = new Map<string, number>();

  private _delayTime:    number;
  private _feedback:     number;
  private _mix:          number;
  private _toneFreq:     number;
  private _drive:        number;
  private _wowRate:      number;
  private _wowDepth:     number;
  private _flutterRate:  number;
  private _flutterDepth: number;
  private _wet:          number;

  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: TapeDelayOptions = {}) {
    super();

    this._delayTime    = options.delayTime    ?? 0.3;
    this._feedback     = options.feedback     ?? 0.4;
    this._mix          = options.mix          ?? 0.5;
    this._toneFreq     = options.toneFreq     ?? 4000;
    this._drive        = options.drive        ?? 0;
    this._wowRate      = options.wowRate      ?? 0.5;
    this._wowDepth     = options.wowDepth     ?? 0;
    this._flutterRate  = options.flutterRate  ?? 6;
    this._flutterDepth = options.flutterDepth ?? 0;
    this._wet          = options.wet          ?? 1;

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(this._wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this._initWorklet();
  }

  private async _initWorklet() {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await TapeDelayEffect._ensureRegistered(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'tape-delay-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      const rawInput = getNativeAudioNode(this.input)!;
      const rawWet   = getNativeAudioNode(this.wetGain)!;
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Flush pending params
      for (const [param, value] of this._pendingParams) {
        this.workletNode.port.postMessage({ param, value });
      }
      this._pendingParams.clear();

      // Push all current params
      this._send('delayTime',    this._delayTime);
      this._send('feedback',     this._feedback);
      this._send('mix',          this._mix);
      this._send('toneFreq',     this._toneFreq);
      this._send('drive',        this._drive);
      this._send('wowRate',      this._wowRate);
      this._send('wowDepth',     this._wowDepth);
      this._send('flutterRate',  this._flutterRate);
      this._send('flutterDepth', this._flutterDepth);

    } catch (err) {
      console.error('[TapeDelay] Worklet init FAILED:', err);
      this.input.connect(this.wetGain);
    }
  }

  private static async _ensureRegistered(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      await ctx.audioWorklet.addModule(`${base}tapedelay/TapeDelay.worklet.js`);
      this.loadedContexts.add(ctx);
    })();

    this.initPromises.set(ctx, p);
    return p;
  }

  private _send(param: string, value: number) {
    if (!this.workletNode) {
      this._pendingParams.set(param, value);
      return;
    }
    this.workletNode.port.postMessage({ param, value });
  }

  // Parameter setters
  setDelayTime(v: number)    { this._delayTime    = Math.max(0, Math.min(2, v));     this._send('delayTime',    this._delayTime);    }
  setFeedback(v: number)     { this._feedback     = Math.max(0, Math.min(0.995, v)); this._send('feedback',     this._feedback);     }
  setMix(v: number)          { this._mix          = Math.max(0, Math.min(1, v));     this._send('mix',          this._mix);          }
  setToneFreq(v: number)     { this._toneFreq     = Math.max(200, Math.min(20000, v)); this._send('toneFreq',  this._toneFreq);     }
  setDrive(v: number)        { this._drive        = Math.max(0, Math.min(1, v));     this._send('drive',        this._drive);        }
  setWowRate(v: number)      { this._wowRate      = Math.max(0.1, Math.min(5, v));   this._send('wowRate',      this._wowRate);      }
  setWowDepth(v: number)     { this._wowDepth     = Math.max(0, Math.min(1, v));     this._send('wowDepth',     this._wowDepth);     }
  setFlutterRate(v: number)  { this._flutterRate  = Math.max(1, Math.min(20, v));    this._send('flutterRate',  this._flutterRate);  }
  setFlutterDepth(v: number) { this._flutterDepth = Math.max(0, Math.min(1, v));     this._send('flutterDepth', this._flutterDepth); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'delayTime':    this.setDelayTime(value); break;
      case 'feedback':     this.setFeedback(value); break;
      case 'mix':          this.setMix(value); break;
      case 'toneFreq':     this.setToneFreq(value); break;
      case 'drive':        this.setDrive(value); break;
      case 'wowRate':      this.setWowRate(value); break;
      case 'wowDepth':     this.setWowDepth(value); break;
      case 'flutterRate':  this.setFlutterRate(value); break;
      case 'flutterDepth': this.setFlutterDepth(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    try { this.workletNode?.disconnect(); } catch { /* */ }
    try { this.dryGain.dispose(); } catch { /* */ }
    try { this.wetGain.dispose(); } catch { /* */ }
    return super.dispose();
  }
}
