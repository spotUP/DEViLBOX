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

  setFilterMode(mode: 'off' | 'hpf' | 'lpf'): void {
    if (this._disposed) return;
    if (mode === 'off') {
      this.filter.type = 'allpass';
    } else if (mode === 'hpf') {
      this.filter.type = 'highpass';
    } else {
      this.filter.type = 'lowpass';
    }
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
