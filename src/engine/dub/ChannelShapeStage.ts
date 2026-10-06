/**
 * ChannelShapeStage — the per-channel sound-shaping slot on a channel's dub
 * send (see `lib/dub/channelShape.ts` for the kinds and their parameter).
 *
 *   input ──(Off: straight through)──────────────────→ output
 *   input ──→ [High Pass | Low Pass | Ring Mod | Lo-fi | Wobble | Saturation] → output
 *
 * One effect at a time, built when chosen and torn down when the slot moves
 * to another kind or to Off, so an idle channel costs nothing. The DSP is the
 * bus's own: Ring Mod is the `RingModEffect` worklet the bus Ring move uses,
 * Lo-fi the `BittaEffect` crusher behind Starve, Saturation the tape curve of
 * the bus TapeSat stage (`makeTapeSatCurve`), Wobble the moving tape head
 * (`buildModulatedDelay`) the channel comb sweep is built on. The bus Wobble
 * swings the ECHO's delay time, which a single channel's send does not have,
 * so the channel wobble moves its own head instead.
 *
 * Swapping kinds rewires the graph, which is a discontinuity, so the swap
 * happens inside a ~6 ms duck of `duck` — the same treatment the old filter
 * dropdown got for its click (2026-09-21).
 */
import * as Tone from 'tone';
import { RingModEffect } from '../effects/RingModEffect';
import { BittaEffect } from '../effects/BittaEffect';
import { makeTapeSatCurve } from '@/lib/dub/tapeSatCurve';
import { buildModulatedDelay } from './modulatedDelay';
import {
  CHANNEL_WOBBLE_RATE_HZ,
  clampChannelShapeValue,
  type ChannelShapeKind,
} from '@/lib/dub/channelShape';

interface ActiveShape {
  setValue(value: number): void;
  release(): void;
}

const DUCK_SEC = 0.006;
/** Wobble head centre: must exceed the deepest swing (8 ms). */
const WOBBLE_CENTRE_SEC = 0.01;

export class ChannelShapeStage {
  private readonly ctx: BaseAudioContext;
  private readonly input: AudioNode;
  private readonly output: AudioNode;
  private readonly duck: AudioParam;
  private _kind: ChannelShapeKind = 'off';
  private _value = 0;
  private active: ActiveShape | null = null;
  private targetKind: ChannelShapeKind = 'off';
  private targetValue = 0;
  private swapTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** How many effects this stage has built (diagnostics, reachability tests). */
  builds = 0;

  constructor(ctx: BaseAudioContext, input: AudioNode, output: AudioNode, duck: AudioParam) {
    this.ctx = ctx;
    this.input = input;
    this.output = output;
    this.duck = duck;
    input.connect(output);
  }

  /** The kind in the graph now (a pending swap shows once it lands). */
  get kind(): ChannelShapeKind { return this._kind; }
  get value(): number { return this._value; }
  /** Whether an effect's nodes exist (false for Off). */
  get built(): boolean { return this.active !== null; }

  set(kind: ChannelShapeKind, value?: number): void {
    if (this.disposed) return;
    const v = clampChannelShapeValue(kind, value);
    this.targetKind = kind;
    this.targetValue = v;
    if (this.swapTimer) return; // the pending swap applies the latest target
    if (kind === this._kind) {
      this._value = v;
      this.active?.setValue(v);
      return;
    }
    const now = this.ctx.currentTime;
    try {
      this.duck.cancelScheduledValues(now);
      this.duck.setValueAtTime(this.duck.value, now);
      this.duck.linearRampToValueAtTime(0, now + DUCK_SEC);
    } catch { /* a click is better than a dead channel */ }
    this.swapTimer = setTimeout(() => {
      this.swapTimer = null;
      if (this.disposed) return;
      this.swapTo(this.targetKind, this.targetValue);
      const back = this.ctx.currentTime;
      try {
        this.duck.cancelScheduledValues(back);
        this.duck.setValueAtTime(0, back);
        this.duck.linearRampToValueAtTime(1, back + DUCK_SEC);
      } catch { /* ok */ }
    }, Math.ceil(DUCK_SEC * 1000) + 2);
  }

  private swapTo(kind: ChannelShapeKind, value: number): void {
    if (this.active) {
      this.active.release();
      this.active = null;
    } else {
      try { this.input.disconnect(this.output); } catch { /* ok */ }
    }
    this._kind = kind;
    this._value = value;
    if (kind === 'off') {
      this.input.connect(this.output);
      return;
    }
    try {
      this.active = this.build(kind, value);
      this.builds++;
    } catch (err) {
      console.warn(`[ChannelShapeStage] ${kind} could not be built, passing through:`, err);
      this.active = null;
      this._kind = 'off';
      this.input.connect(this.output);
    }
  }

  private build(kind: Exclude<ChannelShapeKind, 'off'>, value: number): ActiveShape {
    const ctx = this.ctx;
    const { input, output } = this;
    switch (kind) {
      case 'hpf':
      case 'lpf': {
        const f = ctx.createBiquadFilter();
        f.type = kind === 'hpf' ? 'highpass' : 'lowpass';
        f.Q.value = 0.707;
        f.frequency.value = value;
        input.connect(f);
        f.connect(output);
        return {
          setValue: (hz) => f.frequency.setTargetAtTime(hz, ctx.currentTime, 0.02),
          release: () => { try { input.disconnect(f); } catch { /* ok */ } try { f.disconnect(); } catch { /* ok */ } },
        };
      }
      case 'ringMod': {
        const fx = new RingModEffect({ frequency: value, mix: 1, wet: 1 });
        Tone.connect(input as unknown as Tone.OutputNode, fx.input);
        Tone.connect(fx.output, output as unknown as Tone.InputNode);
        return {
          setValue: (hz) => fx.setFrequency(hz),
          release: () => { try { Tone.disconnect(input as unknown as Tone.OutputNode, fx.input); } catch { /* ok */ } try { fx.dispose(); } catch { /* ok */ } },
        };
      }
      case 'lofi': {
        const fx = new BittaEffect({ crush: value, mix: 1, wet: 1 });
        Tone.connect(input as unknown as Tone.OutputNode, fx.input);
        Tone.connect(fx.output, output as unknown as Tone.InputNode);
        return {
          setValue: (bits) => fx.setCrush(bits),
          release: () => { try { Tone.disconnect(input as unknown as Tone.OutputNode, fx.input); } catch { /* ok */ } try { fx.dispose(); } catch { /* ok */ } },
        };
      }
      case 'wobble': {
        const head = buildModulatedDelay(ctx, {
          maxDelaySec: 0.03,
          centreSec: WOBBLE_CENTRE_SEC,
          rateHz: CHANNEL_WOBBLE_RATE_HZ,
          depthSec: value / 1000,
        });
        input.connect(head.delay);
        head.delay.connect(output);
        return {
          setValue: (ms) => head.lfoGain.gain.setTargetAtTime(ms / 1000, ctx.currentTime, 0.05),
          release: () => { try { input.disconnect(head.delay); } catch { /* ok */ } head.release(); },
        };
      }
      case 'saturation': {
        // The tape curve has unity small-signal gain, so a send-level signal
        // barely reaches its knee. Drive pushes the signal up the curve and
        // the make-up takes the same gain back off: the level stays put and
        // only the colour changes.
        const pre = ctx.createGain();
        const shaper = ctx.createWaveShaper();
        shaper.oversample = '2x';
        const post = ctx.createGain();
        const apply = (drive: number) => {
          const g = 1 + 7 * drive;
          shaper.curve = makeTapeSatCurve(drive);
          pre.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
          post.gain.setTargetAtTime(1 / g, ctx.currentTime, 0.02);
        };
        const g0 = 1 + 7 * value;
        pre.gain.value = g0;
        post.gain.value = 1 / g0;
        shaper.curve = makeTapeSatCurve(value);
        input.connect(pre);
        pre.connect(shaper);
        shaper.connect(post);
        post.connect(output);
        return {
          setValue: apply,
          release: () => { try { input.disconnect(pre); } catch { /* ok */ } for (const n of [pre, shaper, post]) { try { n.disconnect(); } catch { /* ok */ } } },
        };
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.swapTimer) { clearTimeout(this.swapTimer); this.swapTimer = null; }
    this.active?.release();
    this.active = null;
    try { this.input.disconnect(this.output); } catch { /* ok */ }
  }
}
