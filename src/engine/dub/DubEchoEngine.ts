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
}

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
  }

  setRate(ms: number): void { this.fx.setRate(ms); }
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

export class RE201Adapter implements DubEchoEngine {
  private fx: RE201Effect;
  get input() { return this.fx.input; }
  get output() { return this.fx.output; }

  constructor(settings: DubBusSettings) {
    this.fx = new RE201Effect({
      delayMode: 7,          // head 1 + reverb — Tubby's signature short-tap + spring character
      repeatRate: this.msToRepeatRate(settings.echoRateMs),
      intensity: settings.echoIntensity,
      echoVolume: 0.90,
      reverbVolume: 0.20,    // light internal spring — adds body without clashing with DubBus spring
      bass: 0.7,
      treble: 0.3,
      inputLevel: 1.0,       // unity gain — DubBus handles levels
      wet: settings.echoWet,
    });
  }

  /** RE-201 repeatRate 0→700ms, 1→50ms. Inverse: ms→rate */
  private msToRepeatRate(ms: number): number {
    return Math.max(0, Math.min(1, (700 - ms) / 650));
  }

  setRate(ms: number): void {
    this.fx.setRepeatRate(this.msToRepeatRate(ms));
  }

  setIntensity(amount: number): void { this.fx.setIntensity(amount); }

  setIntensityInstant(amount: number): void {
    // RE-201 has no instant variant — use normal setIntensity
    this.fx.setIntensity(amount);
  }

  // RE-201 WASM doesn't expose per-Hz feedback filter controls — its
  // bass/treble knobs are 0-1 panel positions, not frequency values.
  // The fallback JS path has a fixed 8 kHz LPF. These are intentional
  // no-ops: the RE-201's inherent tape-head character provides equivalent
  // darkening without a configurable filter.
  setFeedbackHpf(_hz: number): void { /* RE-201 handles internally */ }
  setFeedbackLpf(_hz: number): void { /* RE-201 handles internally */ }
  setMode(_mode: number): void { /* RE-201 has fixed head config */ }

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

export class RETapeEchoAdapter implements DubEchoEngine {
  private fx: RETapeEchoEffect;
  get input() { return this.fx.input; }
  get output() { return this.fx.output; }

  constructor(settings: DubBusSettings) {
    this.fx = new RETapeEchoEffect({
      mode: 3,
      repeatRate: this.msToRepeatRate(settings.echoRateMs),
      intensity: settings.echoIntensity,
      echoVolume: 0.85,
      wow: 0.3,
      flutter: 0.25,
      dirt: 0.15,
      playheadFilter: 1,  // enable 4kHz lowpass — tames BBD treble ringing
      wet: settings.echoWet,
    });
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

  setIntensity(amount: number): void { this.fx.setIntensity(amount); }

  setIntensityInstant(amount: number): void {
    // No instant variant — use normal setIntensity
    this.fx.setIntensity(amount);
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
