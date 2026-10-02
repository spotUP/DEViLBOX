/**
 * DubEchoEngine — common interface for swappable DubBus echo engines.
 *
 * The DubBus talks to whatever echo is installed via this interface:
 *   setRate(ms)           — delay time
 *   setIntensity(0-1)     — feedback (with smoothing)
 *   setIntensityInstant() — feedback kill (panic, no ramp)
 *   wet                   — dry/wet mix
 *   connect / dispose     — Tone.js audio graph lifecycle
 *
 * Adapters below translate these calls into each effect's native API.
 */

import * as Tone from 'tone';
import { SpaceEchoEffect } from '../effects/SpaceEchoEffect';
import { RE201Effect } from '../effects/RE201Effect';
import { AnotherDelayEffect } from '../effects/AnotherDelayEffect';
import { RETapeEchoEffect } from '../effects/RETapeEchoEffect';
import type { DubBusSettings } from '../../types/dub';
import { DEFAULT_DUB_BUS, RE201_DELAY_MODES } from '../../types/dub';

export interface DubEchoEngine {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  setRate(ms: number): void;
  setIntensity(amount: number): void;
  setIntensityInstant(amount: number): void;
  /** In-feedback HPF — strips sub rumble per echo pass (RE-201 tape-head gap). */
  setFeedbackHpf(hz: number): void;
  /** In-feedback LPF — progressively darkens each repeat (tape-head wear). */
  setFeedbackLpf(hz: number): void;
  /** RE-201 mode selector (1-12). Only meaningful for SpaceEcho engine. */
  setMode(mode: number): void;
  get wet(): number;
  set wet(value: number);
  connect(dest: Tone.InputNode): this;
  dispose(): this;
  /** What the engine is actually running with, for diagnostics. */
  describe?(): Record<string, unknown>;
}

/**
 * Echo level per engine on the bus: each engine's echo at unity with its
 * input (intensity 0.3, echoWet 1, measured live 2026-09-30 with
 * measure_dub_bus_stages: Space Echo -9.4 dB, RE-201 +0.8, AnotherDelay
 * +5.2, RE-Tape Echo -2.9). Put on the engine's wet path.
 *
 * These first matched the engines DOWN to the Space Echo; the RE-201 lost
 * 10.2 dB and every move a RE-201 persona (Tubby) threw into the echo with
 * it - "i can hardly hear any of the moves etc the persona performs now".
 * Unity is the rule the bus's other stages follow.
 */
export const ECHO_ENGINE_TRIM_DB = {
  spaceEcho: 9.4,
  re201: -0.8,
  anotherDelay: -5.2,
  reTapeEcho: 2.9,
} as const;
const trimGain = (engine: keyof typeof ECHO_ENGINE_TRIM_DB) => 10 ** (ECHO_ENGINE_TRIM_DB[engine] / 20);

// ─── SpaceEcho adapter (native — all methods already match) ─────────────

export class SpaceEchoAdapter implements DubEchoEngine {
  private fx: SpaceEchoEffect;
  get input() { return this.fx.input; }
  get output() { return this.fx.output; }

  constructor(settings: DubBusSettings) {
    this.fx = new SpaceEchoEffect({
      mode: settings.echoMode ?? 4,
      rate: settings.echoRateMs,
      intensity: settings.echoIntensity,
      echoVolume: 0.7,
      reverbVolume: 0.3,
      bass: 2,
      treble: -2,
      wow: 0.35,
      wet: settings.echoWet,
      feedbackHpfHz: settings.echoFeedbackHpfHz,
      feedbackLpfHz: settings.echoFeedbackLpfHz,
    });
    this.fx.setWetPathGain(trimGain('spaceEcho'));
  }

  setRate(ms: number): void { this.fx.setRate(ms); }
  describe(): Record<string, unknown> { return { engine: 'spaceEcho', ...this.fx.describe() }; }
  setIntensity(amount: number): void { this.fx.setIntensity(amount); }
  setIntensityInstant(amount: number): void { this.fx.setIntensityInstant(amount); }
  setFeedbackHpf(hz: number): void { this.fx.setFeedbackHpf(hz); }
  setFeedbackLpf(hz: number): void { this.fx.setFeedbackLpf(hz); }
  setMode(mode: number): void { this.fx.setMode(Math.max(1, Math.min(12, mode))); }
  get wet() { return this.fx.wet; }
  set wet(v: number) { this.fx.wet = v; }
  connect(dest: Tone.InputNode): this { this.fx.connect(dest); return this; }
  dispose(): this { this.fx.dispose(); return this; }
}

// ─── RE-201 adapter ─────────────────────────────────────────────────────

/**
 * The RE-201 engine intensity for the bus's intensity in a delay mode.
 *
 * The RE-201 sums every active head into its feedback at intensity x 0.85
 * each, so the loop gain grows with the head count: three heads at the bus's
 * 0.62 is ~1.6, and the echo built up until the tape saturation held it -
 * "re-201 it self oscillates? it gets stronger and stronger" (2026-09-30,
 * Tubby's mode 9). The bus's intensity is a loop gain; it is shared out over
 * the heads. The C++ keeps the machine's behaviour for the master effect.
 */
export function re201Intensity(busIntensity: number, delayMode: number): number {
  const heads = RE201_DELAY_MODES.find((m) => m.value === delayMode)?.heads ?? 1;
  return Math.max(0, Math.min(1, busIntensity)) / Math.max(1, heads);
}

export class RE201Adapter implements DubEchoEngine {
  private fx: RE201Effect;
  private busIntensity: number;
  private delayMode: number;
  get input() { return this.fx.input; }
  get output() { return this.fx.output; }

  constructor(settings: DubBusSettings) {
    this.busIntensity = settings.echoIntensity;
    this.delayMode = settings.re201DelayMode ?? DEFAULT_DUB_BUS.re201DelayMode;
    this.fx = new RE201Effect({
      delayMode: this.delayMode, // RE201_DELAY_MODES
      repeatRate: this.msToRepeatRate(settings.echoRateMs),
      intensity: re201Intensity(this.busIntensity, this.delayMode),
      echoVolume: 0.90,
      reverbVolume: 0.20,    // light internal spring — adds body without clashing with DubBus spring
      bass: 0.7,
      treble: 0.3,
      inputLevel: 1.0,       // unity gain — DubBus handles levels
      wet: settings.echoWet,
    });
    this.fx.setWetPathGain(trimGain('re201'));
  }

  /** RE-201 repeatRate 0→700ms, 1→50ms. Inverse: ms→rate */
  private msToRepeatRate(ms: number): number {
    return Math.max(0, Math.min(1, (700 - ms) / 650));
  }

  setRate(ms: number): void {
    this.fx.setRepeatRate(this.msToRepeatRate(ms));
  }

  setIntensity(amount: number): void {
    this.busIntensity = amount;
    this.fx.setIntensity(re201Intensity(amount, this.delayMode));
  }

  describe(): Record<string, unknown> { return { engine: 're201', ...this.fx.describe() }; }

  setIntensityInstant(amount: number): void {
    // RE-201 has no instant variant — use normal setIntensity
    this.setIntensity(amount);
  }

  // RE-201 WASM doesn't expose per-Hz feedback filter controls — its
  // bass/treble knobs are 0-1 panel positions, not frequency values.
  // The fallback JS path has a fixed 8 kHz LPF. These are intentional
  // no-ops: the RE-201's inherent tape-head character provides equivalent
  // darkening without a configurable filter.
  setFeedbackHpf(_hz: number): void { /* RE-201 handles internally */ }
  setFeedbackLpf(_hz: number): void { /* RE-201 handles internally */ }
  // RE-201 uses 0-10 mode range. Clamp and pass through to the effect.
  setMode(mode: number): void {
    this.delayMode = Math.max(0, Math.min(10, Math.round(mode)));
    this.fx.setDelayMode(this.delayMode);
    this.fx.setIntensity(re201Intensity(this.busIntensity, this.delayMode)); // the head count changed
  }

  get wet() { return this.fx.wet; }
  set wet(v: number) { this.fx.wet = v; }
  connect(dest: Tone.InputNode): this { this.fx.connect(dest); return this; }
  dispose(): this { this.fx.dispose(); return this; }
}

// ─── AnotherDelay adapter ───────────────────────────────────────────────

export class AnotherDelayAdapter implements DubEchoEngine {
  private fx: AnotherDelayEffect;
  get input() { return this.fx.input; }
  get output() { return this.fx.output; }

  constructor(settings: DubBusSettings) {
    this.fx = new AnotherDelayEffect({
      delayTime: settings.echoRateMs,
      feedback: settings.echoIntensity * 0.55,  // conservative — DubBus spring extends tail naturally
      gain: 1.0,
      lowpass: settings.echoFeedbackLpfHz ?? 3000,
      highpass: settings.echoFeedbackHpfHz ?? 150,
      flutterFreq: 3.5,
      flutterDepth: 0.002,   // barely perceptible — just enough for analog character
      wowFreq: 0.3,
      wowDepth: 0.001,       // near-zero — prevents pitch wobble / "drunk" sound
      reverbEnabled: false,  // disabled — DubBus has its own spring reverb (Aelapse)
      roomSize: 0.55,
      damping: 0.35,
      width: 1,
      wet: settings.echoWet,
    });
    this.fx.setWetPathGain(trimGain('anotherDelay'));
  }

  setRate(ms: number): void { this.fx.setDelayTime(ms); }

  setIntensity(amount: number): void {
    this.fx.setFeedback(amount * 0.55);  // conservative — DubBus spring adds energy
  }

  setIntensityInstant(amount: number): void {
    this.fx.setFeedback(amount * 0.55);
  }

  // AnotherDelayEffect has native setHighpass/setLowpass — route directly.
  setFeedbackHpf(hz: number): void { this.fx.setHighpass(hz); }
  setFeedbackLpf(hz: number): void { this.fx.setLowpass(hz); }
  setMode(_mode: number): void { /* AnotherDelay has no head mode */ }

  get wet() { return this.fx.wet; }
  set wet(v: number) { this.fx.wet = v; }
  connect(dest: Tone.InputNode): this { this.fx.connect(dest); return this; }
  dispose(): this { this.fx.dispose(); return this; }
}

// ─── RETapeEcho adapter ─────────────────────────────────────────────────

/**
 * Peak gain of the RE-Tape Echo's playhead EQ, which sits INSIDE its feedback
 * loop: +8.7 dB near 1.5 kHz at the slowest tape speed (every dub-length echo
 * clamps there), +6.5 dB at the fastest. Measured from the C++ biquads
 * (`PlayheadEQ`, re-tape-echo-wasm), 2026-09-30.
 */
export const RE_TAPE_LOOP_EQ_PEAK_DB = 8.73;
/** The loop gain the bus's intensity reaches at 1 - below unity, as the other engines stop (Space Echo 0.95, RE-201 0.85). */
export const RE_TAPE_MAX_LOOP_GAIN = 0.9;

/**
 * The engine intensity that gives the bus intensity's loop gain.
 *
 * The bus's intensity is a loop gain, the way the other engines read it. The
 * RE-Tape Echo reads its own as a dB scale (fbGain = 10^((30 i - 30) / 20),
 * from the Pure Data patch) and its playhead EQ adds up to 8.7 dB inside the
 * loop, so the bus's intensity passed straight in crossed unity at ~0.71 and
 * self-oscillated: +25.5 dB over the input at 0.85, measured live 2026-09-30.
 * The C++ stays as the machine is - the master-effect RE-Tape Echo keeps its
 * authentic runaway at the top of its knob; the bus asks for a loop gain.
 */
export function reTapeEchoIntensity(busIntensity: number): number {
  const loop = Math.max(0, Math.min(1, busIntensity)) * RE_TAPE_MAX_LOOP_GAIN;
  if (loop <= 0) return 0;
  const fbGainDb = 20 * Math.log10(loop) - RE_TAPE_LOOP_EQ_PEAK_DB;
  return Math.max(0, Math.min(1, 1 + fbGainDb / 30));
}

export class RETapeEchoAdapter implements DubEchoEngine {
  private fx: RETapeEchoEffect;
  get input() { return this.fx.input; }
  get output() { return this.fx.output; }

  constructor(settings: DubBusSettings) {
    this.fx = new RETapeEchoEffect({
      mode: 3,
      repeatRate: this.msToRepeatRate(settings.echoRateMs),
      intensity: reTapeEchoIntensity(settings.echoIntensity),
      echoVolume: 0.85,
      wow: 0.3,
      flutter: 0.25,
      dirt: 0.15,
      playheadFilter: 1,  // enable 4kHz lowpass — tames BBD treble ringing
      wet: settings.echoWet,
    });
    this.fx.setWetPathGain(trimGain('reTapeEcho'));
  }

  /**
   * RETapeEcho formula: delay_ms = (1 - rate*2.3 + 1) * 47 = (2 - rate*2.3) * 47
   * Inverse: rate = (2 - ms/47) / 2.3
   */
  private msToRepeatRate(ms: number): number {
    const rate = (2 - ms / 47) / 2.3;
    return Math.max(0, Math.min(1, rate));
  }

  setRate(ms: number): void {
    this.fx.setRepeatRate(this.msToRepeatRate(ms));
  }

  setIntensity(amount: number): void { this.fx.setIntensity(reTapeEchoIntensity(amount)); }

  setIntensityInstant(amount: number): void {
    // No instant variant — use normal setIntensity
    this.fx.setIntensity(reTapeEchoIntensity(amount));
  }

  // RETapeEcho's playheadFilter is binary (4 kHz on/off); no per-Hz HPF.
  // Map LPF: enable/disable the playhead filter based on whether LPF is below
  // 8 kHz (typical tape range) or above (wants brightness). HPF is no-op.
  setFeedbackHpf(_hz: number): void { /* BBD has no in-feedback HPF control */ }
  setFeedbackLpf(hz: number): void { this.fx.setPlayheadFilter(hz < 8000); }
  setMode(_mode: number): void { /* RETapeEcho has no head mode */ }

  get wet() { return this.fx.wet; }
  set wet(v: number) { this.fx.wet = v; }
  connect(dest: Tone.InputNode): this { this.fx.connect(dest); return this; }
  dispose(): this { this.fx.dispose(); return this; }
}

// ─── Factory ────────────────────────────────────────────────────────────

export type EchoEngineType = DubBusSettings['echoEngine'];

export function createDubEchoEngine(type: EchoEngineType, settings: DubBusSettings): DubEchoEngine {
  switch (type) {
    case 'spaceEcho':    return new SpaceEchoAdapter(settings);
    case 're201':        return new RE201Adapter(settings);
    case 'anotherDelay': return new AnotherDelayAdapter(settings);
    case 'reTapeEcho':   return new RETapeEchoAdapter(settings);
  }
}
