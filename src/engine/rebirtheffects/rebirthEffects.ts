/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * The four ReBirth effects as Tone nodes (re-rebirth src/audio/effects.js, compressor.js and the effect
 * parts of engine.js). Each has a dry/wet pair, `setParam(name, value)` with the original 0..1 knobs, and
 * `dispose()`. The registry (src/engine/registry/effects/rebirth.ts) builds them.
 */
import * as Tone from 'tone';
import {
  COMP_KNEE_DB, COMP_OFFSET_DB, DELAY_STEPS, DIST, PCF_ENV_OCTAVES, choiceIndex, clamp01, compCurve, curve,
  delayTime, distSettings, foldCurve, panPos, pcfDecay, pcfShape,
} from './rebirthFxDsp';
import { PCF_SLOTS, PCF_WAVES, PCF_WAVE_COUNT } from './rebirthPcfWaves';
import { COMPRESSOR_PROCESSOR, loadRebirthCompressor } from './rebirthCompressorWorklet';

export type RebirthParams = Record<string, number>;
const p = (o: RebirthParams, k: string, d: number): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? o[k] : d);

/** Shared dry/wet pair around a processed path. */
abstract class RebirthFx extends Tone.ToneAudioNode {
  abstract readonly name: string;
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  protected readonly dry = new Tone.Gain(0);
  protected readonly wetGain = new Tone.Gain(1);
  protected readonly raw: BaseAudioContext = Tone.getContext().rawContext as BaseAudioContext;
  protected params: RebirthParams = {};
  private _wet = 1;

  protected constructor() {
    super();
    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.wetGain.connect(this.output);
  }

  get wet(): number { return this._wet; }
  set wet(v: number) {
    this._wet = clamp01(v);
    this.dry.gain.value = 1 - this._wet;
    this.wetGain.gain.value = this._wet;
  }

  abstract apply(): void;

  setParam(name: string, value: number): void {
    if (name === 'wet') { this.wet = value > 1 ? value / 100 : value; return; }
    this.params[name] = value;
    this.apply();
  }

  dispose(): this {
    super.dispose();
    for (const n of [this.input, this.output, this.dry, this.wetGain]) n.dispose();
    return this;
  }
}

function onePoleLowpass(ctx: BaseAudioContext, hz: number): IIRFilterNode {
  const pole = Math.exp((-2 * Math.PI * hz) / ctx.sampleRate);
  return ctx.createIIRFilter([1 - pole], [1, -pole]);
}

// ---------- distortion ----------
export class RebirthDistortion extends RebirthFx {
  readonly name = 'RebirthDistortion';
  private readonly driveClip: GainNode;
  private readonly driveFold: GainNode;
  private readonly mixClip: GainNode;
  private readonly mixFold: GainNode;
  private readonly foldShaper: WaveShaperNode;
  private lastShape = -1;
  private readonly nodes: AudioNode[];

  constructor(init: RebirthParams = {}) {
    super();
    const c = this.raw;
    this.driveClip = c.createGain();
    this.driveFold = c.createGain();
    this.mixClip = c.createGain();
    this.mixFold = c.createGain();
    const clipShaper = c.createWaveShaper();
    clipShaper.curve = curve((x) => Math.max(-1, Math.min(1, x)));
    clipShaper.oversample = '2x';
    this.foldShaper = c.createWaveShaper();
    this.foldShaper.oversample = '4x';
    const lowpass = onePoleLowpass(c, DIST.foldLowpass);
    Tone.connect(this.input, this.driveClip); this.driveClip.connect(clipShaper); clipShaper.connect(this.mixClip);
    Tone.connect(this.input, this.driveFold); this.driveFold.connect(this.foldShaper); this.foldShaper.connect(lowpass);
    lowpass.connect(this.mixFold);
    Tone.connect(this.mixClip, this.wetGain);
    Tone.connect(this.mixFold, this.wetGain);
    this.nodes = [this.driveClip, this.driveFold, this.mixClip, this.mixFold, clipShaper, this.foldShaper, lowpass];
    this.params = { amount: 0.4, shape: 0.55, ...init };
    this.wet = p(init, 'wet', 1);
    this.apply();
  }

  apply(): void {
    const s = distSettings(clamp01(p(this.params, 'amount', 0.4)), p(this.params, 'shape', 0.55));
    const shape = Math.round(clamp01(p(this.params, 'shape', 0.55)) * 127) / 127;
    if (shape !== this.lastShape) { this.foldShaper.curve = foldCurve(shape); this.lastShape = shape; }
    this.driveClip.gain.value = s.driveClip;
    this.driveFold.gain.value = s.driveFold;
    this.mixClip.gain.value = s.mixClip;
    this.mixFold.gain.value = s.mixFold;
  }

  dispose(): this { this.nodes.forEach((n) => n.disconnect()); return super.dispose(); }
}

// ---------- delay ----------
export class RebirthDelay extends RebirthFx {
  readonly name = 'RebirthDelay';
  private readonly delayNode: DelayNode;
  private readonly feedback: GainNode;
  private readonly panner: StereoPannerNode;

  constructor(init: RebirthParams = {}) {
    super();
    const c = this.raw;
    this.delayNode = c.createDelay(12);
    this.feedback = c.createGain();
    this.panner = c.createStereoPanner();
    Tone.connect(this.input, this.delayNode);
    this.delayNode.connect(this.feedback);
    this.feedback.connect(this.delayNode);
    this.delayNode.connect(this.panner);
    Tone.connect(this.panner, this.wetGain);
    this.params = { steps: 2 / (DELAY_STEPS - 1), feedback: 0.45, pan: 0.5, triplet: 0, ...init };
    this.wet = p(init, 'wet', 0.6);
    this.apply();
  }

  /** Echo time in seconds at the current transport tempo. */
  get echoSeconds(): number {
    return delayTime(p(this.params, 'steps', 2 / (DELAY_STEPS - 1)), p(this.params, 'triplet', 0) >= 0.5, Tone.getTransport().bpm.value || 120);
  }

  apply(): void {
    this.delayNode.delayTime.value = this.echoSeconds;
    this.feedback.gain.value = clamp01(p(this.params, 'feedback', 0.45));
    this.panner.pan.value = panPos(p(this.params, 'pan', 0.5));
  }

  /** Re-reads the tempo (called when the transport tempo changes). */
  syncTempo(): void { this.apply(); }

  dispose(): this {
    [this.delayNode, this.feedback, this.panner].forEach((n) => n.disconnect());
    return super.dispose();
  }
}

// ---------- compressor ----------
export interface CompressorMeter { level: number; gain: number; makeup: number }

export class RebirthCompressor extends RebirthFx {
  readonly name = 'RebirthCompressor';
  /** Resolves when the worklet is running; until then the wet path is a passthrough. */
  readonly ready: Promise<void>;
  /** Detected level and gain (dB), about 40 times a second. */
  onMeter: ((m: CompressorMeter) => void) | null = null;
  private worklet: AudioWorkletNode | null = null;
  private readonly passthrough = new Tone.Gain(1);

  constructor(init: RebirthParams = {}) {
    super();
    this.input.connect(this.passthrough);
    this.passthrough.connect(this.wetGain);
    this.params = { amount: 0.3, threshold: 0.5, ...init };
    this.wet = p(init, 'wet', 1);
    this.ready = loadRebirthCompressor(this.raw).then(() => {
      const node = new AudioWorkletNode(this.raw, COMPRESSOR_PROCESSOR, { outputChannelCount: [2] });
      node.port.onmessage = (e: MessageEvent<CompressorMeter>) => this.onMeter?.(e.data);
      Tone.connect(this.input, node);
      Tone.connect(node, this.wetGain);
      this.passthrough.disconnect();
      this.worklet = node;
      this.apply();
    });
  }

  apply(): void {
    if (!this.worklet) return;
    const c = compCurve(p(this.params, 'threshold', 0.5), clamp01(p(this.params, 'amount', 0.3)));
    const set = (name: string, v: number): void => { const prm = this.worklet?.parameters.get(name); if (prm) prm.value = v; };
    set('thresholdDb', c.thresholdDb);
    set('kneeDb', COMP_KNEE_DB);
    set('slope', c.slope);
    set('makeupDb', c.makeupDb);
    set('offsetDb', COMP_OFFSET_DB[p(this.params, 'channel', 0) >= 0.5 ? 'channel' : 'master']);
  }

  dispose(): this {
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.passthrough.dispose();
    return super.dispose();
  }
}

// ---------- pattern controlled filter ----------
export class RebirthPatternFilter extends RebirthFx {
  readonly name = 'RebirthPatternFilter';
  private readonly filter: BiquadFilterNode;
  private readonly makeup: GainNode;
  private transportEvent: number | null = null;
  private halfStep = 0;

  constructor(init: RebirthParams = {}) {
    super();
    this.filter = this.raw.createBiquadFilter();
    this.makeup = this.raw.createGain();
    Tone.connect(this.input, this.filter);
    this.filter.connect(this.makeup);
    Tone.connect(this.makeup, this.wetGain);
    this.params = { freq: 0.45, reso: 0.5, amount: 0.6, decay: 0.4, wave: 0, mode: 1, ...init };
    this.wet = p(init, 'wet', 1);
    this.apply();
    this.followTransport();
  }

  get waveIndex(): number { return choiceIndex(p(this.params, 'wave', 0), PCF_WAVE_COUNT); }
  get lowpass(): boolean { return p(this.params, 'mode', 1) >= 0.5; }

  apply(): void {
    const s = pcfShape(p(this.params, 'freq', 0.45), p(this.params, 'reso', 0.5));
    const lowpass = this.lowpass;
    this.filter.type = lowpass ? 'lowpass' : 'bandpass';
    this.filter.frequency.value = s.hz;
    this.filter.Q.value = lowpass ? 20 * Math.log10(s.q) : s.q; // Q is in dB for a lowpass biquad
    this.makeup.gain.value = 10 ** ((lowpass ? s.lpGainDb : s.bpGainDb) / 20);
  }

  /**
   * One half-step of the pattern: the wave slot sets the cutoff envelope to a fraction of its sweep
   * (times the amount knob) at `time`, which then falls at the decay knob's rate. A null slot keeps falling.
   */
  triggerHalfStep(slot: number, time: number): void {
    const value = PCF_WAVES[this.waveIndex][((slot % PCF_SLOTS) + PCF_SLOTS) % PCF_SLOTS];
    if (value === null || value === undefined) return;
    const detune = this.filter.detune;
    detune.cancelScheduledValues(time);
    detune.setValueAtTime(1200 * PCF_ENV_OCTAVES * value * clamp01(p(this.params, 'amount', 0.6)), time);
    detune.setTargetAtTime(0, time, pcfDecay(p(this.params, 'decay', 0.4)));
  }

  /** Steps the wave from the Tone transport, two half-steps per 16th note, one bar per wave. */
  private followTransport(): void {
    const transport = Tone.getTransport();
    this.transportEvent = transport.scheduleRepeat((time) => {
      this.triggerHalfStep(this.halfStep, time);
      this.halfStep = (this.halfStep + 1) % PCF_SLOTS;
    }, '32n');
  }

  dispose(): this {
    if (this.transportEvent !== null) Tone.getTransport().clear(this.transportEvent);
    this.filter.disconnect();
    this.makeup.disconnect();
    return super.dispose();
  }
}

export type RebirthEffectNode = RebirthDistortion | RebirthDelay | RebirthCompressor | RebirthPatternFilter;

/** Live parameter dispatch for the parameter engine (EffectParameterEngine) and the registry. */
export function applyRebirthEffectParams(node: unknown, changed: RebirthParams): boolean {
  if (!(node instanceof RebirthFx)) return false;
  for (const [k, v] of Object.entries(changed)) node.setParam(k, v);
  return true;
}
