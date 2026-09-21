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
 * sweep=0 → only dry signal to mainOut (no LFO processing overhead).
 */

export class PerChannelDubFx {
  /** Receives audio from channelDubGain[ch]. */
  readonly input: GainNode;
  /** Routes to DubBus.input (through echo + spring). */
  readonly mainOut: GainNode;
  /** Routes to DubBus.drySpringBus (bypasses echo, feeds spring directly). */
  readonly reverbOut: GainNode;

  private readonly ctx: AudioContext;
  private readonly filter: BiquadFilterNode;
  private readonly sweepDelay: DelayNode;
  private readonly sweepLfo: OscillatorNode;
  private readonly sweepLfoGain: GainNode;
  private readonly sweepFeedback: GainNode;
  private readonly feedbackHpf: BiquadFilterNode;
  private readonly sweepWet: GainNode;
  private readonly sweepDry: GainNode;
  private readonly reverbSendGain: GainNode;
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

    // ─── Comb sweep ───────────────────────────────────────────────────────
    // Dry path: filter → sweepDry → mainOut (always present, additive)
    this.sweepDry = ctx.createGain();
    this.sweepDry.gain.value = 1;
    this.filter.connect(this.sweepDry);
    this.sweepDry.connect(this.mainOut);

    // Delay node (LFO-modulated for comb effect)
    this.sweepDelay = ctx.createDelay(0.02); // max 20 ms
    this.sweepDelay.delayTime.value = 0.005; // 5ms center

    // LFO → delay time modulation
    this.sweepLfo = ctx.createOscillator();
    this.sweepLfo.type = 'sine';
    this.sweepLfo.frequency.value = 0.8; // Hz
    this.sweepLfoGain = ctx.createGain();
    this.sweepLfoGain.gain.value = 0.008; // 8ms depth (in seconds)
    this.sweepLfo.connect(this.sweepLfoGain);
    this.sweepLfoGain.connect(this.sweepDelay.delayTime);
    this.sweepLfo.start();

    // Feedback loop: delay → feedbackHpf → feedback gain → back to delay input
    this.feedbackHpf = ctx.createBiquadFilter();
    this.feedbackHpf.type = 'highpass';
    this.feedbackHpf.frequency.value = 200;
    this.feedbackHpf.Q.value = 0.707;
    this.sweepFeedback = ctx.createGain();
    this.sweepFeedback.gain.value = 0.5; // moderate feedback

    this.sweepDelay.connect(this.feedbackHpf);
    this.feedbackHpf.connect(this.sweepFeedback);
    this.sweepFeedback.connect(this.sweepDelay); // loop

    // Wet path: filter → sweepDelay → sweepWet → mainOut
    this.sweepWet = ctx.createGain();
    this.sweepWet.gain.value = 0; // off by default
    this.filter.connect(this.sweepDelay);
    this.sweepDelay.connect(this.sweepWet);
    this.sweepWet.connect(this.mainOut);

    // ─── Final output ─────────────────────────────────────────────────────
    this.mainOut.connect(dubBusInput);
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
    this.sweepWet.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
  }

  setSweepRate(hz: number): void {
    if (this._disposed) return;
    this.sweepLfo.frequency.setTargetAtTime(
      Math.max(0.05, Math.min(5, hz)), this.ctx.currentTime, 0.05
    );
  }

  setSweepDepth(ms: number): void {
    if (this._disposed) return;
    this.sweepLfoGain.gain.setTargetAtTime(
      Math.max(0, Math.min(10, ms)) / 1000, this.ctx.currentTime, 0.05
    );
  }

  setSweepFeedback(amount: number): void {
    if (this._disposed) return;
    this.sweepFeedback.gain.setTargetAtTime(
      Math.max(0, Math.min(0.9, amount)), this.ctx.currentTime, 0.02
    );
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    try { this.sweepLfo.stop(); } catch { /* ok */ }
    const nodes = [
      this.input, this.mainOut, this.reverbOut, this.filter,
      this.sweepDelay, this.sweepLfoGain, this.sweepFeedback, this.feedbackHpf,
      this.sweepWet, this.sweepDry, this.reverbSendGain,
    ];
    for (const n of nodes) { try { n.disconnect(); } catch { /* ok */ } }
    try { this.sweepLfo.disconnect(); } catch { /* ok */ }
  }
}
