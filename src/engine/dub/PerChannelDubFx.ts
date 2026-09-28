/**
 * PerChannelDubFx — lightweight per-channel effect chain inserted on each
 * channel's send path into the shared DubBus, before the signals mix.
 *
 * Signal graph:
 *
 *   input
 *     ├─→ reverbSendGain ──────────────────────────────→ reverbOut (→ drySpringBus)
 *     └─→ filter (allpass | highpass | lowpass)
 *           │
 *           ├─→ sweepDelay (DelayNode, LFO-modulated)
 *           │     ↑ ← feedbackHpf ← feedback (loop)
 *           │     ↓
 *           │   sweepWet (gain = sweepAmount)  ─────────→ mainOut
 *           │
 *           └─→ sweepDry (gain = 1.0, additive with wet) → mainOut
 *
 * Pure Web Audio — no WASM. About 10 AudioNodes per instance.
 *
 * The comb sweep (LFO, modulated delay, feedback loop) exists only while its
 * wet amount is above zero. An OscillatorNode and a loop through a DelayNode
 * never go silent, so Chrome processes everything behind them every quantum:
 * built for every channel slot up front, 32 of each ran with the song stopped
 * (2026-09-28). It is built when a sweep engages and torn down once it has
 * ramped back to zero.
 */

interface SweepSection {
  delay: DelayNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
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
  private readonly filter: BiquadFilterNode;
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

    // ─── Filter (off = allpass, effectively transparent) ─────────────────
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'allpass';
    this.filter.frequency.value = 350;
    this.filter.Q.value = 0.707;
    this.input.connect(this.filter);

    // ─── Dry path: filter → sweepDry → mainOut (always present) ──────────
    this.sweepDry = ctx.createGain();
    this.sweepDry.gain.value = 1;
    this.filter.connect(this.sweepDry);
    this.sweepDry.connect(this.mainOut);

    // ─── Final output ─────────────────────────────────────────────────────
    this.mainOut.connect(dubBusInput);
  }

  /** Whether the comb-sweep nodes currently exist (tests, diagnostics). */
  get sweepBuilt(): boolean {
    return this.sweep !== null;
  }

  /** Build the comb sweep: filter → delay (LFO-modulated, feedback) → wet → mainOut. */
  private buildSweep(): SweepSection {
    const ctx = this.ctx;
    const delay = ctx.createDelay(0.02); // max 20 ms
    delay.delayTime.value = 0.005;       // 5 ms centre

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = this.sweepRateHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = this.sweepDepthSec;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

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
    this.filter.connect(delay);
    delay.connect(wet);
    wet.connect(this.mainOut);
    return { delay, lfo, lfoGain, feedback, feedbackHpf, wet };
  }

  private releaseSweep(): void {
    const sw = this.sweep;
    if (!sw) return;
    this.sweep = null;
    try { sw.lfo.stop(); } catch { /* ok */ }
    try { this.filter.disconnect(sw.delay); } catch { /* ok */ }
    for (const n of [sw.lfo, sw.lfoGain, sw.delay, sw.feedbackHpf, sw.feedback, sw.wet]) {
      try { n.disconnect(); } catch { /* ok */ }
    }
  }

  // ─── Filter ────────────────────────────────────────────────────────────

  /**
   * Changing a BiquadFilterNode's `type` swaps its coefficients between one
   * sample and the next while the filter keeps its internal state, so the
   * output jumps — an audible click. Every other setter in this class ramps;
   * this one could not, because `type` is not an AudioParam.
   *
   * So duck the channel around the change instead: ~6ms down, switch in the
   * silence, ~6ms back. Short enough to feel instant on a dropdown, long enough
   * that the discontinuity happens at zero. Also covers the Hz slider, which
   * calls this on every pointer event.
   *
   * Reported 2026-09-21 as clicks when firing things.
   */
  setFilterMode(mode: 'off' | 'hpf' | 'lpf'): void {
    if (this._disposed) return;
    const next = mode === 'off' ? 'allpass' : mode === 'hpf' ? 'highpass' : 'lowpass';
    if (this.filter.type === next) return;   // nothing to duck for

    const DUCK_SEC = 0.006;
    const g = this.mainOut.gain;
    const now = this.ctx.currentTime;
    const restore = g.value;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + DUCK_SEC);
    } catch { /* fall through — a click is better than a dead channel */ }

    setTimeout(() => {
      if (this._disposed) return;
      this.filter.type = next;
      const back = this.ctx.currentTime;
      try {
        g.cancelScheduledValues(back);
        g.setValueAtTime(0, back);
        g.linearRampToValueAtTime(restore, back + DUCK_SEC);
      } catch { /* ok */ }
    }, Math.ceil(DUCK_SEC * 1000) + 2);
  }

  setFilterHz(hz: number): void {
    if (this._disposed) return;
    const clamped = Math.max(20, Math.min(20000, hz));
    this.filter.frequency.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
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
    const nodes = [
      this.input, this.mainOut, this.reverbOut, this.filter,
      this.sweepDry, this.reverbSendGain,
    ];
    for (const n of nodes) { try { n.disconnect(); } catch { /* ok */ } }
  }
}
