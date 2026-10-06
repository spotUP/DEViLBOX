/**
 * PerChannelDubFx — lightweight per-channel effect chain inserted on each
 * channel's send path into the shared DubBus, before the signals mix.
 *
 * Signal graph:
 *
 *   input
 *     ├─→ reverbSendGain ──────────────────────────────→ reverbOut (→ drySpringBus)
 *     └─→ shape slot (Off | High Pass | Low Pass | Ring Mod | Lo-fi | Wobble | Saturation)
 *           │      — ChannelShapeStage, one effect built only while chosen
 *           │
 *           ├─→ sweepDelay (DelayNode, LFO-modulated)
 *           │     ↑ ← feedbackHpf ← feedback (loop)
 *           │     ↓
 *           │   sweepWet (gain = sweepAmount)  ─────────→ mainOut
 *           │
 *           └─→ sweepDry (gain = 1.0, additive with wet) → mainOut
 *
 * Pure Web Audio apart from the shape slot's Ring Mod and Lo-fi worklets,
 * which exist only while a channel has one of them chosen.
 *
 * The comb sweep (LFO, modulated delay, feedback loop) exists only while its
 * wet amount is above zero. An OscillatorNode and a loop through a DelayNode
 * never go silent, so Chrome processes everything behind them every quantum:
 * built for every channel slot up front, 32 of each ran with the song stopped
 * (2026-09-28). It is built when a sweep engages and torn down once it has
 * ramped back to zero.
 */
import { ChannelShapeStage } from './ChannelShapeStage';
import { buildModulatedDelay, type ModulatedDelay } from './modulatedDelay';
import type { ChannelShapeKind } from '@/lib/dub/channelShape';

interface SweepSection extends ModulatedDelay {
  feedback: GainNode;
  feedbackHpf: BiquadFilterNode;
  wet: GainNode;
}

/** How long after a sweep reaches zero its nodes are released. */
const SWEEP_TEARDOWN_MS = 400;

export class PerChannelDubFx {
  /** Receives audio from channelDubGain[ch]. */
  readonly input: GainNode;
  /** Routes to DubBus.input (through echo + spring). */
  readonly mainOut: GainNode;
  /** Routes to DubBus.drySpringBus (bypasses echo, feeds spring directly). */
  readonly reverbOut: GainNode;

  private readonly ctx: AudioContext;
  /** The shape slot's output: what the dry path and the comb sweep hear. */
  private readonly shaped: GainNode;
  readonly shape: ChannelShapeStage;
  private readonly sweepDry: GainNode;
  private readonly reverbSendGain: GainNode;
  private sweep: SweepSection | null = null;
  private sweepTeardown: ReturnType<typeof setTimeout> | null = null;
  private sweepAmount = 0;
  private sweepRateHz = 0.8;
  private sweepDepthSec = 0.008;
  private sweepFeedbackAmount = 0.5;
  private _disposed = false;

  constructor(
    ctx: AudioContext,
    dubBusInput: AudioNode,
    drySpringBus: AudioNode,
  ) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.input.gain.value = 1;

    this.mainOut = ctx.createGain();
    this.mainOut.gain.value = 1;

    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 1;

    // ─── Reverb send (bypasses echo, goes to spring directly) ────────────
    this.reverbSendGain = ctx.createGain();
    this.reverbSendGain.gain.value = 0; // off by default
    this.input.connect(this.reverbSendGain);
    this.reverbSendGain.connect(this.reverbOut);
    this.reverbOut.connect(drySpringBus);

    // ─── Shape slot (Off = straight through) ──────────────────────────────
    this.shaped = ctx.createGain();
    this.shaped.gain.value = 1;
    this.shape = new ChannelShapeStage(ctx, this.input, this.shaped, this.mainOut.gain);

    // ─── Dry path: shape → sweepDry → mainOut (always present) ───────────
    this.sweepDry = ctx.createGain();
    this.sweepDry.gain.value = 1;
    this.shaped.connect(this.sweepDry);
    this.sweepDry.connect(this.mainOut);

    // ─── Final output ─────────────────────────────────────────────────────
    this.mainOut.connect(dubBusInput);
  }

  /** Whether the comb-sweep nodes currently exist (tests, diagnostics). */
  get sweepBuilt(): boolean {
    return this.sweep !== null;
  }

  /** Build the comb sweep: shape → delay (LFO-modulated, feedback) → wet → mainOut. */
  private buildSweep(): SweepSection {
    const ctx = this.ctx;
    const head = buildModulatedDelay(ctx, {
      maxDelaySec: 0.02,  // max 20 ms
      centreSec: 0.005,   // 5 ms centre
      rateHz: this.sweepRateHz,
      depthSec: this.sweepDepthSec,
    });
    const { delay } = head;

    const feedbackHpf = ctx.createBiquadFilter();
    feedbackHpf.type = 'highpass';
    feedbackHpf.frequency.value = 200;
    feedbackHpf.Q.value = 0.707;
    const feedback = ctx.createGain();
    feedback.gain.value = this.sweepFeedbackAmount;
    delay.connect(feedbackHpf);
    feedbackHpf.connect(feedback);
    feedback.connect(delay); // loop

    const wet = ctx.createGain();
    wet.gain.value = 0; // ramps up from silence
    this.shaped.connect(delay);
    delay.connect(wet);
    wet.connect(this.mainOut);
    return { ...head, feedback, feedbackHpf, wet };
  }

  private releaseSweep(): void {
    const sw = this.sweep;
    if (!sw) return;
    this.sweep = null;
    try { this.shaped.disconnect(sw.delay); } catch { /* ok */ }
    sw.release();
    for (const n of [sw.feedbackHpf, sw.feedback, sw.wet]) {
      try { n.disconnect(); } catch { /* ok */ }
    }
  }

  // ─── Shape slot ────────────────────────────────────────────────────────

  /** Put the channel's shape slot at `kind` (its main parameter at `value`). */
  setShape(kind: ChannelShapeKind, value?: number): void {
    if (this._disposed) return;
    this.shape.set(kind, value);
  }

  // ─── Reverb send ───────────────────────────────────────────────────────

  setReverbSend(amount: number): void {
    if (this._disposed) return;
    const clamped = Math.max(0, Math.min(1, amount));
    this.reverbSendGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
  }

  // ─── Comb sweep ────────────────────────────────────────────────────────

  setSweepAmount(amount: number): void {
    if (this._disposed) return;
    const clamped = Math.max(0, Math.min(1, amount));
    this.sweepAmount = clamped;
    if (clamped > 0) {
      if (this.sweepTeardown) { clearTimeout(this.sweepTeardown); this.sweepTeardown = null; }
      if (!this.sweep) this.sweep = this.buildSweep();
      this.sweep.wet.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
      return;
    }
    if (!this.sweep) return;
    this.sweep.wet.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    if (this.sweepTeardown) clearTimeout(this.sweepTeardown);
    // Release once the ramp has reached silence, unless re-engaged meanwhile.
    this.sweepTeardown = setTimeout(() => {
      this.sweepTeardown = null;
      if (!this._disposed && this.sweepAmount === 0) this.releaseSweep();
    }, SWEEP_TEARDOWN_MS);
  }

  setSweepRate(hz: number): void {
    if (this._disposed) return;
    this.sweepRateHz = Math.max(0.05, Math.min(5, hz));
    this.sweep?.lfo.frequency.setTargetAtTime(this.sweepRateHz, this.ctx.currentTime, 0.05);
  }

  setSweepDepth(ms: number): void {
    if (this._disposed) return;
    this.sweepDepthSec = Math.max(0, Math.min(10, ms)) / 1000;
    this.sweep?.lfoGain.gain.setTargetAtTime(this.sweepDepthSec, this.ctx.currentTime, 0.05);
  }

  setSweepFeedback(amount: number): void {
    if (this._disposed) return;
    this.sweepFeedbackAmount = Math.max(0, Math.min(0.9, amount));
    this.sweep?.feedback.gain.setTargetAtTime(this.sweepFeedbackAmount, this.ctx.currentTime, 0.02);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.sweepTeardown) { clearTimeout(this.sweepTeardown); this.sweepTeardown = null; }
    this.releaseSweep();
    this.shape.dispose();
    const nodes = [
      this.input, this.mainOut, this.reverbOut, this.shaped,
      this.sweepDry, this.reverbSendGain,
    ];
    for (const n of nodes) { try { n.disconnect(); } catch { /* ok */ } }
  }
}
