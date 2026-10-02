import * as Tone from 'tone';
import { rampDryWet } from './rampParam';

export interface SpaceEchoOptions {
  mode?: number;        // 1-12
  rate?: number;        // Delay time (ms)
  intensity?: number;   // Feedback (0-1.2)
  echoVolume?: number;  // 0-1
  reverbVolume?: number;// 0-1
  bass?: number;        // EQ low band (-20 to +20)
  mid?: number;         // EQ mid band (-20 to +20) — the "tape degrade" character
  treble?: number;      // EQ high band (-20 to +20)
  wow?: number;         // Wow/Flutter amount (0-1)
  wet?: number;         // 0-1
  /** In-feedback HPF cutoff (Hz). Prevents low-end buildup per repeat.
   *  RE-201 characteristic: each pass clips bass rumble. Default 250 Hz. */
  feedbackHpfHz?: number;
  /** In-feedback LPF cutoff (Hz). Darkens each repeat progressively.
   *  Simulates tape-head wear — high repeats become warm/dark. Default 4000 Hz. */
  feedbackLpfHz?: number;
}

/**
 * Roland RE-201 Space Echo Emulation
 * 
 * Architecture:
 * - 3 Tape Heads (Delay nodes) at fixed ratios (1x, 2x, 3x)
 * - Spring Reverb
 * - 12-Mode Selector logic
 * - Tape Saturation & Filtering in feedback loop
 * - Wow/Flutter via LFO modulation acting on all heads
 */
function nativeBiquad(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = 1;
  return f;
}

/** Tone's frequency rampTo: exponential from the current value. */
function rampFrequency(param: AudioParam, value: number, seconds: number, t: number): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(Math.max(1, param.value), t);
  param.exponentialRampToValueAtTime(Math.max(1, value), t + seconds);
}

const dbToGain = (db: number): number => Math.pow(10, db / 20);

/**
 * Tone.EQ3 built from native nodes: the same crossover (lowpass at the low
 * frequency; highpass at the low into lowpass at the high frequency; highpass
 * at the high frequency; single biquads, Q 1) into three gains in dB.
 */
class NativeEQ3 {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly lowGain: GainNode;
  private readonly midGain: GainNode;
  private readonly highGain: GainNode;
  private readonly nodes: AudioNode[];

  constructor(ctx: BaseAudioContext, o: { low: number; mid: number; high: number; lowFrequency: number; highFrequency: number }) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const low = nativeBiquad(ctx, 'lowpass', o.lowFrequency);
    const lowMid = nativeBiquad(ctx, 'highpass', o.lowFrequency);
    const mid = nativeBiquad(ctx, 'lowpass', o.highFrequency);
    const high = nativeBiquad(ctx, 'highpass', o.highFrequency);
    this.lowGain = ctx.createGain();
    this.midGain = ctx.createGain();
    this.highGain = ctx.createGain();
    this.lowGain.gain.value = dbToGain(o.low);
    this.midGain.gain.value = dbToGain(o.mid);
    this.highGain.gain.value = dbToGain(o.high);
    this.input.connect(low).connect(this.lowGain).connect(this.output);
    this.input.connect(lowMid).connect(mid).connect(this.midGain).connect(this.output);
    this.input.connect(high).connect(this.highGain).connect(this.output);
    this.nodes = [this.input, low, lowMid, mid, high, this.lowGain, this.midGain, this.highGain, this.output];
  }

  setLow(db: number): void { this.lowGain.gain.value = dbToGain(db); }
  setMid(db: number): void { this.midGain.gain.value = dbToGain(db); }
  setHigh(db: number): void { this.highGain.gain.value = dbToGain(db); }

  disconnect(): void {
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ok */ } }
  }
}

export class SpaceEchoEffect extends Tone.ToneAudioNode {
  readonly name = 'SpaceEcho';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Tape Heads
  private head1: Tone.Delay;
  private head2: Tone.Delay;
  private head3: Tone.Delay;
  
  private head1Gain: Tone.Gain;
  private head2Gain: Tone.Gain;
  private head3Gain: Tone.Gain;

  private feedbackGain: Tone.Gain;
  private saturation: Tone.Distortion;
  private eq: NativeEQ3;
  private feedbackHpf: BiquadFilterNode;
  private feedbackLpf: BiquadFilterNode;
  
  private reverb: Tone.Reverb;
  private reverbGain: Tone.Gain;
  private echoGain: Tone.Gain;

  private wowLFO: OscillatorNode;
  private wowDepth: GainNode;
  private wowGain: Tone.Gain;

  // Dry/Wet
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private _wetPathGain = 1;

  // Internal State
  private _options: Required<SpaceEchoOptions>;

  constructor(options: Partial<SpaceEchoOptions> = {}) {
    super();

    this._options = {
      mode: options.mode ?? 4,
      rate: options.rate ?? 300,
      intensity: options.intensity ?? 0.5,
      echoVolume: options.echoVolume ?? 0.8,
      reverbVolume: options.reverbVolume ?? 0.3,
      // Analog-tape feedback-loop EQ — gentle per-pass attenuation on
      // extremes (lows rumble, highs "tape-age"), mid neutral so the
      // tail decays at the natural feedback rate (~-4 dB/pass at
      // intensity 0.62, reaching -60 dB in ~15 passes ≈ 4.5 s). Earlier
      // values (bass -4, mid +5, treble -7) made mid content GAIN 1 dB
      // per pass → runaway oscillation; +2 gave a 9 s mid-tail. These
      // defaults produce a clean decay with analog-tape color.
      bass: options.bass ?? -2,
      mid: options.mid ?? 0,
      treble: options.treble ?? -3,
      wow: options.wow ?? 0.15,
      wet: options.wet ?? 1,
      feedbackHpfHz: options.feedbackHpfHz ?? 250,
      feedbackLpfHz: options.feedbackLpfHz ?? 4000,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // 1. Tape Heads (maxDelay=5s to allow rate*3 at full range)
    this.head1 = new Tone.Delay({ delayTime: this._options.rate / 1000, maxDelay: 5 });
    this.head2 = new Tone.Delay({ delayTime: (this._options.rate * 2) / 1000, maxDelay: 5 });
    this.head3 = new Tone.Delay({ delayTime: (this._options.rate * 3) / 1000, maxDelay: 5 });

    this.head1Gain = new Tone.Gain(0);
    this.head2Gain = new Tone.Gain(0);
    this.head3Gain = new Tone.Gain(0);

    // 2. Reverb
    this.reverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01 });
    this.reverb.generate(); 
    this.reverbGain = new Tone.Gain(this._options.reverbVolume);

    this.echoGain = new Tone.Gain(this._options.echoVolume);

    // 3. Feedback Loop — clamp at construction so the initial gain can never
    // exceed unity regardless of what options were passed.
    this.feedbackGain = new Tone.Gain(Math.max(0, Math.min(0.95, this._options.intensity)));
    this.saturation = new Tone.Distortion(0.1);
    // Native nodes, not Tone.EQ3 / Tone.Filter / Tone.LFO: those drive every
    // filter frequency, Q, detune and gain from an always-running
    // ConstantSource (34 in this effect), which keeps the whole echo graph
    // computing per-sample coefficients even in silence — about 9 % of the
    // audio thread with nothing playing (2026-09-28). The nodes, types,
    // frequencies and Q values are the ones Tone built, so the sound is the same.
    const raw = this.context.rawContext as unknown as BaseAudioContext;
    this.eq = new NativeEQ3(raw, {
      low: this._options.bass,
      mid: this._options.mid,
      high: this._options.treble,
      lowFrequency: 200,
      highFrequency: 2500,
    });
    // Dedicated HPF + LPF in the feedback path — the RE-201's tape-head
    // characteristic. HPF strips sub rumble that accumulates each pass;
    // LPF darkens each repeat (simulates tape-head wear + head-to-tape
    // distance). Together they ensure repeats decay cleanly rather than
    // building bass mud or staying unnaturally bright.
    this.feedbackHpf = nativeBiquad(raw, 'highpass', this._options.feedbackHpfHz);
    this.feedbackLpf = nativeBiquad(raw, 'lowpass', this._options.feedbackLpfHz);

    // 4. Modulation — a sine of +-2 ms scaled by the wow amount.
    this.wowLFO = raw.createOscillator();
    this.wowLFO.type = 'sine';
    this.wowLFO.frequency.value = 0.5 + Math.random() * 0.2;
    this.wowDepth = raw.createGain();
    this.wowDepth.gain.value = 0.002;
    this.wowGain = new Tone.Gain(this._options.wow);
    this.wowLFO.connect(this.wowDepth);
    Tone.connect(this.wowDepth, this.wowGain);
    this.wowLFO.start();

    this.wowGain.connect(this.head1.delayTime);
    this.wowGain.connect(this.head2.delayTime);
    this.wowGain.connect(this.head3.delayTime);

    // 5. Dry/Wet
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // signal routing
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.head1);
    this.input.connect(this.head2);
    this.input.connect(this.head3);
    this.input.connect(this.reverb);

    this.head1.connect(this.head1Gain);
    this.head2.connect(this.head2Gain);
    this.head3.connect(this.head3Gain);

    const echoSum = new Tone.Gain(1);
    this.head1Gain.connect(echoSum);
    this.head2Gain.connect(echoSum);
    this.head3Gain.connect(echoSum);

    echoSum.connect(this.echoGain);
    Tone.connect(this.echoGain, this.eq.input);

    Tone.connect(this.eq.output, this.saturation);
    Tone.connect(this.saturation, this.feedbackHpf);
    this.feedbackHpf.connect(this.feedbackLpf);
    Tone.connect(this.feedbackLpf, this.feedbackGain);
    this.feedbackGain.connect(this.head1);
    this.feedbackGain.connect(this.head2);
    this.feedbackGain.connect(this.head3);

    this.reverb.connect(this.reverbGain);

    Tone.connect(this.eq.output, this.wetGain);
    this.reverbGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.setMode(this._options.mode);
  }

  setMode(mode: number) {
    this._options.mode = mode;
    const h1 = [1, 5, 8, 10, 11].includes(mode);
    const h2 = [2, 4, 6, 8, 9, 11].includes(mode);
    const h3 = [3, 4, 7, 9, 10, 11].includes(mode);

    // Normalize by active head count so the sum into the feedback loop is
    // always 1.0 regardless of how many heads are active. Without this,
    // each additional head adds another copy of the signal — with 2 heads
    // the sum is 2× and loop gain = 2 × echoGain × feedbackGain, which
    // exceeds 1.0 at any moderate feedback setting and causes exponential
    // growth ("eating up" the mix). N heads → each head gain = 1/N.
    const activeCount = [h1, h2, h3].filter(Boolean).length || 1;
    const headGain = 1 / activeCount;
    this.head1Gain.gain.rampTo(h1 ? headGain : 0, 0.1);
    this.head2Gain.gain.rampTo(h2 ? headGain : 0, 0.1);
    this.head3Gain.gain.rampTo(h3 ? headGain : 0, 0.1);

    const reverbOn = mode >= 5;
    this.reverbGain.gain.rampTo(reverbOn ? this._options.reverbVolume : 0, 0.1);
  }

  setRate(ms: number) {
    this._options.rate = Math.max(10, Math.min(ms, 1500));
    this.head1.delayTime.rampTo(this._options.rate / 1000, 0.1);
    this.head2.delayTime.rampTo((this._options.rate * 2) / 1000, 0.1);
    this.head3.delayTime.rampTo((this._options.rate * 3) / 1000, 0.1);
  }

  /**
   * What the engine is actually running with. RE-201 has had this seam for a
   * while and SpaceEcho did not, so `DubBus.getLiveState()` read `null` for
   * the live delay time on the engine that ships by default — the one
   * parameter every throw, wobble and tape move actually moves. `rateMs` is
   * the real value off the delay node, not the stored option, because a
   * `rampTo` in flight is precisely what these diagnostics exist to show.
   */
  describe(): Record<string, unknown> {
    let liveRateMs: number | null = null;
    try {
      const seconds = this.head1.delayTime.getValueAtTime(this.context.currentTime);
      liveRateMs = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1000 : null;
    } catch { /* node not ready */ }
    return {
      ...this._options,
      rateMs: liveRateMs,
      delayTime: this._options.rate,
    };
  }

  setIntensity(amount: number) {
    const clamped = Math.max(0, Math.min(0.95, amount));
    this._options.intensity = clamped;
    this.feedbackGain.gain.rampTo(clamped, 0.1);
  }

  /**
   * Set feedback intensity with NO ramp — used by dubPanic so the delay
   * line stops recirculating the instant we decide to kill it. The normal
   * 0.1 s ramp was the tail that made dub echoes "linger forever" after
   * pad release + panic: during the ramp, feedback ≈0.9× per head, so a
   * 300 ms delay line kept looping audible audio for ~1 s even though
   * setIntensity(0) had already been called.
   */
  setIntensityInstant(amount: number) {
    const clamped = Math.max(0, Math.min(0.95, amount));
    this._options.intensity = clamped;
    const t = this.feedbackGain.context.currentTime;
    this.feedbackGain.gain.cancelScheduledValues(t);
    this.feedbackGain.gain.setValueAtTime(clamped, t);
  }

  setEchoVolume(vol: number) {
    this._options.echoVolume = vol;
    this.echoGain.gain.rampTo(vol, 0.1);
  }

  setReverbVolume(vol: number) {
    this._options.reverbVolume = vol;
    if (this._options.mode >= 5) {
      this.reverbGain.gain.rampTo(vol, 0.1);
    }
  }

  setBass(val: number) {
    this._options.bass = val;
    this.eq.setLow(val);
  }

  setMid(val: number) {
    this._options.mid = val;
    this.eq.setMid(val);
  }

  setFeedbackHpf(hz: number) {
    this._options.feedbackHpfHz = Math.max(20, Math.min(2000, hz));
    rampFrequency(this.feedbackHpf.frequency, this._options.feedbackHpfHz, 0.05, this.context.currentTime);
  }

  setFeedbackLpf(hz: number) {
    this._options.feedbackLpfHz = Math.max(500, Math.min(20000, hz));
    rampFrequency(this.feedbackLpf.frequency, this._options.feedbackLpfHz, 0.05, this.context.currentTime);
  }

  setTreble(val: number) {
    this._options.treble = val;
    this.eq.setHigh(val);
  }

  /** Level calibration of the wet signal (WET_PATH_GAIN_DB, or the dub bus's echo trim). */
  setWetPathGain(gain: number): void {
    this._wetPathGain = gain;
    this.wet = this.wet;
  }

  get wet(): number {
    return this._options.wet;
  }

  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    // Crossfaded, not stepped: the Echo Wet slider drives this on every pointer
    // event through DubBus.setSettings, so a bare assignment was one
    // discontinuity per pixel.
    rampDryWet(
      this.dryGain.gain,
      this.wetGain.gain,
      this._options.wet,
      this.dryGain.context.currentTime,
      undefined,
      this._wetPathGain,
    );
  }

  dispose(): this {
    super.dispose();
    this.head1.dispose();
    this.head2.dispose();
    this.head3.dispose();
    this.head1Gain.dispose();
    this.head2Gain.dispose();
    this.head3Gain.dispose();
    this.feedbackGain.dispose();
    this.feedbackHpf.disconnect();
    this.feedbackLpf.disconnect();
    this.reverb.dispose();
    this.reverbGain.dispose();
    this.echoGain.dispose();
    this.eq.disconnect();
    this.saturation.dispose();
    try { this.wowLFO.stop(); } catch { /* not started */ }
    this.wowLFO.disconnect();
    this.wowDepth.disconnect();
    this.wowGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}