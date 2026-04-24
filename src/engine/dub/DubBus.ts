/**
 * DubBus — the shared dub send chain. Originally inline in DrumPadEngine;
 * extracted in Phase 0 of the Tracker Dub Studio refactor so tracker channels
 * can feed it alongside drumpad pads.
 *
 * Graph (inherited verbatim from the previous DrumPadEngine inline form):
 *   input → HPF → TapeSat → [Spring | Echo | Sidechain-duck | Glue] → LPF → return → master
 *
 * Pad sources and (eventually) tracker channels connect to `this.inputNode`.
 * Interact with bus settings via setSettings(). Trigger dub moves via
 * openDeckTap / closeDeckTap / throwDeck / muteAndDub / setSirenFeedback /
 * filterDrop. Emergency drain via dubPanic().
 */

import * as Tone from 'tone';
import type { DubBusSettings } from '../../types/dub';
import { DEFAULT_DUB_BUS, DUB_CHARACTER_PRESETS, snapToAltecStep } from '../../types/dub';
import {
  AelapseEffect,
  PARAM_SPRINGS_DRYWET,
  PARAM_SPRINGS_LENGTH,
  PARAM_SPRINGS_DAMP,
  PARAM_SPRINGS_CHAOS,
  PARAM_SPRINGS_SCATTER,
  PARAM_SPRINGS_TONE,
} from '../effects/AelapseEffect';
import type { DubEchoEngine } from './DubEchoEngine';
import { createDubEchoEngine } from './DubEchoEngine';
import { VinylNoiseEffect } from '../effects/VinylNoiseEffect';
import { ToneArmEffect } from '../effects/ToneArmEffect';
import { MadProfessorPlateEffect } from '../effects/MadProfessorPlateEffect';
import { DattorroPlateEffect } from '../effects/DattorroPlateEffect';
import { ParametricEQEffect } from '../effects/ParametricEQEffect';
import { CalfPhaserEffect } from '../effects/CalfPhaserEffect';
import { RingModEffect } from '../effects/RingModEffect';
import { BittaEffect } from '../effects/BittaEffect';
import { generateIR, CLUB_IR_PRESETS } from './generateIR';
import { getNativeAudioNode } from '@utils/audio-context';
import type { DJMixerEngine } from '../dj/DJMixerEngine';
import type { DeckId } from '../dj/DeckEngine';
import { clearAllPendingThrows } from './DubActions';
import { fireParamLiveSubscribers } from '@/midi/performance/parameterRouter';
import { RE201Effect } from '../effects/RE201Effect';
import { AnotherDelayEffect } from '../effects/AnotherDelayEffect';
import { RETapeEchoEffect } from '../effects/RETapeEchoEffect';

const DECK_IDS: DeckId[] = ['A', 'B', 'C'];

/**
 * Safe biquad AudioParam ramp. Chrome's native BiquadFilterNode is sensitive
 * to simultaneous freq/Q/gain changes via `setTargetAtTime` — the exponential
 * approach + its short time-constant can leave the filter's internal state
 * transiently unstable, which Chrome surfaces as "state is bad, probably due
 * to unstable filter caused by fast parameter automation" and latches the
 * param buffer to NaN (permanent silence on everything downstream in the
 * chain).
 *
 * This helper does the four moves Chrome tolerates reliably:
 *   1. cancelScheduledValues — clears any prior setTargetAtTime tail.
 *   2. setValueAtTime(current) — pins the starting point so the ramp has
 *      a known origin.
 *   3. linearRampToValueAtTime(target, now + duration) — deterministic end,
 *      linear trajectory, no exponential asymptote.
 *   4. (No step — single linear ramp covers it.)
 *
 * Used for ALL at-risk bus biquad params (hpf cascade, bassShelf,
 * feedbackShelfComp, midScoop, and their master counterparts).
 */
function rampBiquadParam(param: AudioParam, target: number, now: number, duration = 0.05): void {
  try {
    const safeTarget = Number.isFinite(target) ? target : 0;
    const current = Number.isFinite(param.value) ? param.value : safeTarget;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(safeTarget, now + duration);
  } catch { /* ok */ }
}


/**
 * Soft-compression curve for channel→dub send levels. Keeps low/mid slider
 * travel essentially untouched (identity at 0, near-identity through 0.5) but
 * rolls the top off so pulling a fader to max doesn't drown the dry signal in
 * reverb. At x=1.0 the effective send is 0.7 (~−3 dB vs. linear), which tames
 * the overall wet loudness while preserving the "phatness" that comes from
 * the low-mid range where the curve is nearly linear.
 *
 *   x=0.25 → 0.245   x=0.50 → 0.463   x=0.75 → 0.624   x=1.00 → 0.700
 */
function applyDubSendCurve(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 0.7;
  return x * (1 - 0.3 * x * x);
}

/**
 * Asymmetric tanh curve for WaveShaper — models transformer-coupled magnetic
 * tape saturation. Positive half compresses a touch harder than the negative
 * half; that asymmetry is the audible signature of tape vs. digital clipping.
 * Called once at engine init; curve is static after that.
 */
function makeTapeSatCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  // Construct with an explicit ArrayBuffer (not ArrayBufferLike) so the
  // resulting typed array matches what WaveShaperNode.curve expects under
  // TS strict lib types.
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const kPos = drive * 4;
  const kNeg = drive * 4.4;  // +10% on negative half — asymmetric
  const normPos = Math.tanh(kPos);
  const normNeg = Math.tanh(kNeg);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = x >= 0
      ? Math.tanh(x * kPos) / normPos
      : Math.tanh(x * kNeg) / normNeg;
  }
  return curve;
}

/**
 * Generate a pink noise AudioBuffer using Paul Kellet's three-stage filter.
 * -3 dB/oct rolloff, cheap, and indistinguishable from "real" pink at the
 * very low levels we'll play it back at. Mono buffer is fine — the noise
 * floor of dub records was mono anyway (single tape head).
 */
function makePinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const frames = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, frames, sr);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    // Sum + gentle normalization (Kellet's coefficients peak at ~2.6)
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
  }
  return buffer;
}

// ── Singleton accessor for synchronous DubBus access ────────────────────────
// The mixer store needs synchronous access to route SID voice dub sends
// without async import chains. Set by DubBus constructor, cleared by dispose.
let _activeDubBus: DubBus | null = null;
export function getActiveDubBus(): DubBus | null { return _activeDubBus; }

export class DubBus {
  // ─── Shared Dub Bus — Vintage King Tubby / Scientist chain ─────────────────
  // Sources fanning into `input`:
  //   1. Pads with dubSend > 0 — per-voice gain created in triggerPad().
  //   2. DJ deck taps (A/B/C)  — gain=0 at rest, opened by dub-throw pads.
  //   3. Feedback tap           — post-echo → feedback → input (siren).
  //   4. Noise source           — loop of pink noise ~-55 dBFS, baked into
  //                               the mix so drops reveal the dub "floor".
  //
  // Chain order (vintage authentic — matches 1970s Tubby/Scientist signal path):
  //   input → HPF(180Hz) → TapeSat(asymmetric tanh) → Echo(RE-201) → Spring
  //                                                                    ↓
  //         ← feedback ← echoOut ─────────────────────────────────────┘
  //   Spring.output → SidechainComp(fast, pumping) → GlueComp(slow, dubplate)
  //                 → LPF(filter drop sweeps) → return → master
  //
  // Key authenticity points:
  //   - Echo → Spring (not Spring → Echo): every echo repeat gets washed with
  //     plate/spring character. That's THE dub signature.
  //   - Tape saturation BEFORE the echo: crunches input the way an MCI board
  //     would, gives the echo something to chew on.
  //   - Glue compressor AFTER pumping: recreates the slow compression of
  //     cutting straight to acetate — softens transients on the tail.
  //   - Pink noise floor: +minuscule hiss that becomes audible during mute-
  //     and-dub drops, giving the dub "texture" a tape feel.
  private input: GainNode;
  /** Altec-style HPF — 3 cascaded biquads (6 dB/oct each) = 18 dB/oct
   *  composite slope, matching the original Altec 9069B 3rd-order T-network.
   *  `this.hpf` is stage 1 (primary reference used elsewhere in the bus);
   *  stages 2-3 chain internally. Stepped mode (settings.hpfStepped) snaps
   *  frequency to the 11 Altec positions; continuous mode is a smooth sweep. */
  private hpf: BiquadFilterNode;
  private hpf2: BiquadFilterNode;
  private hpf3: BiquadFilterNode;
  // ─── Sound coloring stage (research 2026-04-20_dub-sound-coloring.md) ──
  // King Tubby bass shelf — resonant low-shelf at ~90 Hz for the dub
  // "weight." Sits after the HPF so it doesn't amplify sub-rumble.
  private bassShelf: BiquadFilterNode;
  // Compensating low-shelf cut in the feedback path — mirrors bassShelf
  // boost as a cut so the round-trip bass gain stays at 0 dB. Without
  // this, bass content inside the feedback loop gets amplified every
  // iteration (shelf boost → saturator clips to 1.0 → feedback sends
  // back → shelf boosts again → stable full-amplitude bass drone).
  private feedbackShelfComp: BiquadFilterNode;
  /** NaN/Inf scrubber inserted between `echo.output` and `this.feedback`.
   *  Starts life as a passthrough GainNode while the AudioWorklet module
   *  loads, then the worklet is spliced in-place (transparent to the rest
   *  of the graph). Prevents transient non-finite samples from the echo
   *  engine (e.g. first block of a freshly-initialised RE-201 WASM
   *  worklet, or a disposed ToneAudioNode's final block) from latching
   *  the feedback-chain biquads to "state is bad" permanently.
   *  Ref: 2026-04-29 Tubby-preset crash investigation. */
  private _feedbackScrubber: AudioNode;
  private _feedbackScrubberIsWorklet = false;
  /** NaN/Inf scrubber inserted between `spring.output` and the post-spring
   *  forward chain (sidechain → glue → midScoop → lpf → master*). Same
   *  story as the feedback scrubber but on the FORWARD path: a NaN sample
   *  from a freshly-swapped echo engine propagates echo→spring→sidechain
   *  and latches the 5 forward biquads (midScoop, lpf, masterBassShelf,
   *  masterMidScoop, masterLpf) to "state is bad" — exactly what the
   *  2026-04-29 anotherDelay→re201 swap reproduced even with the
   *  feedback-tap scrubber active. Same worklet, dual-path coverage. */
  private _forwardScrubber: AudioNode;
  private _forwardScrubberIsWorklet = false;
  /** Third NaN-scrubber sitting between echo.output and spring.input.
   *  Catches NaN/Inf transients from the WASM echo engine's first audio
   *  block BEFORE they hit the spring reverb worklet. Without this,
   *  selecting Tubby / Perry (which swap echo engines to RE-201 /
   *  anotherDelay) produces a "bwoooaap" bass transient followed by
   *  permanently silent reverb — the spring worklet's internal WASM
   *  state latches to silence when fed pathological input and our
   *  downstream forward scrubber (post-spring) can't unstick it. */
  private _echoSpringScrubber: AudioNode;
  private _echoSpringScrubberIsWorklet = false;
  // Scientist mid-scoop — peaking cut around 700 Hz. Sits on the return
  // side (post-comp) so it shapes the already-echoed/sprung signal.
  private midScoop: BiquadFilterNode;
  // Stereo M/S width — splits L/R into mid (L+R) and side (L-R), applies
  // width to the side channel, recombines. width=0 → mono, 1 → neutral,
  // 2 → doubled side (Mad Professor ping-pong style).
  private stereoSplit: ChannelSplitterNode;
  private stereoMid: GainNode;
  private stereoSide: GainNode;
  private stereoInvertR: GainNode;
  private stereoMerge: ChannelMergerNode;
  private tapeSat: WaveShaperNode;    // asymmetric tanh — MCI board bite

  // ─── Perry tape stack (optional alt to single tapeSat) ─────────────────
  // Models the 4-track-bounce workflow Perry used at Black Ark — each bus
  // signal hits 3 WaveShapers in parallel, each with different drive +
  // uncorrelated wow (independent LFO phase). Perceptually: more "compressed
  // + gritty with organic motion" vs a single-path saturator.
  //
  // Always constructed to keep the graph stable. Enabled/disabled via
  // crossfade between `tapeSatBypass` (normal path) and `tapeStackMix`
  // (the 3-path sum). Switching is smooth, not re-wired.
  private tapeStackPaths: Array<{
    inGain: GainNode;       // per-path input split
    delay: DelayNode;       // wow — tiny delay modulated by path LFO
    delayLfo: OscillatorNode;
    delayLfoGain: GainNode;
    shaper: WaveShaperNode; // per-path saturation at different drive
    outGain: GainNode;      // per-path mix → tapeStackMix
  }> = [];
  private tapeStackMix: GainNode;    // sum of 3 paths, gated by tapeSatMode
  private tapeSatBypass: GainNode;   // single-path pass, gated by tapeSatMode

  // ─── External feedback loop ───────────────────────────────────────────
  // Routes return path back to echo input through a peaking EQ + gain,
  // implementing Messian Dread's "mixer as instrument" technique.
  private extFeedbackGain: GainNode;
  private extFeedbackEq: BiquadFilterNode;
  // One-block delay ensures the ext-feedback cycle contains a native
  // DelayNode so the Web Audio renderer can topologically sort it.
  private extFeedbackDelay: DelayNode;

  // ─── Club simulation (ConvolverNode on master output) ─────────────────
  private clubConvolver: ConvolverNode;
  private clubDry: GainNode;
  private clubWet: GainNode;
  private _clubSimPreset: string = '';
  /** Whether the ConvolverNode is currently connected to return_.
   *  We only wire it when club sim is enabled to avoid null-buffer issues. */
  private _clubConvolverWired = false;

  // ─── Chain order state ─────────────────────────────────────────────────
  /** Current core routing order. Updated by _applyCoreRouting(). */
  private _chainOrder: 'echoSpring' | 'springEcho' | 'parallel' = 'echoSpring';
  /** Monotonic version counter for racing setChainOrder / worklet loads. */
  private _routingVersion = 0;

  // ─── Liquid sweep — parallel comb filter with LFO ─────────────────────
  // Flanger-family short-delay comb (1-10 ms modulated delay + feedback)
  // taking the user's "liquid drums" motion cue. Feedback loop has an HPF
  // to prevent sub build-up each recirculation (critical for dub — fb
  // without HPF muddies instantly on reggae basslines). Parallel send
  // off the HPF cascade output; summed at tapeSat input so the flanged
  // signal gets saturation + echo + spring like the dry.
  private sweepInput: GainNode;       // parallel tap point
  private sweepDelay: DelayNode;
  private sweepLfo: OscillatorNode;
  private sweepLfoGain: GainNode;
  private sweepFeedback: GainNode;
  private sweepFeedbackHpf: BiquadFilterNode;
  private sweepOutput: GainNode;      // wet amount (0..1)
  // ─── True phaser (CalfPhaser WASM) — alternative to comb sweep ────────
  // Both comb and phaser are permanently wired from sweepInput; their
  // output gains crossfade based on sweepMode. No disconnect/reconnect.
  private phaser: CalfPhaserEffect;
  private phaserOutput: GainNode;     // 0 when sweepMode='comb', sweepAmount when 'phaser'
  private combOutput: GainNode;       // sweepAmount when sweepMode='comb', 0 when 'phaser'
  // ─── Return EQ — WASM parametric inserted between midScoop and LPF ────
  // Always 100% wet (series insert). Bypass via flat gain (0 dB).
  private returnEQ: ParametricEQEffect;
  // ─── Post-echo tape saturation — degrades echo repeats ─────────────
  private postEchoSat: WaveShaperNode;
  private postEchoSatBypass: GainNode;   // 1 when off (dry through), 0 when sat on
  private postEchoSatWet: GainNode;      // 0 when off, 1 when sat on
  // ─── Ring modulator — parallel send ────────────────────────────────
  private ringMod: RingModEffect;
  private ringModSend: GainNode;         // amount of ring mod mixed into bus
  // ─── Lo-fi / voltage starve — bitcrusher ──────────────────────────
  private lofi: BittaEffect;
  private lofiSend: GainNode;            // gated on/off
  private lofiBypass: GainNode;          // dry bypass when off
  /** Aelapse-ported spring-reverb DSP (C++ → WASM). Replaces the old
   *  Tone.js-based SpringReverbEffect — proper tank simulation with chaos,
   *  damping, and per-spring scatter. Delay side disabled since the bus
   *  already runs SpaceEcho as its dedicated tape-head chain. */
  private spring: AelapseEffect;
  // Optional plate-stage insert — see `setPlateStage` + the DubBusSettings
  // `plateStage` field. null when plateStage='off'. Instantiated lazily.
  private plateStage: MadProfessorPlateEffect | DattorroPlateEffect | null = null;
  // Send gain that feeds the plate input. On/off gate via mix level.
  // When plateStage is null, this node is disconnected.
  private plateSend: GainNode | null = null;
  /** Cached mirror of the current springs dry/wet so dubPanic + mini-drain
   *  can zero it and restore without re-reading the engine. Mirrors what
   *  SpringReverbEffect's `.wet` used to hold inline. */
  private _springWetCache: number = 0.55;

  /** Set the Aelapse springs dry/wet AND cache it. Use everywhere old code
   *  did `this.spring.wet = v`. */
  private _setSpringWet(v: number): void {
    this._springWetCache = v;
    try { this.spring.setParamById(PARAM_SPRINGS_DRYWET, v); } catch { /* ok */ }
  }

  /** Asynchronously load `nan-scrubber.worklet.js` and splice the worklet
   *  in place of the placeholder GainNode on the feedback tap. Idempotent;
   *  no-ops if already upgraded or if the load fails (falls back silently
   *  to the passthrough — bus still functions, just without the NaN guard).
   *  Only called once from the constructor. */
  private async _loadFeedbackScrubberWorklet(): Promise<void> {
    if (this._feedbackScrubberIsWorklet) return;
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      if (!DubBus._scrubberModuleLoaded.has(this.context)) {
        let p = DubBus._scrubberModulePromises.get(this.context);
        if (!p) {
          p = this.context.audioWorklet.addModule(`${base}worklets/nan-scrubber.worklet.js`);
          DubBus._scrubberModulePromises.set(this.context, p);
        }
        await p;
        DubBus._scrubberModuleLoaded.add(this.context);
      }
      const worklet = new AudioWorkletNode(this.context, 'nan-scrubber', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: { mode: 'feedback' },
      });
      /* Splice: disconnect the placeholder GainNode, connect the worklet
         in its place. feedback → (old scrubber) → feedbackShelfComp becomes
         feedback → worklet → feedbackShelfComp. Must be atomic — do the
         disconnect AFTER the connect so the feedback loop is never open. */
      try { this.feedback.connect(worklet); } catch { /* ok */ }
      try { worklet.connect(this.feedbackShelfComp); } catch { /* ok */ }
      try { this.feedback.disconnect(this._feedbackScrubber); } catch { /* ok */ }
      try { (this._feedbackScrubber as GainNode).disconnect(); } catch { /* ok */ }
      this._feedbackScrubber = worklet;
      this._feedbackScrubberIsWorklet = true;
    } catch (err) {
      console.warn('[DubBus] NaN-scrubber worklet load failed — using passthrough:', err);
    }
  }
  private static _scrubberModuleLoaded = new WeakSet<AudioContext>();
  private static _scrubberModulePromises = new WeakMap<AudioContext, Promise<void>>();

  /** Async splice path for the FORWARD scrubber. Chain-order-aware:
   *  - echoSpring: spring.output → SCRUBBER → sidechain
   *  - springEcho: echo postEchoSat → SCRUBBER → sidechain
   *  - parallel:   spring.output → SCRUBBER → sidechain (echo bypasses) */
  private async _loadForwardScrubberWorklet(): Promise<void> {
    if (this._forwardScrubberIsWorklet) return;
    const versionBefore = this._routingVersion;
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      if (!DubBus._scrubberModuleLoaded.has(this.context)) {
        let p = DubBus._scrubberModulePromises.get(this.context);
        if (!p) {
          p = this.context.audioWorklet.addModule(`${base}worklets/nan-scrubber.worklet.js`);
          DubBus._scrubberModulePromises.set(this.context, p);
        }
        await p;
        DubBus._scrubberModuleLoaded.add(this.context);
      }
      if (this._routingVersion !== versionBefore) return;

      const worklet = new AudioWorkletNode(this.context, 'nan-scrubber', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: { mode: 'forward' },
      });
      const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;
      const springOutNative = getNativeAudioNode(springOut as unknown);

      // Disconnect old passthrough from its neighbors
      if (this._chainOrder === 'echoSpring' || this._chainOrder === 'parallel') {
        if (springOutNative) {
          try { springOutNative.disconnect(this._forwardScrubber); } catch { /* ok */ }
        }
      } else if (this._chainOrder === 'springEcho') {
        try { this.postEchoSatBypass.disconnect(this._forwardScrubber); } catch { /* ok */ }
        try { this.postEchoSatWet.disconnect(this._forwardScrubber); } catch { /* ok */ }
      }
      try { (this._forwardScrubber as GainNode).disconnect(); } catch { /* ok */ }

      this._forwardScrubber = worklet;
      this._forwardScrubberIsWorklet = true;

      // Reconnect with new worklet based on current chain order
      if (this._chainOrder === 'echoSpring' || this._chainOrder === 'parallel') {
        if (springOutNative) {
          try { springOutNative.connect(worklet); } catch { /* ok */ }
        }
      } else if (this._chainOrder === 'springEcho') {
        try { this.postEchoSatBypass.connect(worklet); } catch { /* ok */ }
        try { this.postEchoSatWet.connect(worklet); } catch { /* ok */ }
      }
      try { worklet.connect(this.sidechain); } catch { /* ok */ }
    } catch (err) {
      console.warn('[DubBus] forward NaN-scrubber worklet load failed — using passthrough:', err);
    }
  }

  /** (Re)wire echo.output → echoSpringScrubber → spring.input. Called at
   *  initial graph build AND after every echo engine swap (since the
   *  echo instance is disposed + recreated). Uses native .connect()
   *  because AudioWorkletNodes don't play nicely with Tone.connect. */
  private _connectEchoToSpring(): void {
    const echoOut = this.echo.output as unknown;
    const springIn = this.spring.input as unknown;
    const echoOutNative = getNativeAudioNode(echoOut);
    const springInNative = getNativeAudioNode(springIn);
    if (echoOutNative && springInNative) {
      // Post-echo saturation: echo → [bypass + sat] → scrubber → spring
      // Parallel dry/wet: echoOut → satBypass → scrubber (dry path)
      //                   echoOut → postEchoSat → satWet → scrubber (wet path)
      try {
        echoOutNative.connect(this.postEchoSatBypass);
        echoOutNative.connect(this.postEchoSat);
        this.postEchoSat.connect(this.postEchoSatWet);
        this.postEchoSatBypass.connect(this._echoSpringScrubber);
        this.postEchoSatWet.connect(this._echoSpringScrubber);
      } catch { /* ok */ }
      try { (this._echoSpringScrubber as AudioNode).connect(springInNative); } catch { /* ok */ }
      return;
    }
    console.warn('[DubBus] echo→spring scrubber insertion failed, using direct Tone.connect');
    try { this.echo.connect(this.spring); } catch { /* ok */ }
  }

  /**
   * Tear down ALL chain-order-dependent audio edges. Every disconnect
   * is try-caught because only the edges of the CURRENT order actually
   * exist — the rest silently no-op.
   *
   * Chain-order-dependent = everything between tapeSat outputs and sidechain
   * input, including echo↔spring inter-stage, postEchoSat, scrubbers, and
   * the feedback tap from echo output.
   */
  private _disconnectCoreRouting(): void {
    const echoIn = this.echo.input as unknown as AudioNode;
    const echoOut = this.echo.output as unknown as Tone.ToneAudioNode;
    const springIn = this.spring.input as unknown as AudioNode;
    const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;
    const echoOutNative = getNativeAudioNode(echoOut as unknown);
    const springOutNative = getNativeAudioNode(springOut as unknown);
    const springInNative = getNativeAudioNode(springIn as unknown);

    // tapeSat → echo/spring inputs
    try { this.tapeSatBypass.disconnect(echoIn); } catch { /* ok */ }
    try { this.tapeStackMix.disconnect(echoIn); } catch { /* ok */ }
    try { this.tapeSatBypass.disconnect(springIn); } catch { /* ok */ }
    try { this.tapeStackMix.disconnect(springIn); } catch { /* ok */ }

    // echo → postEchoSat → echoSpringScrubber → spring (echoSpring order)
    if (echoOutNative) {
      try { echoOutNative.disconnect(this.postEchoSatBypass); } catch { /* ok */ }
      try { echoOutNative.disconnect(this.postEchoSat); } catch { /* ok */ }
    }
    try { this.postEchoSat.disconnect(this.postEchoSatWet); } catch { /* ok */ }
    try { this.postEchoSatBypass.disconnect(this._echoSpringScrubber); } catch { /* ok */ }
    try { this.postEchoSatWet.disconnect(this._echoSpringScrubber); } catch { /* ok */ }
    if (springInNative) {
      try { (this._echoSpringScrubber as AudioNode).disconnect(springInNative); } catch { /* ok */ }
    }

    // spring → echoSpringScrubber → echo (springEcho order)
    if (springOutNative) {
      try { springOutNative.disconnect(this._echoSpringScrubber); } catch { /* ok */ }
    }
    if (echoIn) {
      try { (this._echoSpringScrubber as AudioNode).disconnect(echoIn); } catch { /* ok */ }
    }

    // echo/spring → forwardScrubber → sidechain
    if (echoOutNative) {
      try { echoOutNative.disconnect(this._forwardScrubber); } catch { /* ok */ }
    }
    if (springOutNative) {
      try { springOutNative.disconnect(this._forwardScrubber); } catch { /* ok */ }
    }
    try { (this._forwardScrubber as AudioNode).disconnect(this.sidechain); } catch { /* ok */ }

    // postEchoSat → forwardScrubber / sidechain (for springEcho/parallel)
    try { this.postEchoSatBypass.disconnect(this._forwardScrubber); } catch { /* ok */ }
    try { this.postEchoSatWet.disconnect(this._forwardScrubber); } catch { /* ok */ }
    try { this.postEchoSatBypass.disconnect(this.sidechain); } catch { /* ok */ }
    try { this.postEchoSatWet.disconnect(this.sidechain); } catch { /* ok */ }

    // Direct Tone.connect fallbacks (only exist if native extraction failed)
    try { Tone.disconnect(springOut, this.sidechain as unknown as Tone.InputNode); } catch { /* ok */ }
    try { Tone.disconnect(echoOut, this.sidechain as unknown as Tone.InputNode); } catch { /* ok */ }
    try { Tone.disconnect(springOut, this.echo.input as unknown as Tone.InputNode); } catch { /* ok */ }
    try { Tone.disconnect(echoOut, springIn as unknown as Tone.InputNode); } catch { /* ok */ }

    // Feedback tap from echo output
    try { Tone.disconnect(echoOut, this.feedback as unknown as Tone.InputNode); } catch { /* ok */ }
    try { this.feedback.disconnect(this._feedbackScrubber); } catch { /* ok */ }
    try { this._feedbackScrubber.disconnect(this.feedbackShelfComp); } catch { /* ok */ }
    try { this.feedbackShelfComp.disconnect(this.input); } catch { /* ok */ }
  }

  /**
   * Wire the core routing topology for the given chain order. Call after
   * _disconnectCoreRouting() or during initial graph build.
   *
   * Three orders:
   * - echoSpring: tapeSat → ECHO → [postEchoSat → scrubber] → SPRING → [scrubber] → sidechain
   * - springEcho: tapeSat → SPRING → [scrubber] → ECHO → [postEchoSat → scrubber] → sidechain
   * - parallel:   tapeSat → ECHO → [postEchoSat → sidechain] + SPRING → [scrubber → sidechain]
   *
   * All orders wire: echo.output → feedback → feedbackScrubber → feedbackShelfComp → input
   */
  private _applyCoreRouting(order: 'echoSpring' | 'springEcho' | 'parallel'): void {
    this._chainOrder = order;
    const echoIn = this.echo.input as unknown as Tone.InputNode;
    const springIn = this.spring.input as unknown as Tone.InputNode;
    const echoOut = this.echo.output as unknown as Tone.ToneAudioNode;
    const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;
    const echoOutNative = getNativeAudioNode(echoOut as unknown);
    const springOutNative = getNativeAudioNode(springOut as unknown);
    const echoInNative = getNativeAudioNode(this.echo.input as unknown);

    if (order === 'springEcho') {
      // tapeSat → spring
      Tone.connect(this.tapeSatBypass, springIn);
      Tone.connect(this.tapeStackMix, springIn);
      // spring → echoSpringScrubber → echo
      if (springOutNative) {
        springOutNative.connect(this._echoSpringScrubber);
      }
      if (echoInNative) {
        (this._echoSpringScrubber as AudioNode).connect(echoInNative);
      } else {
        Tone.connect(springOut, echoIn);
      }
      // echo → postEchoSat → forwardScrubber → sidechain
      if (echoOutNative) {
        echoOutNative.connect(this.postEchoSatBypass);
        echoOutNative.connect(this.postEchoSat);
        this.postEchoSat.connect(this.postEchoSatWet);
        this.postEchoSatBypass.connect(this._forwardScrubber);
        this.postEchoSatWet.connect(this._forwardScrubber);
        (this._forwardScrubber as AudioNode).connect(this.sidechain);
      } else {
        Tone.connect(echoOut, this.sidechain as unknown as Tone.InputNode);
      }
    } else if (order === 'parallel') {
      // tapeSat → both echo and spring
      Tone.connect(this.tapeSatBypass, echoIn);
      Tone.connect(this.tapeStackMix, echoIn);
      Tone.connect(this.tapeSatBypass, springIn);
      Tone.connect(this.tapeStackMix, springIn);
      // echo → postEchoSat → sidechain (no scrubber between, feeds sidechain directly)
      if (echoOutNative) {
        echoOutNative.connect(this.postEchoSatBypass);
        echoOutNative.connect(this.postEchoSat);
        this.postEchoSat.connect(this.postEchoSatWet);
        this.postEchoSatBypass.connect(this.sidechain);
        this.postEchoSatWet.connect(this.sidechain);
      }
      // spring → forwardScrubber → sidechain
      if (springOutNative) {
        springOutNative.connect(this._forwardScrubber);
        (this._forwardScrubber as AudioNode).connect(this.sidechain);
      } else {
        Tone.connect(springOut, this.sidechain as unknown as Tone.InputNode);
      }
    } else {
      // echoSpring (default): tapeSat → echo → [postEchoSat → scrubber] → spring → scrubber → sidechain
      Tone.connect(this.tapeSatBypass, echoIn);
      Tone.connect(this.tapeStackMix, echoIn);
      // echo → postEchoSat → echoSpringScrubber → spring
      this._connectEchoToSpring();
      // spring → forwardScrubber → sidechain
      if (springOutNative) {
        springOutNative.connect(this._forwardScrubber);
        (this._forwardScrubber as AudioNode).connect(this.sidechain);
      } else {
        console.warn('[DubBus] spring.output native extraction failed — bypassing forward scrubber');
        Tone.connect(springOut, this.sidechain as unknown as Tone.InputNode);
      }
    }

    // Feedback regen: echo output → feedback → scrubber → shelfComp → input.
    // Common to all orders — feedback always taps the echo output.
    Tone.connect(echoOut, this.feedback as unknown as Tone.InputNode);
    this.feedback.connect(this._feedbackScrubber);
    this._feedbackScrubber.connect(this.feedbackShelfComp);
    this.feedbackShelfComp.connect(this.input);
  }

  /** Async splice path for the ECHO→SPRING scrubber. Mirror of
   *  _loadForwardScrubberWorklet — swap in the real worklet once its
   *  module finishes loading, preserving connections.
   *  Chain-order-aware: reconnects neighbors based on _chainOrder. */
  private async _loadEchoSpringScrubberWorklet(): Promise<void> {
    if (this._echoSpringScrubberIsWorklet) return;
    const versionBefore = this._routingVersion;
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      if (!DubBus._scrubberModuleLoaded.has(this.context)) {
        let p = DubBus._scrubberModulePromises.get(this.context);
        if (!p) {
          p = this.context.audioWorklet.addModule(`${base}worklets/nan-scrubber.worklet.js`);
          DubBus._scrubberModulePromises.set(this.context, p);
        }
        await p;
        DubBus._scrubberModuleLoaded.add(this.context);
      }
      // If routing changed during the async load, abandon — a rebuild already happened
      if (this._routingVersion !== versionBefore) return;

      const worklet = new AudioWorkletNode(this.context, 'nan-scrubber', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: { mode: 'forward' },
      });
      // Disconnect old passthrough node from its neighbors
      try { (this._echoSpringScrubber as GainNode).disconnect(); } catch { /* ok */ }
      // Disconnect fan-in sources from old node
      const springOutNative = getNativeAudioNode(
        (this.spring as unknown as { output: Tone.ToneAudioNode }).output as unknown
      );
      if (this._chainOrder === 'echoSpring') {
        // echoOut → postEchoSat → old_scrubber → spring
        try { this.postEchoSatBypass.disconnect(this._echoSpringScrubber); } catch { /* ok */ }
        try { this.postEchoSatWet.disconnect(this._echoSpringScrubber); } catch { /* ok */ }
      } else if (this._chainOrder === 'springEcho') {
        // springOut → old_scrubber → echo
        if (springOutNative) {
          try { springOutNative.disconnect(this._echoSpringScrubber); } catch { /* ok */ }
        }
      }
      // parallel order doesn't use the echoSpring scrubber — skip

      this._echoSpringScrubber = worklet;
      this._echoSpringScrubberIsWorklet = true;

      // Reconnect with new worklet based on current chain order
      const springInNative = getNativeAudioNode(this.spring.input as unknown);
      const echoInNative = getNativeAudioNode(this.echo.input as unknown);
      if (this._chainOrder === 'echoSpring') {
        try { this.postEchoSatBypass.connect(worklet); } catch { /* ok */ }
        try { this.postEchoSatWet.connect(worklet); } catch { /* ok */ }
        if (springInNative) {
          try { worklet.connect(springInNative); } catch { /* ok */ }
        }
      } else if (this._chainOrder === 'springEcho') {
        if (springOutNative) {
          try { springOutNative.connect(worklet); } catch { /* ok */ }
        }
        if (echoInNative) {
          try { worklet.connect(echoInNative); } catch { /* ok */ }
        }
      }
    } catch (err) {
      console.warn('[DubBus] echo→spring NaN-scrubber worklet load failed — using passthrough:', err);
    }
  }


  /**
   * Hot-swap the echo engine without dropping audio. Ramps the return gain
   * to 0 for 20 ms, disconnects old engine, creates new one, reconnects,
   * then ramps back up. The brief silence window masks the graph splice.
   */
  private _swapEchoEngine(settings: DubBusSettings, deferredPreset?: Exclude<DubBusSettings['characterPreset'], 'custom'>): void {
    const newType = settings.echoEngine;
    if (newType === this._currentEchoEngine) return;
    console.log(`[DubBus] Swapping echo engine: ${this._currentEchoEngine} → ${newType} (deferredPreset=${deferredPreset ?? 'none'})`);
    this._snap(`pre-swap ${this._currentEchoEngine}→${newType}`);
    this._muteHoldActive = true;
    this._pendingPostHoldSettings = null;
    const ctx = this.context;
    const RAMP_SEC = 0.02;
    /* Warmup hold: covers the new WASM echo engine's DC/LF startup transient.
       Previously 800ms to cover spring burst envelope, but spring I/O is
       now explicitly muted during the hold (muteInput+muteOutput) so no
       energy accumulates. 400ms is sufficient for WASM worklet boot
       (~50ms with pre-heated modules) + param settle + safety margin. */
    const WARMUP_SEC = 0.40;

    /* Fully quiesce the bus during the splice. Just ramping `return_` to 0
       masks output but leaves the internal graph live — the forward chain
       (hpf→bassShelf→…) and the external feedback tap (echo.output →
       feedback → feedbackShelfComp → input) continue to process while
       the engine is disposed, recreated, and rewired. Disposing a live
       ToneAudioNode can emit a one-block transient, which combined with
       the new RE-201's fallback-start produced NaN in the biquad chain
       (state is bad, permanent). Transactional swap: mute input gate,
       zero external feedback, then splice, then unmute. */
    const priorInputGain = this.input.gain.value;
    const priorFeedbackGain = this.feedback.gain.value;
    /* Capture the target sidechain threshold so we can restore it after
       the warmup. During the burst the compressor must be disabled —
       otherwise the DynamicsCompressorNode enters deep gain reduction
       (attack 2ms, release 180ms exponential) and takes 1-2s to recover,
       killing audible reverb even after return_ unmutes. */
    const targetThreshold = -6 - (settings.sidechainAmount ?? 0.15) * 30;
    try {
      const now = ctx.currentTime;
      this.return_.gain.cancelScheduledValues(now);
      this.return_.gain.setValueAtTime(this.return_.gain.value, now);
      this.return_.gain.linearRampToValueAtTime(0, now + RAMP_SEC);

      this.input.gain.cancelScheduledValues(now);
      this.input.gain.setValueAtTime(this.input.gain.value, now);
      this.input.gain.linearRampToValueAtTime(0, now + RAMP_SEC);

      this.feedback.gain.cancelScheduledValues(now);
      this.feedback.gain.setValueAtTime(this.feedback.gain.value, now);
      this.feedback.gain.linearRampToValueAtTime(0, now + RAMP_SEC);

      // Bypass BOTH compressors during the transition. Setting threshold
      // to 0 isn't enough — the spring burst peaks at +8dB, which still
      // triggers 6.7dB gain reduction at ratio 6:1. Setting ratio=1
      // makes gain_reduction = 0 regardless of signal level. Also bypass
      // the glue compressor (threshold -14, ratio 3:1) for the same reason.
      this.sidechain.ratio.cancelScheduledValues(now);
      this.sidechain.ratio.setValueAtTime(1, now);
      this.glue.ratio.cancelScheduledValues(now);
      this.glue.ratio.setValueAtTime(1, now);
    } catch { /* ok */ }

    // Schedule the swap after the ramp completes
    setTimeout(() => {
      try {
        // Disconnect old echo from graph
        this._disconnectCoreRouting();
        try { this.echo.output.disconnect(); } catch { /* ok */ }
        try { this.echo.dispose(); } catch { /* ok */ }

        // Create new engine
        this.echo = createDubEchoEngine(newType, settings);
        this._currentEchoEngine = newType;

        // Reconnect using current chain order
        this._applyCoreRouting(this._chainOrder);

        // Apply deferred character preset NOW — return_ is at 0, so the
        // spring burst can't reach master. Compressors are bypassed (ratio=1),
        // so they won't lock up from the burst either.
        if (deferredPreset) {
          this._applyCharacterPreset(deferredPreset);
          this._lastAppliedPreset = deferredPreset;
        }

        /* Unmute: input recovers immediately (no signal in ≠ no signal out
           problem). Feedback + return_ stay at 0 for WARMUP_SEC, then ramp
           up. This mutes the new echo's startup transient + spring param
           burst before it can self-amplify through feedback or bass-shelf
           boost through spring and slam the compressor. */
        const now2 = ctx.currentTime;
        this.input.gain.cancelScheduledValues(now2);
        this.input.gain.setValueAtTime(0, now2);
        this.input.gain.linearRampToValueAtTime(priorInputGain, now2 + RAMP_SEC);

        this.feedback.gain.cancelScheduledValues(now2);
        this.feedback.gain.setValueAtTime(0, now2);
        this.feedback.gain.setValueAtTime(0, now2 + WARMUP_SEC);
        this.feedback.gain.linearRampToValueAtTime(priorFeedbackGain, now2 + WARMUP_SEC + RAMP_SEC);

        this.return_.gain.cancelScheduledValues(now2);
        this.return_.gain.setValueAtTime(0, now2);
        this.return_.gain.setValueAtTime(0, now2 + WARMUP_SEC);
        this.return_.gain.linearRampToValueAtTime(
          this.enabled ? settings.returnGain : 0,
          now2 + WARMUP_SEC + RAMP_SEC,
        );

        // Mute spring I/O during warmup: spring param changes (length,
        // chaos, scatter, tone) can excite internal waveguide resonances.
        // muteInput() prevents new audio from entering the spring (so no
        // energy accumulates). muteOutput() zeros wetGain so any residual
        // resonance from the param change is discarded. Both are restored
        // in the warmup-release setTimeout below.
        try { this.spring.muteInput(); } catch { /* ok */ }
        try { this.spring.muteOutput(); } catch { /* ok */ }

        // Restore compressor ratios after the warmup — the burst has
        // settled by now and the compressors start from a clean state.
        this.sidechain.ratio.cancelScheduledValues(now2);
        this.sidechain.ratio.setValueAtTime(1, now2);
        this.sidechain.ratio.setTargetAtTime(6, now2 + WARMUP_SEC, 0.02);
        this.glue.ratio.cancelScheduledValues(now2);
        this.glue.ratio.setValueAtTime(1, now2);
        this.glue.ratio.setTargetAtTime(3, now2 + WARMUP_SEC, 0.02);
        // Also restore the sidechain threshold (it was set during
        // setSettings but the swap's immediate write may have overridden it).
        this.sidechain.threshold.setTargetAtTime(targetThreshold, now2 + WARMUP_SEC, 0.05);

        console.log(`[DubBus] swap warmup armed: feedback→${priorFeedbackGain.toFixed(3)} return_→${(this.enabled ? settings.returnGain : 0).toFixed(3)} threshold→${targetThreshold.toFixed(1)}dB after ${(WARMUP_SEC*1000).toFixed(0)}ms hold`);
        // Snap again after warmup completes so we can see whether the bus
        // actually recovered (or something else pinned gains to 0).
        setTimeout(() => {
          this._snap(`post-swap-warmup ${this._currentEchoEngine}`);
          try { this.spring.unmuteInput(); } catch { /* ok */ }
          try { this.spring.unmuteOutput(); } catch { /* ok */ }
          this._muteHoldActive = false;
          // Replay any settings that were suppressed during the hold
          if (this._pendingPostHoldSettings) {
            const pending = this._pendingPostHoldSettings;
            this._pendingPostHoldSettings = null;
            const now3 = ctx.currentTime;
            this.return_.gain.setTargetAtTime(
              this.enabled ? pending.returnGain : 0, now3, 0.02,
            );
            if (!this._draining && this.enabled) {
              const threshold = -6 - pending.sidechainAmount * 30;
              this.sidechain.threshold.setTargetAtTime(threshold, now3, 0.05);
            }
          }
        }, (WARMUP_SEC + RAMP_SEC) * 1000 + 20);
      } catch (err) {
        console.error('[DubBus] Echo engine swap failed:', err);
        this._muteHoldActive = false;
        this._pendingPostHoldSettings = null;
        /* Recovery: try to restore gains so the bus isn't permanently
           silenced by a swap failure. */
        try {
          const t = ctx.currentTime;
          this.input.gain.setValueAtTime(priorInputGain, t);
          this.feedback.gain.setValueAtTime(priorFeedbackGain, t);
          this.return_.gain.setValueAtTime(this.enabled ? settings.returnGain : 0, t);
          this.sidechain.threshold.setValueAtTime(targetThreshold, t);
          this.sidechain.ratio.setValueAtTime(6, t);
          this.glue.ratio.setValueAtTime(3, t);
        } catch { /* ok */ }
      }
    }, RAMP_SEC * 1000 + 5);
  }

  /**
   * Swap the optional plate-stage insert. `stage` = 'off' tears down the
   * current plate (if any); 'madprofessor' or 'dattorro' builds a new
   * plate and wires it in parallel from stereoMerge back to the return.
   * Wet level comes from `settings.plateStageMix` (0-1).
   *
   * The plate is ADDITIVE: bus.spring + bus.echo still run their normal
   * chain. The plate adds a colored tail on top. Bypass it by setting
   * plateStageMix=0 OR plateStage='off'. The 'off' path also disposes
   * the WASM worklet so a disabled plate costs nothing.
   */
  setPlateStage(stage: DubBusSettings['plateStage']): void {
    console.log(`[DubBusCtrl] setPlateStage(${stage})`);
    if (stage === this.settings.plateStage && this.plateStage !== null) return;
    this._teardownPlateStage();
    this.settings = { ...this.settings, plateStage: stage };
    if (stage !== 'off') {
      this._installPlateStage(stage, this.settings.plateStageMix);
    }
  }

  /** Set the plate-stage wet amount (0..1). No-op when plateStage='off'. */
  setPlateStageMix(mix: number): void {
    const clamped = Math.max(0, Math.min(1, mix));
    console.log(`[DubBusCtrl] setPlateStageMix(${clamped.toFixed(3)})`);
    this.settings = { ...this.settings, plateStageMix: clamped };
    if (this.plateSend) this.plateSend.gain.value = clamped;
  }

  /** Build + wire the plate stage. stereoMerge → plateSend → plate → return_. */
  private _installPlateStage(stage: 'madprofessor' | 'dattorro', mix: number): void {
    try {
      const plate: MadProfessorPlateEffect | DattorroPlateEffect =
        stage === 'madprofessor'
          ? new MadProfessorPlateEffect({ wet: 1 })
          : new DattorroPlateEffect({ wet: 1 });
      const send = this.context.createGain();
      send.gain.value = Math.max(0, Math.min(1, mix));
      Tone.connect(this.stereoMerge, send);
      const plateInput = (plate as unknown as { input: { input: AudioNode } }).input.input;
      send.connect(plateInput);
      Tone.connect(plate, this.return_);
      this.plateStage = plate;
      this.plateSend = send;
      console.log(`[DubBus] plateStage installed: ${stage} mix=${mix.toFixed(2)}`);
    } catch (err) {
      console.warn(`[DubBus] plateStage install failed (${stage}):`, err);
      this.plateStage = null;
      this.plateSend = null;
    }
  }

  /** Tear down the plate-stage insert if present. Idempotent. */
  private _teardownPlateStage(): void {
    if (this.plateSend) {
      try { this.plateSend.disconnect(); } catch { /* ok */ }
      this.plateSend = null;
    }
    if (this.plateStage) {
      try { this.plateStage.disconnect(); } catch { /* ok */ }
      try { this.plateStage.dispose(); } catch { /* ok */ }
      this.plateStage = null;
    }
  }

  // ─── Return EQ public API ───────────────────────────────────────────────

  /** Set the primary return EQ band (band 2 peaking). Used by eqSweep move. */
  setReturnEQ(freq: number, gain: number, q: number): void {
    this.returnEQ.setB2Freq(freq);
    this.returnEQ.setB2Gain(gain);
    this.returnEQ.setB2Q(q);
    this.settings = {
      ...this.settings,
      returnEqEnabled: gain !== 0,
      returnEqFreq: freq,
      returnEqGain: gain,
      returnEqQ: q,
    };
  }

  /** Get the current return EQ band 2 frequency (for sweep animation). */
  getReturnEQFreq(): number { return this.settings.returnEqFreq; }
  /** Get current return EQ band 2 gain. */
  getReturnEQGain(): number { return this.settings.returnEqGain; }
  /** Get current return EQ band 2 Q. */
  getReturnEQQ(): number { return this.settings.returnEqQ; }

  // EQ sweep state — managed by DubBus so panic/dispose can clean up.
  private _eqSweepTimer: ReturnType<typeof setInterval> | null = null;
  private _eqSweepPrior: { freq: number; gain: number; q: number } | null = null;

  /** Start an EQ sweep from startHz to endHz over sweepSec. Returns disposer.
   *  Uses audioContext.currentTime as clock. Snapshots prior EQ state. */
  startEQSweep(startHz: number, endHz: number, gain: number, q: number, sweepSec: number): () => void {
    // Snapshot prior state
    this._eqSweepPrior = {
      freq: this.settings.returnEqFreq,
      gain: this.settings.returnEqGain,
      q: this.settings.returnEqQ,
    };
    const startTime = this.context.currentTime;
    this.setReturnEQ(startHz, gain, q);

    this._eqSweepTimer = setInterval(() => {
      const elapsed = this.context.currentTime - startTime;
      const t = Math.min(elapsed / sweepSec, 1);
      // Exponential interpolation for perceptually linear frequency sweep
      const freq = startHz * Math.pow(endHz / startHz, t);
      this.returnEQ.setB2Freq(freq);
      this.settings = { ...this.settings, returnEqFreq: freq };
      if (t >= 1) this.stopEQSweep();
    }, 16);

    return () => this.stopEQSweep();
  }

  /** Stop the EQ sweep and restore prior state. */
  stopEQSweep(): void {
    if (this._eqSweepTimer) {
      clearInterval(this._eqSweepTimer);
      this._eqSweepTimer = null;
    }
    if (this._eqSweepPrior) {
      this.setReturnEQ(
        this._eqSweepPrior.freq,
        this._eqSweepPrior.gain,
        this._eqSweepPrior.q,
      );
      this._eqSweepPrior = null;
    }
  }

  /** Read the current springs dry/wet — diagnostic for gig-sims/tests.
   *  AelapseEffect doesn't expose a param reader, so we mirror it in

   *  `_springWetCache`. */
  getSpringWet(): number { return this._springWetCache; }

  /**
   * Expose the sidechain compressor's input node so the per-channel
   * isolation router can feed a specific channel's audio into the
   * detector when `sidechainSource === 'channel'`. The returned node IS
   * the DynamicsCompressorNode — downstream callers treat it as a plain
   * AudioNode input. G13.
   *
   * NB: the current architecture uses a single-input compressor, so
   * connecting a channel tap here adds that channel's audio to the bus
   * output as well as driving detection. For most performance contexts
   * that's acceptable (the channel's own dubSend is usually already
   * non-zero); a pure detection-only sidechain would need a dedicated
   * analyser path in a future revision.
   */
  getSidechainInput(): AudioNode { return this.sidechain; }

  private echo: DubEchoEngine;
  private _currentEchoEngine: DubBusSettings['echoEngine'] = DEFAULT_DUB_BUS.echoEngine;
  private sidechain: DynamicsCompressorNode;  // fast (pumping)
  private glue: DynamicsCompressorNode;       // slow (dubplate glue)
  private lpf: BiquadFilterNode;      // sweep-able LPF on return
  private return_: GainNode;
  private feedback: GainNode;         // echo → feedback → input (siren)
  private noise: AudioBufferSourceNode;  // pink noise loop
  private noiseGain: GainNode;           // -55 dBFS level
  private enabled = DEFAULT_DUB_BUS.enabled;
  private settings: DubBusSettings = { ...DEFAULT_DUB_BUS };

  // ─── Master-insert TONE EQ ─────────────────────────────────────────────
  // The TONE sliders in the Dub Deck (BASS shelf, MID scoop, WIDTH) shape
  // the ENTIRE master output when the bus is enabled — not just the wet
  // return. This is how real dub engineers work: the whole mix takes on
  // the dub voicing. Without this path, a +12 dB BASS boost on the bus
  // would only lift the wet portion (~35 % of the audible signal) and
  // feel subtle. Here we insert between `masterEffectsInput` and `blepInput`
  // so the dry + wet sum gets shaped.
  private masterBassShelf!: BiquadFilterNode;
  private masterMidScoop!: BiquadFilterNode;
  private masterLpf!: BiquadFilterNode;
  // Safety soft-clip between bass shelf and the rest of the master insert
  // chain. Prevents extreme low-shelf boosts (±18 dB at 200 Hz) from
  // producing overflow peaks that would break downstream worklets
  // (ToneArm / VinylNoise). Transparent at normal levels; tanh-saturates
  // gracefully above ±1.0.
  private masterSafetyClip!: WaveShaperNode;
  // Chorus-on-master (dub finisher) — crossfaded in via masterChorusWet.
  private masterChorusDelayL!: DelayNode;
  private masterChorusDelayR!: DelayNode;
  private masterChorusLfoL!: OscillatorNode;
  private masterChorusLfoR!: OscillatorNode;
  private masterChorusLfoGainL!: GainNode;
  private masterChorusLfoGainR!: GainNode;
  private masterChorusWet!: GainNode;
  private masterChorusDry!: GainNode;
  // Club Simulator — Tone.Convolver with a generated small-room IR.
  private masterConvolver: ConvolverNode | null = null;
  private masterConvolverWet!: GainNode;
  private masterConvolverDry!: GainNode;
  // JA Press vinyl — DSP comes from dedicated effect classes (below).
  // vinylSum is the tail gain that feeds masterInsertTail.
  private vinylSum!: GainNode;
  private vinylLevel = 0;  // 0..1 (0..10 scaled)
  // Direct output tap — clicks/scratches bypass the master insert chain
  // (EQ, LPF, width matrix, chorus, convolver) so they sound like pure
  // vinyl transients on the finished output, not FX-colored noise bursts.
  // Connected to masterChannel native input in wireMasterInsert.
  private vinylDirect!: GainNode;
  // Real vinyl DSP — combined ToneArm (physics: wow/flutter/coil/RIAA/
  // stylus) + VinylNoiseEffect (surface degradation: dust/dropout/age/
  // ghostEcho/warp/eccentricity/pinch/innerGroove). Chained in series
  // inside the master-insert path: convolverSum → toneArm → vinylNoise
  // → vinylSum. Both load their worklets lazily; synchronous pass-
  // through until ready.
  private toneArmEffect: ToneArmEffect | null = null;
  private vinylEffect: VinylNoiseEffect | null = null;
  // Stereo width on master — M/S matrix identical in topology to the
  // bus-level one but operating on the final mix.
  private masterSplit!: ChannelSplitterNode;
  private masterMid!: GainNode;
  private masterSide!: GainNode;
  private masterInvertR!: GainNode;
  private masterMerge!: ChannelMergerNode;
  // Wiring tracking so enable/disable can splice in + out cleanly.
  private masterInsertHead!: AudioNode;   // where the incoming source should connect
  private masterInsertTail!: AudioNode;   // what connects onward to the master destination
  /**
   * G15: envelope gain between the insert's output and the destination.
   * Sits at `masterInsertTail → masterInsertEnvelope → dest`. Ramped to 0
   * before rewiring and back to 1 after, so the abrupt chain swap happens
   * during silence instead of mid-buffer (audible as a click/thump in the
   * old flow). Ramp is ~10 ms; total mute window including settle is
   * MASTER_INSERT_MUTE_MS. Stays at 1 during steady-state.
   */
  private masterInsertEnvelope!: GainNode;
  /** Pending rewire timer (so concurrent enable-disable-enable cancels cleanly). */
  private masterInsertPending: ReturnType<typeof setTimeout> | null = null;
  private masterInsertSource: AudioNode | null = null;
  private masterInsertDest: AudioNode | null = null;
  private masterInsertActive = false;

  // DJ deck taps — each is a GainNode with gain=0 at rest. When attached to a
  // DJ mixer, the mixer's deck input connects INTO these, which feed the bus.
  // Dub-action pads raise these gains to spill deck audio into the bus.
  private deckTaps: Map<DeckId, GainNode> = new Map();
  // Deck-only HPF, hardcoded at 180 Hz. Every deck tap routes through this
  // before reaching the bus input, so DJ use ALWAYS "dodges kicks" — deck
  // bass never enters the echo tail, keeping the kick punchy and the dub
  // texture clean. The bus-wide hpf (above) stays at the user's setting
  // (default 40 Hz = effectively off) so drumpad pads + tracker channels,
  // which feed the bus input directly, pass their bass through.
  private deckHpf!: BiquadFilterNode;
  // Tracker channel taps — per-channel native GainNode instances registered by
  // ChannelRoutedEffects when a channel's dubSend > 0. Used by openChannelTap
  // so echoThrow can momentarily bump a channel's send to full. Native
  // GainNodes (not Tone.Gain) because the worklet output is a raw AudioNode;
  // wrapping in Tone.Gain would add an unnecessary node without buying
  // anything (all the methods we use are native AudioParam APIs).
  private channelTaps: Map<number, GainNode> = new Map();

  // Deck-scoped per-channel taps — DJ view registers these via
  // registerDeckChannelTap(deckId, ch, sourceGain) so two decks with a
  // channel 3 don't collide. Each entry holds the source disposer (for
  // teardown) and the bus-side modulation gain (what openChannelTap
  // ramps to execute DUB moves).
  //
  // Wiring: sourceGain → busGain → deckHpf → input. busGain starts at
  // 0 so idle taps cost nothing audibly.
  private deckChannelTaps: Map<string, { busGain: GainNode; disposeSource: () => void }> = new Map();
  private attachedMixer: DJMixerEngine | null = null;
  // Track mixer→tap connections so we can cleanly detach if the mixer changes.
  private mixerTapConnections: Array<{ nativeFrom: AudioNode; to: GainNode }> = [];
  // In-flight dub-action releasers, keyed so releasing the same action re-uses
  // (e.g. pressing the same throw pad while the prior one is decaying).
  private actionReleasers: Map<string, () => void> = new Map();
  // Timers scheduled by throwDeck that will fire their releaser after the
  // hold window expires. Held here so dispose() can clear them — otherwise
  // a timer that fires post-dispose tries to write to torn-down AudioParams.
  private throwTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  // setInterval handles for continuous modulation moves (tapeWobble).
  // Kept separate because clearInterval / clearTimeout aren't cross-compatible.
  private wobbleHandles: Set<ReturnType<typeof setInterval>> = new Set();
  // Reverse-capture worklet — lazily allocated on first backwardReverb fire.
  // Sits as a silenced tap off `input` and maintains a 2 s ring buffer so
  // snapshots can be time-reversed and played back through the bus chain.
  private reverseCapture: AudioWorkletNode | null = null;
  private reverseCaptureSilencer: GainNode | null = null;
  private reverseCaptureInit: Promise<void> | null = null;
  // When true, setSettings suppresses writes to echoIntensity and
  // springWet on the live nodes. Set by `dubPanic` while draining the echo
  // / spring buffers; cleared by the restore timer after the drain window.
  // Required because the store's mirror effect writes the user-configured
  // values back on any dubBus change during the drain, which would override
  // panic's `setIntensity(0)` and leave a loud echo ghost when the user
  // re-enables the bus (audible at high intensity settings — ~-13 dB of
  // the pre-panic tail at default intensity=0.62 after 1 s).
  private _draining = false;
  private _miniDrainPending = false;
  // Last character preset whose DSP-side bits (spring params + tape-sat
  // curve) were applied. Lets setSettings skip redundant rebuilds when the
  // mirror effect fires setSettings with unchanged preset name.
  private _lastTapeMode: DubBusSettings['tapeSatMode'] | null = null;
  // Same gating pattern for plateStage — swap only on real transition.
  private _lastPlateStage: DubBusSettings['plateStage'] | null = null;
  private _lastAppliedPreset: DubBusSettings['characterPreset'] = 'custom';
  // Once-per-engine warning latches so we don't flood the console during a
  // live set if the bus is disabled or the mixer isn't attached. Reset when
  // the condition clears (attach succeeds / bus gets enabled).
  private _warnedBusDisabled = false;
  private _warnedNoMixer = false;
  private _disposed = false;
  /**
   * Mute-hold guard. While true, `_applySettings` skips writes to
   * `return_.gain` and `sidechain.threshold` so a re-entrant
   * `setSettings` call (PadGrid mirror effect, DJ deck sync, etc.)
   * can't insert a setTargetAtTime event that defeats the warmup hold.
   *
   * Set by both `_swapEchoEngine` (engine swap) and `_warmupMute`
   * (same-engine preset transitions). Cleared when the hold timer
   * fires. Any settings suppressed during the hold are replayed from
   * `_pendingPostHoldSettings` once the hold ends.
   */
  private _muteHoldActive = false;
  private _pendingPostHoldSettings: DubBusSettings | null = null;

  // SID mode — when active, dub synths use real SID chip emulation (GTUltra)
  private _sidSynths: import('./SIDDubSynths').SIDDubSynths | null = null;
  private _sidMode = false;
  // SID echo throw: reference to the C64SIDEngine's dubSendGain node.
  // When an echo throw fires in SID mode, we boost this gain temporarily
  // (full-mix throw — authentic dub technique since SID is monolithic).
  private _sidDubSendGain: GainNode | null = null;
  private _sidDubSendBaseline = 0.4;
  // Per-channel dub send amounts for whole-mix fallback (websid has no per-voice output)
  private _sidChannelDubSends: number[] = [0, 0, 0];
  // Set to true only when registerSidVoiceTaps ran (jsSID with per-voice outputs).
  // websid has no per-voice output → stays false, so setSidVoiceDubSend uses
  // whole-mix Path 2 instead of being fooled by stale non-SID channelTaps
  // left over from prior tracker sessions.
  private _sidHasPerVoiceTaps = false;
  // Callback to apply a make-up gain on the SID engine's master output when
  // the dub bus is enabled/disabled. Registered by NativeEngineRouting when
  // the SID engine comes online. Kept as a callback (not a node reference)
  // so DubBus doesn't need to know about ENGINE_GAIN or jsSID's separate
  // AudioContext path.
  private _sidBoostHandler: ((boost: number) => void) | null = null;
  private _sidBoostAmount = 2.0; // ~+6 dB make-up when dub enabled in SID mode

  private readonly context: AudioContext;
  private readonly master: AudioNode;

  constructor(context: AudioContext, master: AudioNode) {
    this.context = context;
    this.master = master;
    _activeDubBus = this;
    // Build the shared Dub Bus: input → HPF → Spring → Echo → Sidechain → return → master
    // The return gain is gated by enabled — when disabled, return.gain = 0
    // so sends have zero effect (no audible bus output, but graph stays wired).
    this.input = this.context.createGain();
    this.input.gain.value = 1;

    // HPF cascade (18 dB/oct). All three stages share frequency + Q at runtime.
    const initialHpfFreq = this.settings.hpfStepped
      ? snapToAltecStep(this.settings.hpfCutoff)
      : this.settings.hpfCutoff;
    this.hpf = this.context.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = initialHpfFreq;
    this.hpf.Q.value = 0.707;
    this.hpf2 = this.context.createBiquadFilter();
    this.hpf2.type = 'highpass';
    this.hpf2.frequency.value = initialHpfFreq;
    this.hpf2.Q.value = 0.707;
    this.hpf3 = this.context.createBiquadFilter();
    this.hpf3.type = 'highpass';
    this.hpf3.frequency.value = initialHpfFreq;
    this.hpf3.Q.value = 0.707;
    this.hpf.connect(this.hpf2);
    this.hpf2.connect(this.hpf3);

    // Tubby bass shelf — resonant low-shelf at 90 Hz (research default).
    // Positioned AFTER the HPF so the shelf doesn't re-amplify rumble the
    // HPF just removed.
    this.bassShelf = this.context.createBiquadFilter();
    this.bassShelf.type = 'lowshelf';
    this.bassShelf.frequency.value = this.settings.bassShelfFreqHz;
    this.bassShelf.Q.value = this.settings.bassShelfQ;
    this.bassShelf.gain.value = Math.max(-12, Math.min(12, this.settings.bassShelfGainDb));

    // Scientist mid-scoop — peaking cut around 700 Hz. Inserted on the
    // return side between Glue compressor and the final LPF so it shapes
    // the post-compression (already spatialized) signal.
    this.midScoop = this.context.createBiquadFilter();
    this.midScoop.type = 'peaking';
    this.midScoop.frequency.value = this.settings.midScoopFreqHz;
    this.midScoop.Q.value = this.settings.midScoopQ;
    this.midScoop.gain.value = this.settings.midScoopGainDb;

    // ─── Master-insert TONE EQ (dry + wet together) ──────────────────────
    // Identical filter types to bus-level, but operates on the full master
    // signal. Starts flat (gain 0) and only becomes audible once the bus
    // is enabled AND the user's TONE settings are non-neutral.
    this.masterBassShelf = this.context.createBiquadFilter();
    this.masterBassShelf.type = 'lowshelf';
    this.masterBassShelf.frequency.value = this.settings.bassShelfFreqHz;
    this.masterBassShelf.Q.value = this.settings.bassShelfQ;
    this.masterBassShelf.gain.value = 0;  // flat until wired in by enable
    this.masterMidScoop = this.context.createBiquadFilter();
    this.masterMidScoop.type = 'peaking';
    this.masterMidScoop.frequency.value = this.settings.midScoopFreqHz;
    this.masterMidScoop.Q.value = this.settings.midScoopQ;
    this.masterMidScoop.gain.value = 0;
    // Master LPF — bypassed (18 kHz) by default. Tape-stop moves sweep
    // this down to ~400 Hz to mask the resampler aliasing that LibOpenMPT
    // produces at extreme slowdown factors.
    this.masterLpf = this.context.createBiquadFilter();
    this.masterLpf.type = 'lowpass';
    this.masterLpf.frequency.value = 18000;
    this.masterLpf.Q.value = 0.707;
    // Safety clipper — tanh curve that's effectively linear up to ±0.9
    // and softly saturates beyond. Prevents extreme bass-shelf boosts
    // (up to +18 dB) from producing overflow peaks that break downstream
    // worklets.
    this.masterSafetyClip = this.context.createWaveShaper();
    {
      const n = 2048;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;  // -1..1
        // Gentle tanh: linear below ~0.8, smooth soft-clip above
        curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2);
      }
      this.masterSafetyClip.curve = curve;
    }
    this.masterSafetyClip.oversample = '2x';
    // Master Chorus — two detuned delays (L/R) with slow LFOs, crossfaded
    // via masterChorusWet. Dry at 1.0 always; wet ramps in/out on toggle.
    // Classic dub "chorus on the whole finished track" polish.
    this.masterChorusDelayL = this.context.createDelay(0.05);
    this.masterChorusDelayR = this.context.createDelay(0.05);
    this.masterChorusDelayL.delayTime.value = 0.012;
    this.masterChorusDelayR.delayTime.value = 0.018;
    this.masterChorusLfoL = this.context.createOscillator();
    this.masterChorusLfoR = this.context.createOscillator();
    this.masterChorusLfoL.type = 'sine';
    this.masterChorusLfoR.type = 'sine';
    this.masterChorusLfoL.frequency.value = 0.8;
    this.masterChorusLfoR.frequency.value = 1.1;
    this.masterChorusLfoGainL = this.context.createGain();
    this.masterChorusLfoGainR = this.context.createGain();
    this.masterChorusLfoGainL.gain.value = 0.004;  // 4ms depth
    this.masterChorusLfoGainR.gain.value = 0.004;
    this.masterChorusLfoL.connect(this.masterChorusLfoGainL);
    this.masterChorusLfoGainL.connect(this.masterChorusDelayL.delayTime);
    this.masterChorusLfoR.connect(this.masterChorusLfoGainR);
    this.masterChorusLfoGainR.connect(this.masterChorusDelayR.delayTime);
    this.masterChorusLfoL.start();
    this.masterChorusLfoR.start();
    this.masterChorusDry = this.context.createGain();
    this.masterChorusDry.gain.value = 1;
    this.masterChorusWet = this.context.createGain();
    this.masterChorusWet.gain.value = 0;  // off by default
    // Club Simulator convolver — IR generated on-demand when user toggles on.
    this.masterConvolverDry = this.context.createGain();
    this.masterConvolverDry.gain.value = 1;
    this.masterConvolverWet = this.context.createGain();
    this.masterConvolverWet.gain.value = 0;
    // JA Press vinyl — VinylNoiseEffect + (future: ToneArmEffect) own the
    // DSP. `vinylSum` is the tail that feeds masterInsertTail; the vinyl
    // effects are created later (see below) and wired into the chain.
    this.vinylSum = this.context.createGain();
    this.vinylSum.gain.value = 1;
    // M/S width matrix — 4-gain topology mirroring the proven bus-level
    // `_applyStereoWidth` coefficients:
    //   L_out = L×coeffA + R×coeffB
    //   R_out = L×coeffB + R×coeffA
    //   coeffA = 0.5 + 0.5×width, coeffB = 0.5 − 0.5×width
    // (width=0 → mono, 1 → passthrough, 2 → wide biased).
    this.masterSplit = this.context.createChannelSplitter(2);
    this.masterMerge = this.context.createChannelMerger(2);
    this.masterMid  = this.context.createGain();   // L→L path (coeffA)
    this.masterSide = this.context.createGain();   // R→R path (coeffA)
    this.masterInvertR = this.context.createGain();// L→R path (coeffB)
    const masterSideInvertL = this.context.createGain(); // R→L path (coeffB)
    // Initial width=1 → coeffA=1, coeffB=0
    this.masterMid.gain.value = 1;
    this.masterSide.gain.value = 1;
    this.masterInvertR.gain.value = 0;
    masterSideInvertL.gain.value = 0;
    // EQ pre-chain: in → bassShelf → safety-clip → midScoop → LPF → split
    this.masterBassShelf.connect(this.masterSafetyClip);
    this.masterSafetyClip.connect(this.masterMidScoop);
    this.masterMidScoop.connect(this.masterLpf);
    this.masterLpf.connect(this.masterSplit);
    // L contributions
    this.masterSplit.connect(this.masterMid, 0);
    this.masterMid.connect(this.masterMerge, 0, 0);
    this.masterSplit.connect(this.masterInvertR, 0);
    this.masterInvertR.connect(this.masterMerge, 0, 1);
    // R contributions
    this.masterSplit.connect(masterSideInvertL, 1);
    masterSideInvertL.connect(this.masterMerge, 0, 0);
    this.masterSplit.connect(this.masterSide, 1);
    this.masterSide.connect(this.masterMerge, 0, 1);
    // Stash the R→L cross-gain so the width update can reach it later.
    (this.masterSide as unknown as { _invertL?: GainNode })._invertL = masterSideInvertL;
    // Chorus post-merge: merger → delayL + delayR → chorusWet; direct → chorusDry.
    // Both dry + wet feed the convolver dry/wet, and both of those feed tail.
    const chorusSum = this.context.createGain();
    this.masterMerge.connect(this.masterChorusDry);
    this.masterMerge.connect(this.masterChorusDelayL);
    this.masterMerge.connect(this.masterChorusDelayR);
    this.masterChorusDelayL.connect(this.masterChorusWet);
    this.masterChorusDelayR.connect(this.masterChorusWet);
    this.masterChorusDry.connect(chorusSum);
    this.masterChorusWet.connect(chorusSum);
    // chorusSum → convolver dry/wet sum
    chorusSum.connect(this.masterConvolverDry);
    // Wet path added on-demand when clubSim enabled (convolver created lazily).
    const convolverSum = this.context.createGain();
    this.masterConvolverDry.connect(convolverSum);
    this.masterConvolverWet.connect(convolverSum);
    // Vinyl chain — ToneArm (physics) → VinylNoise (surface defects) → vinylSum.
    // Params all start at 0; setVinylLevel scales them together 0-10.
    this.toneArmEffect = new ToneArmEffect({
      wow: 0, coil: 0, flutter: 0, riaa: 0, stylus: 0, hiss: 0, pops: 0, rpm: 33.333, wet: 1,
    });
    this.vinylEffect = new VinylNoiseEffect({
      hiss: 0, dust: 0, age: 0, speed: 0,
      riaa: 0, stylusResonance: 0, wornStylus: 0, pinch: 0,
      innerGroove: 0, ghostEcho: 0, dropout: 0, warp: 0, eccentricity: 0,
      wet: 1,
    });
    Tone.connect(convolverSum, this.toneArmEffect.input as unknown as Tone.InputNode);
    Tone.connect(this.toneArmEffect.output as unknown as Tone.ToneAudioNode, this.vinylEffect.input as unknown as Tone.InputNode);
    Tone.connect(this.vinylEffect.output as unknown as Tone.ToneAudioNode, this.vinylSum as unknown as Tone.InputNode);
    // Direct-output tap for vinyl clicks/scratches — bypasses every
    // master-side FX so the transients land on the output as raw vinyl
    // defects, not "FX-chain processed noise bursts". Wired to the master
    // destination node when wireMasterInsert runs.
    this.vinylDirect = this.context.createGain();
    this.vinylDirect.gain.value = 1;
    this.masterInsertHead = this.masterBassShelf;
    // G15: insert the envelope gain between vinylSum (chain tail) and the
    // destination that wireMasterInsert will connect to. Steady-state gain
    // is 1 (full passthrough); ramped to 0 around (dis)connection events
    // so the chain swap happens during silence instead of mid-buffer.
    this.masterInsertEnvelope = this.context.createGain();
    this.masterInsertEnvelope.gain.value = 1;
    this.vinylSum.connect(this.masterInsertEnvelope);
    this.masterInsertTail = this.masterInsertEnvelope;

    // Liquid sweep — parallel comb-filter branch. See class-level docstring.
    // The LFO runs continuously (can't stop + restart an OscillatorNode),
    // so "off" = sweepOutput.gain = 0. Starts at the preset's amount + LFO
    // rate + depth; mid-session updates via setSettings.
    this.sweepInput = this.context.createGain();
    this.sweepInput.gain.value = 1;
    this.sweepDelay = this.context.createDelay(0.02);  // max 20 ms
    this.sweepDelay.delayTime.value = 0.005;            // 5 ms center
    this.sweepLfo = this.context.createOscillator();
    this.sweepLfo.type = 'sine';
    this.sweepLfo.frequency.value = this.settings.sweepRateHz;
    this.sweepLfoGain = this.context.createGain();
    this.sweepLfoGain.gain.value = this.settings.sweepDepthMs / 1000;  // ms → sec
    this.sweepLfo.connect(this.sweepLfoGain);
    this.sweepLfoGain.connect(this.sweepDelay.delayTime);
    this.sweepLfo.start();
    this.sweepFeedback = this.context.createGain();
    this.sweepFeedback.gain.value = this.settings.sweepFeedback;
    this.sweepFeedbackHpf = this.context.createBiquadFilter();
    this.sweepFeedbackHpf.type = 'highpass';
    this.sweepFeedbackHpf.frequency.value = 200;
    this.sweepFeedbackHpf.Q.value = 0.707;
    // Wet send level — 0 disables the branch entirely.
    this.sweepOutput = this.context.createGain();
    this.sweepOutput.gain.value = this.settings.sweepAmount;
    // Comb and phaser branch gains — crossfade based on sweepMode.
    // Both wired permanently; only one has gain > 0 at a time.
    const isComb = this.settings.sweepMode !== 'phaser';
    this.combOutput = this.context.createGain();
    this.combOutput.gain.value = isComb ? 1 : 0;
    this.phaserOutput = this.context.createGain();
    this.phaserOutput.gain.value = isComb ? 0 : 1;
    // Phaser — CalfPhaser WASM. Constructed with mix=1 so it outputs
    // effect-only (no dry pass-through; we don't want to double-feed dry).
    this.phaser = new CalfPhaserEffect({
      rate: this.settings.phaserRate,
      depth: this.settings.phaserDepth,
      stages: this.settings.phaserStages,
      feedback: this.settings.phaserFeedback,
      stereoPhase: 90,
      mix: 1.0,
      wet: 1.0,
    });
    // Topology: hpf3 → sweepInput → sweepDelay → combOutput ─┐
    //                                ↓ (feedback branch)       ├→ sweepOutput → tapeSat
    //                     sweepFeedback → sweepFeedbackHpf     │
    //           sweepInput → phaser → phaserOutput ───────────┘
    this.sweepInput.connect(this.sweepDelay);
    this.sweepDelay.connect(this.sweepFeedback);
    this.sweepFeedback.connect(this.sweepFeedbackHpf);
    this.sweepFeedbackHpf.connect(this.sweepDelay);
    this.sweepDelay.connect(this.combOutput);
    this.combOutput.connect(this.sweepOutput);
    // Phaser branch: sweepInput → phaser → phaserOutput → sweepOutput
    Tone.connect(this.sweepInput as unknown as Tone.OutputNode, this.phaser.input);
    Tone.connect(this.phaser.output, this.phaserOutput as unknown as Tone.InputNode);
    this.phaserOutput.connect(this.sweepOutput);

    // Return EQ — 4-band WASM parametric inserted between midScoop and LPF.
    // Always 100% wet (series insert). Bands start flat unless a character
    // preset enables them. Band 2 is the primary "sweep" band.
    this.returnEQ = new ParametricEQEffect({
      b1Freq: this.settings.returnEqB1Freq,
      b1Gain: this.settings.returnEqB1Gain,
      b1Q:    this.settings.returnEqB1Q,
      b2Freq: this.settings.returnEqFreq,
      b2Gain: this.settings.returnEqEnabled ? this.settings.returnEqGain : 0,
      b2Q:    this.settings.returnEqQ,
      b3Freq: this.settings.returnEqB3Freq,
      b3Gain: this.settings.returnEqB3Gain,
      b3Q:    this.settings.returnEqB3Q,
      b4Freq: this.settings.returnEqB4Freq,
      b4Gain: this.settings.returnEqB4Gain,
      b4Q:    this.settings.returnEqB4Q,
      wet:    1.0,
    });

    // Post-echo tape saturation — same curve as pre-echo tapeSat but
    // positioned AFTER echo output, BEFORE spring. First echo repeat
    // overdrives hard; subsequent repeats are quieter → lighter distortion.
    this.postEchoSat = this.context.createWaveShaper();
    this.postEchoSat.curve = makeTapeSatCurve(this.settings.postEchoSatDrive);
    this.postEchoSat.oversample = '2x';
    this.postEchoSatBypass = this.context.createGain();
    this.postEchoSatBypass.gain.value = this.settings.postEchoSatEnabled ? 0 : 1;
    this.postEchoSatWet = this.context.createGain();
    this.postEchoSatWet.gain.value = this.settings.postEchoSatEnabled ? 1 : 0;

    // Ring modulator — parallel send. Carrier × input creates metallic textures.
    this.ringMod = new RingModEffect({
      frequency: this.settings.ringModFreq,
      waveform:  this.settings.ringModWaveform,
      mix:       this.settings.ringModMix,
      wet:       1.0,
    });
    this.ringModSend = this.context.createGain();
    this.ringModSend.gain.value = this.settings.ringModEnabled ? this.settings.ringModAmount : 0;

    // Lo-fi / voltage starve — Bitta WASM bitcrusher
    this.lofi = new BittaEffect({
      crush: this.settings.lofiBits,
      mix:   1.0,
      wet:   1.0,
    });
    this.lofiSend = this.context.createGain();
    this.lofiSend.gain.value = this.settings.lofiEnabled ? 1 : 0;
    this.lofiBypass = this.context.createGain();
    this.lofiBypass.gain.value = this.settings.lofiEnabled ? 0 : 1;

    // External feedback loop: return → extFeedbackEq → extFeedbackGain → input.
    // Messian Dread's core technique: loop the wet output back to the echo
    // input through the mixer channel so you get EQ + fader control on every
    // repeat. Distinct from the internal echo feedback — this path adds
    // mixer coloration to each recirculation.
    this.extFeedbackGain = this.context.createGain();
    this.extFeedbackGain.gain.value = Math.min(0.85, this.settings.extFeedbackGain);
    this.extFeedbackEq = this.context.createBiquadFilter();
    this.extFeedbackEq.type = 'peaking';
    this.extFeedbackEq.frequency.value = this.settings.extFeedbackEqFreq;
    this.extFeedbackEq.gain.value = this.settings.extFeedbackEqGain;
    this.extFeedbackEq.Q.value = this.settings.extFeedbackEqQ;
    // One-block delay: Web Audio requires a native DelayNode in every
    // cycle for topological sorting. The WASM echo engines have internal
    // delays but they're inside AudioWorkletNodes, not native DelayNodes.
    // Without this, the cycle return_ → ... → input → ... → return_ is
    // illegal and Chrome silences every node in the cycle.
    this.extFeedbackDelay = this.context.createDelay(0.01);
    this.extFeedbackDelay.delayTime.value = 128 / this.context.sampleRate;

    // Club simulation: ConvolverNode with synthetic IR on the master output.
    // Dry/wet crossfade so clubSimMix=0 is pure dry, 1 is pure wet.
    this.clubConvolver = this.context.createConvolver();
    this.clubDry = this.context.createGain();
    this.clubWet = this.context.createGain();
    const clubEnabled = this.settings.clubSimEnabled;
    this.clubDry.gain.value = clubEnabled ? 1 - this.settings.clubSimMix : 1;
    this.clubWet.gain.value = clubEnabled ? this.settings.clubSimMix : 0;
    // Generate initial IR
    if (clubEnabled) {
      const preset = CLUB_IR_PRESETS[this.settings.clubSimPreset] ?? CLUB_IR_PRESETS.soundSystem;
      this.clubConvolver.buffer = generateIR(this.context, preset);
      this._clubSimPreset = this.settings.clubSimPreset;
    }

    // Tape saturation — asymmetric tanh curve that models the positive/negative
    // asymmetry of transformer-coupled magnetic tape. Softens positive peaks
    // more than negative, which is what gives RE-201 / Studer saturation its
    // distinctive warmth (not the razor-edge of digital clipping). Sits before
    // the echo so the crunch gets chopped up into repeats, not smeared over
    // the whole tail.
    this.tapeSat = this.context.createWaveShaper();
    this.tapeSat.curve = makeTapeSatCurve(0.35);
    this.tapeSat.oversample = '2x';
    // Single-path bypass gate — gain 1 when tapeSatMode='single', 0 when 'stack'.
    this.tapeSatBypass = this.context.createGain();
    this.tapeSatBypass.gain.value = this.settings.tapeSatMode === 'single' ? 1 : 0;

    // Build the 3-path tape stack. Each path: split-in (1/3 gain) → wow
    // delay (modulated by its own LFO with distinct starting phase) →
    // WaveShaper (distinct drive) → per-path mix gain. All 3 sum into
    // tapeStackMix, which is gated to 0 in 'single' mode.
    this.tapeStackMix = this.context.createGain();
    this.tapeStackMix.gain.value = this.settings.tapeSatMode === 'stack' ? 1 : 0;
    const STACK_DRIVES = [0.25, 0.45, 0.65];
    const STACK_WOW_HZ = [0.27, 0.41, 0.53];      // Hz — uncorrelated
    const STACK_WOW_MS = [0.0012, 0.0022, 0.0034];// ±ms excursion (tiny)
    const stackStart = this.context.currentTime + 0.01;
    for (let i = 0; i < 3; i++) {
      const inGain = this.context.createGain();
      inGain.gain.value = 1 / 3;   // split evenly
      const delay = this.context.createDelay(0.01);
      delay.delayTime.value = 0.002;
      const lfo = this.context.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = STACK_WOW_HZ[i];
      const lfoGain = this.context.createGain();
      lfoGain.gain.value = STACK_WOW_MS[i];
      lfo.connect(lfoGain).connect(delay.delayTime);
      // Phase offset — start each LFO at a distinct point so wow phases
      // don't realign. OscillatorNode doesn't expose phase directly, so we
      // start the 2nd and 3rd LFOs slightly later (millisecond offsets).
      lfo.start(stackStart + i * 0.137);
      const shaper = this.context.createWaveShaper();
      shaper.curve = makeTapeSatCurve(STACK_DRIVES[i]);
      shaper.oversample = '2x';
      const outGain = this.context.createGain();
      outGain.gain.value = 1;
      // Wiring: inGain → delay → shaper → outGain → tapeStackMix
      inGain.connect(delay);
      delay.connect(shaper);
      shaper.connect(outGain);
      outGain.connect(this.tapeStackMix);
      this.tapeStackPaths.push({ inGain, delay, delayLfo: lfo, delayLfoGain: lfoGain, shaper, outGain });
    }

    // Spring reverb — Aelapse (C++ → WASM port of the smiarx/aelapse spring
    // tank sim). Parameters tuned for King Tubby "metal tank" character:
    // short length + heavy damping + scatter + a touch of chaos gives the
    // snappy single-slap that defines the dub spring sound. Delay side
    // disabled because DubBus already runs SpaceEcho as its dedicated
    // tape-head chain.
    this._springWetCache = this.settings.springWet;
    this.spring = new AelapseEffect({
      delayActive:    false,
      springsActive:  true,
      springsDryWet:  this.settings.springWet,
      springsWidth:   1.0,   // full stereo splay
      springsLength:  0.35,  // short tank — slap, not cathedral
      springsDecay:   0.45,  // moderate decay
      springsDamp:    0.55,  // heavy damping tames HF ring
      springsShape:   0.30,  // softer transient shape
      springsTone:    0.55,  // slight high-mid emphasis
      springsScatter: 0.60,  // strong per-spring scatter = metallic character
      springsChaos:   0.15,  // a touch of chaos for organic motion
      wet:            1.0,   // dry/wet happens via springsDryWet; Aelapse
                             // top-level wet stays at 1 so the chain passes
                             // through fully processed audio.
    });

    this.echo = createDubEchoEngine(this.settings.echoEngine, this.settings);

    // Sidechain pumping — fast: catches transients, makes the tail breathe
    // under the drums. Not a true kick-keyed sidechain (would need per-pad
    // routing) but the fast-attack/release compression produces the same
    // "duck on every hit" feel.
    this.sidechain = this.context.createDynamicsCompressor();
    this.sidechain.threshold.value = -28;
    this.sidechain.ratio.value = 6;
    this.sidechain.attack.value = 0.002;
    this.sidechain.release.value = 0.18;
    this.sidechain.knee.value = 6;

    // Glue compressor — slow: models the compression character of cutting
    // a dub straight to acetate lathe. Soft attack (30ms) lets transients
    // through but then settles gently; long release (300ms) welds the whole
    // tail into one coherent sustained thing instead of a pile of effects.
    // This is the "finished dub record" texture that modern digital chains
    // miss when they stop at the pumping compressor.
    this.glue = this.context.createDynamicsCompressor();
    this.glue.threshold.value = -14;
    this.glue.ratio.value = 3;
    this.glue.attack.value = 0.030;
    this.glue.release.value = 0.300;
    this.glue.knee.value = 8;

    // Sweepable LPF on the return — drops dub into "underwater" muffle.
    // Open position (~20 kHz) is effectively transparent.
    this.lpf = this.context.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 20000;
    this.lpf.Q.value = 0.707;

    // Stereo width M/S matrix — see `_updateStereoWidth` for the coefficient
    // math. Four gain nodes implement M+S decode: L contributes coeffA to
    // left-out + coeffB to right-out; R contributes coeffB to left-out +
    // coeffA to right-out. coeffA = 0.5 + 0.5*width, coeffB = 0.5 - 0.5*width.
    //   width=0 → mono  (both outs = M)
    //   width=1 → pass  (L→L, R→R)
    //   width=2 → wide  (doubled side)
    this.stereoSplit = this.context.createChannelSplitter(2);
    this.stereoMerge = this.context.createChannelMerger(2);
    this.stereoMid = this.context.createGain();          // L → left_out contribution
    this.stereoSide = this.context.createGain();         // R → right_out contribution
    this.stereoInvertR = this.context.createGain();      // L → right_out contribution
    const stereoInvertL = this.context.createGain();     // R → left_out contribution (private, only for topology below)
    // L path:
    this.stereoSplit.connect(this.stereoMid, 0);   // L gain
    this.stereoMid.connect(this.stereoMerge, 0, 0);
    this.stereoSplit.connect(this.stereoInvertR, 0);  // L → right out
    this.stereoInvertR.connect(this.stereoMerge, 0, 1);
    // R path:
    this.stereoSplit.connect(stereoInvertL, 1);   // R → left out
    stereoInvertL.connect(this.stereoMerge, 0, 0);
    this.stereoSplit.connect(this.stereoSide, 1);   // R gain
    this.stereoSide.connect(this.stereoMerge, 0, 1);
    // Cache the "R to left" node for the width update — stash it on the
    // side node via a non-enumerable back-reference.
    (this.stereoSide as unknown as { _invertL?: GainNode })._invertL = stereoInvertL;

    this.return_ = this.context.createGain();
    this.return_.gain.value = this.enabled ? this.settings.returnGain : 0;

    // Feedback loop for siren self-oscillation. At rest gain=0 → no loop.
    // When raised toward 0.9+, the echo's output recirculates into the input
    // and climbs until hitting the tank/tape saturation ceiling — that's the
    // classic King Tubby siren/wobble. Capped internally at 0.95 to avoid
    // runaway blowups regardless of settings.
    this.feedback = this.context.createGain();
    this.feedback.gain.value = 0;

    // Compensating low-shelf in the feedback return path. Mirrors the
    // forward-path bassShelf gain as a negative value so bass frequencies
    // see 0 dB net gain per feedback iteration. Updated alongside
    // bassShelf in _applySettings().
    this.feedbackShelfComp = this.context.createBiquadFilter();
    this.feedbackShelfComp.type = 'lowshelf';
    this.feedbackShelfComp.frequency.value = this.settings.bassShelfFreqHz;
    this.feedbackShelfComp.Q.value = this.settings.bassShelfQ;
    this.feedbackShelfComp.gain.value = -Math.max(-12, Math.min(12, this.settings.bassShelfGainDb));

    /* NaN/Inf scrubber + soft-limiter. Two scrubbers, one on each
       NaN-vulnerable path leaving the WASM/native echo engine:

         (a) FEEDBACK tap: echo.output → feedback → SCRUBBER →
             feedbackShelfComp → input. Protects the hpf cascade, bassShelf,
             feedbackShelfComp from latching on a single bad sample.

         (b) FORWARD tap: spring.output → SCRUBBER → sidechain. Protects
             midScoop, lpf, masterBassShelf, masterMidScoop, masterLpf
             (the 5 forward-chain biquads that latched after
             anotherDelay→re201 swap on 2026-04-29 even with the feedback
             scrubber active — RE-201's first WASM block emitted NaN that
             flowed forward through spring into the post-spring biquads).

       Preferred path: 'nan-scrubber' AudioWorklet module is pre-loaded by
       ToneEngine during app boot, so both nodes instantiate synchronously
       here — NO placeholder, NO async splice race. Fallback path: if the
       pre-load hasn't landed (cold boot, hot-reload, different
       AudioContext), each falls back to a GainNode passthrough and kicks
       off the matching async splice via _loadFeedbackScrubberWorklet /
       _loadForwardScrubberWorklet. The worklet's tanh soft-limiter at
       ±0.95 also caps feedback runaway so the loop cannot grow past unity
       even if the comp mirror desyncs mid-ramp. */
    const makeScrubber = (mode: 'feedback' | 'forward'): { node: AudioNode; isWorklet: boolean } => {
      try {
        const w = new AudioWorkletNode(this.context, 'nan-scrubber', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          processorOptions: { mode },
        });
        return { node: w, isWorklet: true };
      } catch {
        const g = this.context.createGain();
        g.gain.value = 1;
        return { node: g, isWorklet: false };
      }
    };
    const fb = makeScrubber('feedback');
    this._feedbackScrubber = fb.node;
    this._feedbackScrubberIsWorklet = fb.isWorklet;
    if (!fb.isWorklet) void this._loadFeedbackScrubberWorklet();

    const fwd = makeScrubber('forward');
    this._forwardScrubber = fwd.node;
    this._forwardScrubberIsWorklet = fwd.isWorklet;
    if (!fwd.isWorklet) void this._loadForwardScrubberWorklet();

    const es = makeScrubber('forward');
    this._echoSpringScrubber = es.node;
    this._echoSpringScrubberIsWorklet = es.isWorklet;
    if (!es.isWorklet) void this._loadEchoSpringScrubberWorklet();

    // Pink noise floor — ~-55 dBFS continuous noise that you don't notice
    // during normal play, but becomes audible during mute-and-dub drops as
    // the "tape hiss" texture of vintage dub records. Two-second loop buffer
    // is enough to avoid obvious periodicity at this level.
    const noiseBuffer = makePinkNoiseBuffer(this.context, 2);
    this.noise = this.context.createBufferSource();
    this.noise.buffer = noiseBuffer;
    this.noise.loop = true;
    this.noiseGain = this.context.createGain();
    // **Gig fix (2026-04-18):** previously the pink-noise floor ramped up to
    // -55 dBFS whenever the bus was enabled, to simulate vintage tape hiss.
    // At -55 dBFS plus the bus return gain + echo intensity + spring reverb
    // feedback, the hiss compounded into audible white noise whenever the
    // user opened the drumpad view with a persisted bus-enabled state.
    // Keeping the node plumbed in case we ever reintroduce a user-facing
    // "tape hiss" knob, but gain is clamped to 0 at construction AND at
    // every enable toggle below.
    this.noiseGain.gain.value = 0;

    // Wire the vintage Tubby/Scientist chain (with coloring stages inserted):
    //   input → HPF → BassShelf → TapeSat → Echo → Spring
    //                                        │
    //                          feedbackShelfComp ← feedback ← echoOut
    //
    //   The feedbackShelfComp mirrors bassShelf's gain as a CUT so the
    //   round-trip bass gain through the feedback loop stays at 0 dB.
    //   Without it, +12 dB bass boost × 0.5 feedback = 2× per iteration
    //   → stable full-amplitude bass drone.
    //
    //   Spring.output → Sidechain → Glue → MidScoop → LPF → StereoMS → return → master
    this.input.connect(this.hpf);
    // hpf → hpf2 → hpf3 chain was wired in construction; hpf3 is the cascade output.
    this.hpf3.connect(this.bassShelf);
    // bassShelf output feeds BOTH the single-path saturator AND the 3-path
    // stack in parallel. The two paths crossfade via tapeSatBypass/tapeStackMix
    // gains on their output side; echo input receives their sum.
    this.bassShelf.connect(this.tapeSat);
    this.tapeSat.connect(this.tapeSatBypass);
    for (const path of this.tapeStackPaths) {
      this.bassShelf.connect(path.inGain);
    }
    // Parallel liquid-sweep branch — taps hpf3 output, sums into the
    // saturator input (pre-shaper) so flanged audio also gets the tape
    // coloring + stack behavior when enabled.
    this.hpf3.connect(this.sweepInput);
    this.sweepOutput.connect(this.tapeSat);
    for (const path of this.tapeStackPaths) {
      this.sweepOutput.connect(path.inGain);
    }
    // ─── Chain order routing ─────────────────────────────────────────────
    // Handled by _applyCoreRouting() which wires the topology for the
    // chosen order (echoSpring / springEcho / parallel).
    this._applyCoreRouting(this.settings.chainOrder);
    // ─── Common downstream wiring (all chain orders) ─────────────────────
    this.sidechain.connect(this.glue);
    this.glue.connect(this.midScoop);
    // Return EQ: midScoop → returnEQ → lpf
    Tone.connect(this.midScoop as unknown as Tone.OutputNode, this.returnEQ.input);
    Tone.connect(this.returnEQ.output, this.lpf as unknown as Tone.InputNode);
    this.lpf.connect(this.stereoSplit);
    // Lo-fi (bitcrusher): inline on the main path via dry/wet crossfade.
    // stereoMerge → lofiBypass → return (dry, gain=1 when off)
    // stereoMerge → lofi → lofiSend → return (wet, gain=1 when on)
    this.stereoMerge.connect(this.lofiBypass);
    Tone.connect(this.stereoMerge as unknown as Tone.OutputNode, this.lofi.input);
    Tone.connect(this.lofi.output, this.lofiSend as unknown as Tone.InputNode);
    this.lofiBypass.connect(this.return_);
    this.lofiSend.connect(this.return_);

    // Ring modulator: additive parallel send from stereoMerge.
    // Adds metallic texture on top of the main signal.
    Tone.connect(this.stereoMerge as unknown as Tone.OutputNode, this.ringMod.input);
    Tone.connect(this.ringMod.output, this.ringModSend as unknown as Tone.InputNode);
    this.ringModSend.connect(this.return_);

    // Club simulation: return → dry/wet split → master.
    // When off (default): only the dry path is wired (return_ → clubDry → master).
    // The ConvolverNode is NOT connected until club sim is enabled, because
    // a ConvolverNode with null buffer can cause browser-specific audio
    // graph issues (silent output, rendering errors) on some Chrome versions.
    this.return_.connect(this.clubDry);
    this.clubDry.connect(this.master);
    this.clubWet.connect(this.master);
    if (clubEnabled) {
      this.return_.connect(this.clubConvolver);
      this.clubConvolver.connect(this.clubWet);
      this._clubConvolverWired = true;
    }

    // External feedback loop: return → EQ → gain → delay → input (back to echo).
    // At gain=0 (default), no feedback. When raised, each echo repeat
    // recirculates through the full bus chain (EQ, saturation, spring)
    // gaining mixer coloration each pass. Capped at 0.85 to prevent
    // runaway self-oscillation. The DelayNode ensures the cycle is legal
    // for Web Audio's topological sort.
    this.return_.connect(this.extFeedbackEq);
    this.extFeedbackEq.connect(this.extFeedbackGain);
    this.extFeedbackGain.connect(this.extFeedbackDelay);
    this.extFeedbackDelay.connect(this.input);

    // Optional plate-stage insert — branches from stereoMerge into the
    // selected plate (MadProfessor or Dattorro), blends back into return
    // at `plateStageMix`. Bypassed when `plateStage === 'off'`. Created
    // lazily so a bus running plateStage='off' pays zero WASM overhead.
    if (this.settings.plateStage !== 'off') {
      this._installPlateStage(this.settings.plateStage, this.settings.plateStageMix);
    }

    // Apply initial stereo width (other coloring params are set via node.gain/
    // frequency defaults above).
    this._applyStereoWidth(this.settings.stereoWidth);
    // Noise source into input — runs always; masked by the return gain going
    // to zero when the bus is disabled.
    this.noise.connect(this.noiseGain);
    this.noiseGain.connect(this.input);
    this.noise.start(0);

    // DJ-only HPF — single instance shared across all deck taps. Fixed at
    // 180 Hz so the DJ path always dodges kicks regardless of the user's
    // bus-wide hpf setting. Not exposed as a user knob — this is a
    // structural DJ-use convention, not a preset tweakable.
    this.deckHpf = this.context.createBiquadFilter();
    this.deckHpf.type = 'highpass';
    this.deckHpf.frequency.value = 180;
    this.deckHpf.Q.value = 0.707;
    this.deckHpf.connect(this.input);

    // Create per-deck tap gains. Always exist so dub-action handlers can
    // modulate them without null checks; only feed audio when a DJ mixer is
    // attached via attachDJMixer(). At rest gain=0 so bus hears nothing from
    // the decks until a dub-action pad opens the tap.
    for (const deck of DECK_IDS) {
      const tap = this.context.createGain();
      tap.gain.value = 0;
      tap.connect(this.deckHpf);   // routed through DJ-only HPF, not direct to input
      this.deckTaps.set(deck, tap);
    }

    // Pre-heat: load all WASM modules in the background so the first engine
    // swap is instant. Without this, the first swap to RE201/AnotherDelay/
    // RETapeEcho incurs 200-900ms of WASM fetch + compile latency ON TOP of
    // the 800ms warmup hold. After pre-heat, modules are cached and worklet
    // boot is ~50ms.
    void this._preheatWASMModules();
  }

  /** The bus input node — pad sources connect to this. */
  get inputNode(): GainNode { return this.input; }

  /** Pre-load all WASM effect modules so the first engine swap is instant. */
  private async _preheatWASMModules(): Promise<void> {
    try {
      await Promise.allSettled([
        RE201Effect.ensureModuleLoaded(this.context),
        AnotherDelayEffect.ensureModuleLoaded(this.context),
        RETapeEchoEffect.ensureModuleLoaded(this.context),
        AelapseEffect.ensureInitialized(this.context),
      ]);
      console.log('[DubBus] WASM modules pre-heated');
    } catch {
      console.warn('[DubBus] WASM pre-heat partial failure (non-fatal)');
    }
  }

  /** Whether the bus is currently enabled (return gain > 0). */
  get isEnabled(): boolean { return this.enabled; }

  /** Whether SID dub synths are active (real SID chip emulation). */
  get isSIDMode(): boolean { return this._sidMode; }

  /**
   * Enable SID mode — dub synths use real SID chip emulation via GTUltra WASM.
   * Lazy-loads the engine on first call. The SID output is routed through the
   * dub bus echo/spring chain for authentic dub processing.
   */
  async enableSIDMode(): Promise<void> {
    if (this._sidMode) return;
    this._sidMode = true;

    try {
      const { SIDDubSynths } = await import('./SIDDubSynths');
      if (!this._sidSynths) {
        this._sidSynths = new SIDDubSynths();
      }
      await this._sidSynths.init(this.context);
      // Route SID synth output into the dub bus input chain
      const output = this._sidSynths.output;
      if (output) {
        try { output.connect(this.input); } catch { /* already connected */ }
      }
      console.log('[DubBus] SID mode enabled — dub synths use real SID chip emulation');
    } catch (err) {
      console.warn('[DubBus] SID mode init failed, falling back to WebAudio:', err);
      this._sidMode = false;
    }
  }

  /** Disable SID mode — revert to WebAudio Tone.js dub synths. */
  disableSIDMode(): void {
    if (!this._sidMode) return;
    this._sidMode = false;
    // Restore SID master gain to baseline if we had boosted it — when the
    // user switches tracker songs the dub bus may stay enabled while the
    // SID engine goes away, and we must not leak boost onto a non-SID
    // engine that later reuses the handler slot.
    if (this._sidBoostHandler) {
      try { this._sidBoostHandler(1); } catch { /* ok */ }
    }
    if (this._sidSynths) {
      const output = this._sidSynths.output;
      if (output) {
        try { output.disconnect(this.input); } catch { /* ok */ }
      }
      // Don't dispose — keep the engine warm for quick re-enable
    }
    this._sidDubSendGain = null;
    this._sidHasPerVoiceTaps = false;
    console.log('[DubBus] SID mode disabled — dub synths use WebAudio');
  }

  /**
   * Register the C64SIDEngine's dubSendGain so echo throws can boost it.
   * Called by NativeEngineRouting after connectDubSend().
   */
  registerSidDubSend(gain: GainNode, baseline: number): void {
    this._sidDubSendGain = gain;
    this._sidDubSendBaseline = baseline;
  }

  /**
   * Register a make-up gain callback for the SID engine. Called with
   * boost=_sidBoostAmount when the dub bus is enabled (and SID mode is
   * active) and boost=1 when disabled, so the SID's dry output matches
   * the loudness of the dub-wet chain. The callback is typically
   * `(b) => c64SidEngine.setDubBoost(b)`.
   */
  registerSidBoostHandler(handler: (boost: number) => void): void {
    this._sidBoostHandler = handler;
    // If dub bus is already enabled when the SID comes online mid-session,
    // apply the boost immediately so the user doesn't have to toggle.
    if (this.enabled && this._sidMode) {
      try { handler(this._sidBoostAmount); } catch { /* ok */ }
    }
  }

  unregisterSidBoostHandler(): void {
    // Restore baseline before clearing so the SID doesn't get stuck boosted
    // if dub is disabled later while the handler is gone.
    if (this._sidBoostHandler) {
      try { this._sidBoostHandler(1); } catch { /* ok */ }
    }
    this._sidBoostHandler = null;
  }

  /**
   * Register per-voice SID output GainNodes as channel taps.
   * Each voice output connects to the dub bus input so echo throws
   * can independently boost individual SID voices into the echo.
   * The tap gains start at 0 (silent) — echo throws ramp them up.
   */
  registerSidVoiceTaps(voiceOutputs: GainNode[]): void {
    for (let i = 0; i < voiceOutputs.length; i++) {
      const tapGain = this.context.createGain();
      tapGain.gain.value = 0; // silent until echo throw opens the tap
      try {
        voiceOutputs[i].connect(tapGain);
        tapGain.connect(this.input);
      } catch (e) {
        console.warn(`[DubBus] Failed to connect SID voice ${i} tap:`, e);
        continue;
      }
      // Register as a standard channel tap so openChannelTap() works
      this.channelTaps.set(i, tapGain);
    }
    this._sidHasPerVoiceTaps = voiceOutputs.length > 0;
    console.log(`[DubBus] Registered ${voiceOutputs.length} per-voice SID taps`);
  }

  /**
   * Set the dub send level for a SID voice (channel 0-2).
   * Called by the mixer store when the user moves channel dub send sliders.
   * Returns true if the channel was handled (SID mode active).
   *
   * Two paths:
   *  1. jsSID with per-voice taps → controls individual voice tap gain
   *  2. websid (no per-voice output) → falls back to whole-mix dubSendGain,
   *     using the max of all channel slider values as the send level
   *
   * IMPORTANT: In SID mode we ALWAYS return true (even for voices >= 3 or
   * when _sidDubSendGain is null). If we returned false the mixer store
   * would fall through to ChannelRoutedEffects.setChannelDubSend which
   * activates a WASM dub slot on the Tone.js channel — that's for
   * tracker-channel routing which the SID bypasses entirely. Activating
   * those slots causes audio stutters from worklet setup and does nothing
   * useful (SID audio doesn't flow through those channels).
   */
  setSidVoiceDubSend(voiceIndex: number, amount: number): boolean {
    if (!this._sidMode) return false;
    const clamped = Math.max(0, Math.min(1, amount));
    const curved = applyDubSendCurve(clamped);

    // Path 1: per-voice tap (jsSID only — we registered them explicitly).
    // Guarded by _sidHasPerVoiceTaps so stale non-SID channelTaps left over
    // from prior tracker sessions don't fool us into touching the wrong node.
    if (this._sidHasPerVoiceTaps) {
      const tap = this.channelTaps.get(voiceIndex);
      if (tap) {
        const now = this.context.currentTime;
        tap.gain.cancelScheduledValues(now);
        tap.gain.setValueAtTime(tap.gain.value, now);
        tap.gain.linearRampToValueAtTime(curved, now + 0.02);
        return true;
      }
    }

    // Path 2: whole-mix dub send (websid + any voice index < 3)
    if (this._sidDubSendGain && voiceIndex >= 0 && voiceIndex < 3) {
      this._sidChannelDubSends[voiceIndex] = clamped;
      const maxSend = applyDubSendCurve(Math.max(...this._sidChannelDubSends));
      const now = this.context.currentTime;
      this._sidDubSendGain.gain.cancelScheduledValues(now);
      this._sidDubSendGain.gain.setValueAtTime(this._sidDubSendGain.gain.value, now);
      this._sidDubSendGain.gain.linearRampToValueAtTime(maxSend, now + 0.02);
      return true;
    }

    // SID mode active but this voice index has no effect (>= 3 or no send
    // gain). Still return true to keep the mixer store from falling through
    // to tracker-channel dub activation, which would stutter the SID audio.
    return true;
  }

  /**
   * Unregister the SID dub send (called when SID engine stops).
   */
  unregisterSidDubSend(): void {
    this._sidDubSendGain = null;
    this._sidChannelDubSends = [0, 0, 0];
    this._sidHasPerVoiceTaps = false;
    // Clean up per-voice taps
    for (let i = 0; i < 3; i++) {
      const tap = this.channelTaps.get(i);
      if (tap) {
        try { tap.disconnect(); } catch { /* ok */ }
        this.channelTaps.delete(i);
      }
    }
  }

  /**
   * Attach a DJ mixer so dub-action pads can pull deck audio into the bus.
   * Connects each deck's pre-crossfader tap into this bus's deck-tap gain
   * node. Tap gains stay at 0 — action handlers open them on demand.
   *
   * Safe to call after construction; can be called again to switch
   * mixers (previous connections are cleaned up first).
   */
  attachDJMixer(mixer: DJMixerEngine): void {
    if (this.attachedMixer === mixer) return;
    this.detachDJMixer();
    this.attachedMixer = mixer;
    this._warnedNoMixer = false;  // we have a mixer now — reset warn latch
    let connectedCount = 0;
    for (const deck of DECK_IDS) {
      const mixerTap = mixer.getDeckTap(deck);
      const engineTap = this.deckTaps.get(deck);
      if (!mixerTap || !engineTap) continue;
      try {
        // Bridge Tone.Gain → raw GainNode via native node. Store the native
        // ref (not the Tone wrapper) so detachDJMixer can disconnect using
        // the same node identity — re-unwrapping the wrapper on detach risks
        // returning a different internal node and silently leaking the tap.
        const native = getNativeAudioNode(mixerTap as unknown as Tone.ToneAudioNode);
        if (!native) {
          console.warn(`[DubBus] attachDJMixer deck ${deck}: could not unwrap mixer tap to native node`);
          continue;
        }
        native.connect(engineTap);
        this.mixerTapConnections.push({ nativeFrom: native, to: engineTap });
        connectedCount++;
      } catch (err) {
        console.warn(`[DubBus] attachDJMixer: deck ${deck} tap connect failed:`, err);
      }
    }
    console.log(`[DubBus] attachDJMixer: ${connectedCount}/${DECK_IDS.length} deck taps connected, busEnabled=${this.enabled}`);
  }

  /** Tear down the deck-tap connections to the attached mixer. */
  detachDJMixer(): void {
    for (const { nativeFrom, to } of this.mixerTapConnections) {
      try { nativeFrom.disconnect(to); } catch { /* already gone */ }
    }
    this.mixerTapConnections = [];
    this.attachedMixer = null;
  }

  // ─── Dub Action API ────────────────────────────────────────────────────────
  // High-level operations driven by pad actions. All ramps use `setTargetAtTime`
  // with short time-constants so closures are click-free and composable.
  //
  // Every action returns a releaser. The bus also keeps an internal registry
  // of in-flight releasers keyed by action; pressing the same action while one
  // is already fading cancels the prior fade and starts fresh.

  private _scheduleExclusiveRelease(key: string, release: () => void): () => void {
    // Call any prior releaser for this action key, then register the new one.
    const prior = this.actionReleasers.get(key);
    if (prior) prior();
    this.actionReleasers.set(key, release);
    return () => {
      if (this.actionReleasers.get(key) === release) {
        this.actionReleasers.delete(key);
        release();
        // If this was the LAST active dub releaser, mini-drain the echo /
        // spring internals. Closing a tap only cuts *new* signal entering
        // the bus — the SpaceEcho's delay buffer keeps recirculating the
        // last ~300-600 ms of audio at intensity=0.62 (≈4 dB/loop, so
        // ~2 s of audible tail) and the SpringReverb has a ~2.5 s natural
        // decay. Both continue long after the user thinks the effect is
        // over. The mini-drain slams echo intensity + spring wet to zero
        // the instant the last pad releases, then ramps them back to the
        // user's settings 180 ms later so the next action isn't dry.
        this._miniDrainIfIdle();
      }
    };
  }

  /**
   * If no dub releasers are active, snap echo-intensity + spring-wet to
   * zero so tail decay stops immediately, then restore user settings
   * after a short quiet window. Called on every releaser fire. Skipped
   * while panic is draining (its 2 s drain is authoritative) or while
   * the bus is disabled (nothing to drain).
   */
  /**
   * Public entry for consumers that feed the bus without going through a
   * dub-action releaser — currently: the drumpad synth-pad tap, which
   * detaches on pad release and wants the tail to stop shortly after.
   * Delegates to the same internal mini-drain used by action releasers.
   */
  miniDrainIfIdle(): void { this._miniDrainIfIdle(); }

  /**
   * Abort an in-flight mini-drain and restore echo/spring to the user's
   * current settings immediately. Called when a new consumer attaches to
   * the bus (e.g. a synth pad just triggered) — without this, the drain
   * keeps echo muted for its full window (up to ~1s) while the new pad is
   * playing, so the user hears zero echo on rapid-fire playing.
   *
   * Safe no-op when no drain is pending.
   */
  abortMiniDrain(): void {
    if (!this._miniDrainPending) return;
    this._miniDrainPending = false;
    try {
      this.echo.setIntensity(this.settings.echoIntensity);
      this._setSpringWet(this.settings.springWet);
      console.log(`[DubBus] mini-drain ✗ aborted — new consumer attached; echoIntensity=${this.settings.echoIntensity.toFixed(2)} springWet=${this.settings.springWet.toFixed(2)}`);
    } catch { /* ok */ }
  }

  private _miniDrainIfIdle(): void {
    if (this._draining) return;
    if (!this.enabled) return;
    if (this.actionReleasers.size > 0) return;
    // Don't stack mini-drains — if one's already pending, let it finish.
    if (this._miniDrainPending) return;
    this._miniDrainPending = true;
    const settings = this.settings;
    // Drain window must be longer than the echo's longest delay head so the
    // buffer fully flushes while feedback is 0. SpaceEchoEffect runs three
    // heads at rate × 1, 2, 3, so the longest tap is `rate * 3`. Add 200 ms
    // of safety margin, and floor at 250 ms for very short rates. Without
    // this scaling a 300 ms echo rate leaves ~720 ms of stale buffer content
    // at restore time — that's the "pulsating bass tail that ever so slowly
    // gets quieter" the user reported (it was the buffer re-entering the
    // feedback loop at intensity=0.45 after restore).
    const drainMs = Math.max(250, settings.echoRateMs * 3 + 200);
    try {
      this.echo.setIntensityInstant(0);
      this._setSpringWet(0);
      console.log(`[DubBus] mini-drain ▶ last releaser fired, zeroed echo+spring (drain ${drainMs} ms)`);
    } catch { /* ok */ }
    const t = setTimeout(() => {
      this.throwTimers.delete(t);
      this._miniDrainPending = false;
      if (this._disposed) return;
      // Abort the restore if panic fired during our quiet window — panic's
      // own 2 s drain now owns the state, don't fight it.
      if (this._draining) return;
      // A new dub pad may have already engaged during the quiet window,
      // in which case the user's settings are already back in force. Only
      // restore if we're still the only reason echo/spring are muted.
      if (this.actionReleasers.size > 0) return;
      try {
        this.echo.setIntensity(settings.echoIntensity);
        this._setSpringWet(settings.springWet);
        console.log(`[DubBus] mini-drain ◀ restored echoIntensity=${settings.echoIntensity.toFixed(2)} springWet=${settings.springWet.toFixed(2)}`);
      } catch { /* ok */ }
    }, drainMs);
    this.throwTimers.add(t);
  }

  /**
   * Open a deck tap to `amount` immediately (short ramp for click-safety),
   * hold until the returned releaser is called, then fade to 0 over
   * `releaseSec`. If the bus is disabled, returns a no-op releaser.
   */
  openDeckTap(deck: DeckId | 'ALL', amount = 1.0, attackSec = 0.005, releaseSec = 0.08): () => void {
    if (!this.enabled) {
      // Log only the first time per engine — otherwise the console floods
      // during a live set if the user forgot to enable the bus.
      if (!this._warnedBusDisabled) {
        console.warn('[DubBus] openDeckTap ignored — bus is disabled. Enable via the Dub Bus panel.');
        this._warnedBusDisabled = true;
      }
      return () => {};
    }
    if (!this.attachedMixer && !this._warnedNoMixer) {
      console.warn('[DubBus] openDeckTap: no DJ mixer attached — deck tap will open but no deck audio will flow in (start a deck then retry).');
      this._warnedNoMixer = true;
    }
    const decks: DeckId[] = deck === 'ALL' ? [...DECK_IDS] : [deck];
    const now = this.context.currentTime;
    const clamp = Math.max(0, Math.min(1, amount));
    console.log(`[DubBus] openDeckTap ▶ deck=${decks.join(',')} amount=${clamp.toFixed(2)} attack=${attackSec}s release=${releaseSec}s`);
    for (const d of decks) {
      const g = this.deckTaps.get(d)?.gain;
      if (!g) continue;
      try {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(clamp, now + attackSec);
      } catch (err) { console.warn(`[DubBus] openDeckTap ramp failed for deck ${d}:`, err); }
    }
    const key = `open:${decks.join(',')}`;
    return this._scheduleExclusiveRelease(key, () => {
      const release = this.context.currentTime;
      console.log(`[DubBus] openDeckTap ◀ close deck=${decks.join(',')} releaseSec=${releaseSec}`);
      for (const d of decks) {
        const g = this.deckTaps.get(d)?.gain;
        if (!g) continue;
        try {
          g.cancelScheduledValues(release);
          g.setValueAtTime(g.value, release);
          g.linearRampToValueAtTime(0, release + releaseSec);
        } catch (err) { console.warn(`[DubBus] openDeckTap close failed for deck ${d}:`, err); }
      }
    });
  }

  /**
   * Throw: open the tap immediately, then close after `holdSec` (usually
   * one beat at current BPM) with a slow release so the echo captures the
   * grab and tails out. This is the classic King Tubby "echo throw" on a
   * vocal/snare/effect snippet.
   */
  throwDeck(
    deck: DeckId | 'ALL',
    amount = 1.0,
    holdSec = 0.15,
    releaseSec = 0.25,
  ): void {
    if (!this.enabled) {
      console.warn('[DubBus] throwDeck ignored — bus disabled');
      return;
    }
    console.log(`[DubBus] throwDeck ▶ deck=${deck} amount=${amount.toFixed(2)} holdSec=${holdSec} releaseSec=${releaseSec}`);
    const releaser = this.openDeckTap(deck, amount, 0.005, releaseSec);
    const timer = setTimeout(() => {
      console.log(`[DubBus] throwDeck ◀ hold expired, closing tap deck=${deck}`);
      this.throwTimers.delete(timer);
      releaser();
    }, Math.max(0, holdSec * 1000));
    this.throwTimers.add(timer);
  }

  /**
   * Mute the deck's dry signal in the main mix while also opening its dub
   * tap at full — the classic "drop": dry deck disappears, the echo tail
   * becomes the only thing heard. Releaser restores the deck and closes tap.
   */
  muteAndDub(deck: DeckId, amount = 1.0, releaseSec = 0.35): () => void {
    if (!this.attachedMixer) {
      console.warn('[DubBus] muteAndDub ignored — no mixer attached');
      return () => {};
    }
    console.log(`[DubBus] muteAndDub ▶ deck=${deck} amount=${amount.toFixed(2)} releaseSec=${releaseSec}`);
    const restoreMute = this.attachedMixer.muteChannelForDub(deck);
    const closeTap = this.openDeckTap(deck, amount, 0.005, releaseSec);
    const key = `mutedub:${deck}`;
    return this._scheduleExclusiveRelease(key, () => {
      console.log(`[DubBus] muteAndDub ◀ restoring dry deck=${deck}`);
      closeTap();
      restoreMute();
    });
  }

  /**
   * Ramp the feedback gain up to drive the echo into self-oscillation (siren).
   * `amount` is capped internally at 0.95 — above that, the tape saturation
   * isn't strong enough to contain the loop and output clips to infinity.
   */
  /**
   * Dub Siren — fires the existing DubSirenSynth into the bus input so echo +
   * spring process the pitch-swept tone. Lazy-instantiated on first call and
   * kept alive for the life of the bus. Returns a dispose function that
   * calls triggerRelease on the synth.
   */
  private _sirenSynth: import('./DubSirenSynth').DubSirenSynth | null = null;
  private _sirenSynthConnected = false;
  async _ensureSirenSynth(): Promise<import('./DubSirenSynth').DubSirenSynth | null> {
    if (this._sirenSynth) return this._sirenSynth;
    try {
      const { DubSirenSynth } = await import('./DubSirenSynth');
      const synth = new DubSirenSynth({
        oscillator: { type: 'square', frequency: 440 },
        lfo: { enabled: true, type: 'triangle', rate: 1.2, depth: 250 },
        delay: { enabled: false, time: 0.3, feedback: 0, wet: 0 },
        filter: { enabled: true, type: 'lowpass', frequency: 3000, rolloff: -12 },
        reverb: { enabled: false, decay: 1, wet: 0 },
      });
      await synth.ready;
      this._sirenSynth = synth;
      return synth;
    } catch (err) {
      console.warn('[DubBus] DubSirenSynth init failed:', err);
      return null;
    }
  }

  startSiren(): () => void {
    if (!this.enabled) return () => {};
    // SID mode: use real SID chip siren
    if (this._sidMode && this._sidSynths?.isReady) {
      return this._sidSynths.startSiren();
    }
    let released = false;
    let release: (() => void) | null = null;
    void this._ensureSirenSynth().then((synth) => {
      if (!synth || released) return;
      if (!this._sirenSynthConnected) {
        try {
          synth.output.connect(this.input);
          this._sirenSynthConnected = true;
        } catch (err) {
          console.warn('[DubBus] siren synth connect failed:', err);
        }
      }
      try { synth.triggerAttack(undefined, undefined, 1.0); } catch { /* ok */ }
      release = () => { try { synth.triggerRelease(); } catch { /* ok */ } };
      if (released) release();
    });
    return () => {
      released = true;
      if (release) release();
    };
  }

  setSirenFeedback(amount: number, rampSec = 0.08): () => void {
    if (!this.enabled) {
      console.warn('[DubBus] setSirenFeedback ignored — bus disabled');
      return () => {};
    }
    // Clamp to target level. On rapid retriggers the ramp always lands on
    // `target` rather than accumulating from whatever mid-decay value the
    // gain held — without this, mashing a siren pad could sneak the
    // feedback up past the 0.95 cap via multiple overlapping ramps. The
    // clamp preserves the "escalating scream" character by letting decay
    // through naturally, but caps the re-ignite level.
    const target = Math.max(0, Math.min(0.95, amount));
    const now = this.context.currentTime;
    const g = this.feedback.gain;
    const prior = g.value;
    console.log(`[DubBus] setSirenFeedback ▶ amount=${amount.toFixed(2)} target=${target.toFixed(2)} prior=${prior.toFixed(3)} rampSec=${rampSec}`);
    try {
      g.cancelScheduledValues(now);
      // Hold at LOWER of (current value, target) so retriggers never bump
      // feedback higher than the intended cap even if gain is already above it.
      const startFrom = Math.min(g.value, target);
      g.setValueAtTime(startFrom, now);
      g.linearRampToValueAtTime(target, now + rampSec);
    } catch (err) { console.warn('[DubBus] setSirenFeedback ramp failed:', err); }
    const key = 'siren';
    return this._scheduleExclusiveRelease(key, () => {
      const release = this.context.currentTime;
      console.log(`[DubBus] setSirenFeedback ◀ releasing (ramp 0→0 over 0.2s) priorGain=${g.value.toFixed(3)}`);
      try {
        g.cancelScheduledValues(release);
        g.setValueAtTime(g.value, release);
        g.linearRampToValueAtTime(0, release + 0.2);
      } catch (err) { console.warn('[DubBus] setSirenFeedback release failed:', err); }
    });
  }

  /**
   * Dub Panic — hard-flush the entire dub bus. Instantly silences audible
   * output AND drains the SpaceEcho tape heads + SpringReverb tank so the
   * bus is ready for a clean re-start instead of replaying whatever was
   * caught in the internal delay lines.
   *
   * Called from:
   *   - The "KILL" button in DubBusPanel
   *   - The `dub-panic` window event (so keyboard shortcuts / panic hotkeys
   *     can trigger it without React component coupling)
   *   - The existing `dj-panic` (ESC in DJ view) event — dub bus is part of
   *     "stop everything" semantics
   *
   * Sequence:
   *   1. Cancel every in-flight releaser + throw timer — no late-firing ramps
   *   2. Close deck taps immediately (no glide — a click here is preferable
   *      to a lingering tail)
   *   3. Zero siren feedback, open LPF fully
   *   4. Ramp return gain to 0 (smooth — avoids click at the output)
   *   5. Mute the bus input so no new audio enters the echo/spring while
   *      draining. Echo's own feedback path (intensity ~0.62) continues
   *      recirculating the currently-buffered signal — but with the return
   *      gain at 0 it's inaudible, and at 300 ms / 0.62 feedback it drops
   *      ~4 dB per loop, reaching -40 dB within 2 s naturally.
   *   6. Flip the enabled flag — caller is expected to also update the store
   *      so the UI reflects the kill state.
   */
  dubPanic(): void {
    const now = this.context.currentTime;
    // Verbose live-gig logging: print the bus state BEFORE we start tearing
    // it down so the DJ can see from the console what was active when
    // panic fired. Cheap, fires once per panic, and makes post-gig diffs
    // trivial.
    try {
      console.warn('[DubPanic] firing', {
        enabled: this.enabled,
        inputGain: this.input.gain.value,
        returnGain: this.return_.gain.value,
        feedbackGain: this.feedback.gain.value,
        lpfHz: this.lpf.frequency.value,
        echoIntensity: this.settings.echoIntensity,
        springWet: this.settings.springWet,
        activeReleasers: this.actionReleasers.size,
        pendingTimers: this.throwTimers.size,
        activeDeckTaps: this.deckTaps.size,
      });
    } catch { /* logging never breaks panic */ }

    // 1. Cancel every pending timer + releaser — no ghost ramps firing later.
    for (const t of this.throwTimers) clearTimeout(t);
    this.throwTimers.clear();
    // Also cancel pending quantized throws that are waiting for a beat
    // boundary. These live in a module-level set inside DubActions; without
    // this call, a "bar"-quantized throw scheduled 2 s in the future would
    // still fire during / after panic.
    clearAllPendingThrows();
    // Reset warn latches — next attempted throw should log again if bus
    // is still disabled or mixer still detached.
    this._warnedBusDisabled = false;
    this._warnedNoMixer = false;
    // Snapshot releasers before calling — each releaser mutates
    // actionReleasers (via _scheduleExclusiveRelease's cleanup function),
    // and iterating while mutating a Map is subtle. Snapshot + clear
    // up-front, then fire the snapshots, guarantees every registered hold
    // gets a release call even if the callbacks reorder the map.
    const releasers = Array.from(this.actionReleasers.values());
    this.actionReleasers.clear();
    for (const release of releasers) {
      try { release(); } catch { /* ok */ }
    }

    // 2. Slam deck taps shut. No ramp — a faint click is better than audio
    //    slipping through during panic.
    for (const tap of this.deckTaps.values()) {
      try {
        tap.gain.cancelScheduledValues(now);
        tap.gain.setValueAtTime(0, now);
      } catch { /* ok */ }
    }

    // 3. Kill siren feedback + reset LPF to open + neutralize bass shelf comp.
    //    Also clear any tape wobble intervals + EQ sweep — otherwise they keep
    //    modulating from zombie setIntervals after panic.
    for (const h of this.wobbleHandles) clearInterval(h);
    this.wobbleHandles.clear();
    this.stopEQSweep();
    try {
      this.feedback.gain.cancelScheduledValues(now);
      this.feedback.gain.setValueAtTime(0, now);
      this.feedbackShelfComp.gain.cancelScheduledValues(now);
      this.feedbackShelfComp.gain.setValueAtTime(0, now);
      this.lpf.frequency.cancelScheduledValues(now);
      this.lpf.frequency.setValueAtTime(20000, now);
    } catch { /* ok */ }

    // 4. Fast but smooth return ramp — 20 ms cuts audible tail almost
    //    instantly without the click of an instant value change.
    try {
      const g = this.return_.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.02);
    } catch { /* ok */ }

    // 5. Mute the bus input AND kill the echo/spring internal feedback so
    //    the delay buffers drain rather than recirculate. Input mute alone
    //    isn't enough — at `intensity=0.62` with `rate=300 ms`, the buffer
    //    only loses ~4 dB per loop, so 1 s of tail survives at ~-13 dB
    //    and becomes audible the moment the user re-enables the bus.
    //
    //    `_draining` flag suppresses echo/spring writes from setSettings
    //    during the 2 s drain window — otherwise the mirror effect's writes
    //    (triggered by store changes, including the store.setDubBus({
    //    enabled:false}) that usually accompanies panic) would restore the
    //    user's intensity values mid-drain and stomp the zero.
    try {
      const ig = this.input.gain;
      ig.cancelScheduledValues(now);
      ig.setValueAtTime(ig.value, now);
      ig.linearRampToValueAtTime(0, now + 0.02);
    } catch { /* ok */ }
    this._draining = true;
    try {
      // Instant zero — setIntensity() ramps over 100 ms and lets the
      // delay line keep recirculating during the ramp, which is the
      // "echo lingers forever" tail users hit during live panic.
      this.echo.setIntensityInstant(0);
      this._setSpringWet(0);
    } catch (err) { console.warn('[DubPanic] echo/spring zero failed:', err); }
    const drainTimer = setTimeout(() => {
      this.throwTimers.delete(drainTimer);
      if (this._disposed) return;
      this._draining = false;
      // Restore from the CURRENT settings (not a closure snapshot) so any
      // knob tweaks the user made during the drain window are honored.
      try {
        this.echo.setIntensity(this.settings.echoIntensity);
        this._setSpringWet(this.settings.springWet);
      } catch { /* ok */ }
    }, 2000);
    this.throwTimers.add(drainTimer);

    // 6. Flip the engine's enabled flag. Intentionally do NOT write to
    //    `this.settings.enabled` — that's the "desired state" mirror
    //    of the store, and pre-writing it would make the store's mirror
    //    effect short-circuit via the equality check in setSettings
    //    when it later pushes the same value. Instead let the caller's
    //    `store.setDubBus({enabled:false})` flow through normally; its
    //    engine-side write will find `settings.enabled=true` !== false
    //    and run the full disable path (noise gate, sync the flag, etc.).
    const wasEnabled = this.enabled;
    this.enabled = false;
    if (wasEnabled) {
      console.log('[DubBus] PANIC — bus flushed, internal buffers draining (2s).');
    }
  }

  /**
   * Sweep the bus LPF from open (20 kHz) down to `targetHz` over `durationSec`,
   * then back up over the same duration when released. Gives the classic
   * "filter drop" muffle-then-open move.
   */
  filterDrop(targetHz = 300, downSec = 0.4, upSec = 0.6): () => void {
    if (!this.enabled) return () => {};
    const now = this.context.currentTime;
    const f = this.lpf.frequency;
    try {
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.value, now);
      // Exponential ramp sounds natural across the audible range.
      f.exponentialRampToValueAtTime(Math.max(40, targetHz), now + downSec);
    } catch { /* ok */ }
    const key = 'filterdrop';
    return this._scheduleExclusiveRelease(key, () => {
      const release = this.context.currentTime;
      try {
        f.cancelScheduledValues(release);
        f.setValueAtTime(f.value, release);
        f.exponentialRampToValueAtTime(20000, release + upSec);
      } catch { /* ok */ }
    });
  }

  /** Update the dub bus settings (enable, gains, delay params). */
  setSettings(settings: Partial<DubBusSettings>): void {
    // Short-circuit no-op writes. PadGrid + DJSamplerPanel mirror this state
    // every time the store's `dubBus` OR the active deck's BPM changes —
    // during a crossfader sweep that's ~60 Hz of identical settings being
    // pushed. Without this guard we'd schedule dozens of AudioParam ramps
    // per second across 6 params for zero audible change.
    let changed = false;
    for (const key of Object.keys(settings) as (keyof DubBusSettings)[]) {
      if (this.settings[key] !== settings[key]) { changed = true; break; }
    }
    if (!changed) return;

    const merged: DubBusSettings = { ...this.settings, ...settings };

    /* Character preset transition — log a compact one-liner for support
       triage. Verbose per-biquad diagnostic dumps are no longer needed
       (the 2026-04-29 Tubby crash was fixed by installing a NaN-scrubber
       AudioWorklet on the feedback tap — see _loadFeedbackScrubberWorklet).
       Left as a breadcrumb so future crashes can be correlated with the
       preset pick that triggered them. */
    if (typeof settings.characterPreset === 'string'
        && settings.characterPreset !== this.settings.characterPreset) {
      console.log(`[DubBus] characterPreset: ${this.settings.characterPreset} → ${settings.characterPreset} (fbScrub=${this._feedbackScrubberIsWorklet ? 'worklet' : 'passthrough'} fwdScrub=${this._forwardScrubberIsWorklet ? 'worklet' : 'passthrough'})`);
    }

    // Log every *meaningful* settings write — enable flag, non-zero echo /
    // spring / feedback / return changes. Skips incidental tweaks like
    // tiny returnGain adjustments that happen during live mixing so the
    // console doesn't flood. Suspicious-lingering-noise diagnostics rely
    // on this to show which knob stayed high after the set ended.
    try {
      const flags: string[] = [];
      if (typeof settings.enabled === 'boolean') flags.push(`enabled=${settings.enabled}`);
      if (settings.echoIntensity !== undefined) flags.push(`echoIntensity=${settings.echoIntensity.toFixed(2)}`);
      if (settings.echoWet !== undefined) flags.push(`echoWet=${settings.echoWet.toFixed(2)}`);
      if (settings.springWet !== undefined) flags.push(`springWet=${settings.springWet.toFixed(2)}`);
      if (settings.returnGain !== undefined) flags.push(`returnGain=${settings.returnGain.toFixed(2)}`);
      if (settings.sidechainAmount !== undefined) flags.push(`sidechain=${settings.sidechainAmount.toFixed(2)}`);
      if (settings.hpfCutoff !== undefined) flags.push(`hpfCutoff=${Math.round(settings.hpfCutoff)}Hz`);
      if (flags.length > 0) {
        console.log(`[DubBus] setSettings ${flags.join(' ')} _draining=${this._draining}`);
      }
    } catch { /* logging never breaks the setter */ }
    this.settings = merged;
    if (typeof settings.enabled === 'boolean') {
      this.enabled = settings.enabled;
      // Reset "bus disabled" warn latch so the user gets a fresh warning if
      // they later toggle back off without re-enabling — helpful during
      // soundcheck when knobs move around.
      if (settings.enabled) this._warnedBusDisabled = false;
      // SID make-up boost: when the dub bus goes live in SID mode the SID's
      // dry signal can sit much quieter than the wet effects chain. Ramp
      // the SID master up by _sidBoostAmount on enable, back to unity on
      // disable. Handler is installed by NativeEngineRouting on SID init.
      if (this._sidBoostHandler && this._sidMode) {
        try {
          this._sidBoostHandler(settings.enabled ? this._sidBoostAmount : 1);
        } catch { /* ok */ }
      }
      // Gate the pink-noise source level alongside the bus return. Pure
      // silence when disabled — no rogue noise floor, no wasted CPU
      // feeding inaudible samples through the whole chain.
      try {
        // Gig fix: keep the pink-noise floor at zero at all times. See the
        // constructor note — the -55 dBFS floor was compounding through the
        // echo/spring feedback loop into audible white noise the instant
        // the user opened the drumpad view with a persisted enabled bus.
        const t = this.context.currentTime;
        this.noiseGain.gain.cancelScheduledValues(t);
        this.noiseGain.gain.setValueAtTime(0, t);
      } catch { /* ok */ }
      // Restore the bus input gain when re-enabling. dubPanic() mutes it
      // to 0 to drain the echo — re-enable needs to open the gate back up
      // or the bus would accept audio but produce nothing audible from new
      // throws because no signal reaches the echo/spring chain.
      if (settings.enabled) {
        try {
          const t = this.context.currentTime;
          const ig = this.input.gain;
          ig.cancelScheduledValues(t);
          ig.setValueAtTime(ig.value, t);
          ig.linearRampToValueAtTime(1, t + 0.02);
        } catch { /* ok */ }
        // If the user re-enables mid-drain, cancel the drain and apply
        // live echo/spring settings immediately. Otherwise the bus would
        // run "mostly dry" for the remainder of the 2 s drain window —
        // confusing when the user just clicked Enabled expecting full bus.
        if (this._draining) {
          this._draining = false;
          try {
            this.echo.setIntensity(merged.echoIntensity);
            this._setSpringWet(merged.springWet);
          } catch { /* ok */ }
        }
        // Pre-warm the reverse-capture ring so the FIRST reverseEcho /
        // backwardReverb fire has audio to reverse. The worklet captures
        // audio continuously, but the ring is empty for ~1 s after the
        // worklet boots. Without this kick, the first fire hits the
        // `if (!frames)` abort path and produces silence (sweep Δpk
        // 0.006 vs 0.103 on subsequent fires — 2026-04-20 run).
        void this._ensureReverseCapture().catch(() => { /* worklet optional */ });
      } else {
        // Disabling: truly silence the bus. return_.gain alone isn't enough
        // because echo feedback + spring keep looping on stale content, and
        // any future re-enable (or a drain bug) would leak that stale tail.
        // Close input → no new signal enters. Zero echo intensity + spring
        // wet → feedback loops decay naturally. Return gain handled below.
        try {
          const t = this.context.currentTime;
          const ig = this.input.gain;
          ig.cancelScheduledValues(t);
          ig.setValueAtTime(ig.value, t);
          ig.linearRampToValueAtTime(0, t + 0.04);
        } catch { /* ok */ }
        try { this.echo.setIntensity(0); } catch { /* ok */ }
        try { this._setSpringWet(0); } catch { /* ok */ }
      }
    }
    const now = this.context.currentTime;
    // Stepped mode: snap HPF cutoff to the nearest Altec position before
    // writing. Keeps the "Big Knob" staccato character on presets + user
    // drags alike. Continuous mode passes the raw value through.
    const hpfFreq = merged.hpfStepped ? snapToAltecStep(merged.hpfCutoff) : merged.hpfCutoff;
    rampBiquadParam(this.hpf.frequency, hpfFreq, now);
    rampBiquadParam(this.hpf2.frequency, hpfFreq, now);
    rampBiquadParam(this.hpf3.frequency, hpfFreq, now);
    // Guard: skip return_.gain write when a mute hold is active (swap
    // or warmup). A re-entrant setSettings call (PadGrid mirror, DJ sync)
    // would insert a setTargetAtTime event that defeats the warmup hold,
    // letting the spring burst through to master. Queue the settings so
    // the hold-release callback can replay them.
    if (this._muteHoldActive) {
      this._pendingPostHoldSettings = merged;
    } else {
      this.return_.gain.setTargetAtTime(
        this.enabled ? merged.returnGain : 0, now, 0.02,
      );
    }
    // ── Echo engine swap ──────────────────────────────────────────────────
    // When echoEngine changes (character preset or manual selection), tear
    // down the old effect and install the new one in the same graph position.
    // Detect an upcoming preset transition so we can defer the spring param
    // writes into the swap callback (after return_ is at 0).
    const incomingPreset = settings.characterPreset;
    const presetTransitioning =
      typeof incomingPreset === 'string' &&
      incomingPreset !== 'custom' &&
      incomingPreset !== this._lastAppliedPreset;
    const engineChanging = !!(settings.echoEngine && settings.echoEngine !== this._currentEchoEngine);

    if (engineChanging) {
      this._swapEchoEngine(
        merged,
        presetTransitioning ? (incomingPreset as Exclude<typeof incomingPreset, 'custom'>) : undefined,
      );
    }
    // Suppress echo/spring writes while panic is draining the delay lines.
    // The drain restore timer applies the user's settings at the end of the
    // 2 s window. Without this guard, mirror-effect writes during drain
    // would restore intensity mid-flight and leave residual echo on re-enable.
    // Also suppress when bus is disabled — the enable-flag handler already
    // zeroed these; re-writing merged.* here would revive the feedback loop
    // on a disabled bus, defeating the whole point of the disable path.
    if (!this._draining && this.enabled) {
      this._setSpringWet(merged.springWet);
      this.echo.setIntensity(merged.echoIntensity);
      this.echo.wet = merged.echoWet;
    }
    this.echo.setRate(merged.echoRateMs);
    // Sidechain depth maps to compressor threshold — more duck = lower threshold.
    // 0 → -6 dB threshold (barely compresses), 1 → -36 dB (heavy pumping).
    // Skip during an echo swap — the swap sets threshold to 0dB during the
    // transition and schedules its own restoration. Writing here would
    // override that protection.
    if (!engineChanging && !this._muteHoldActive) {
      const threshold = -6 - merged.sidechainAmount * 30;
      this.sidechain.threshold.setTargetAtTime(threshold, now, 0.05);
    }

    // ── Coloring params (research doc §3) ───────────────────────────────
    // All smoothed via setTargetAtTime so mid-gig knob twitches don't click.
    // Bass shelf gain is clamped to ±12 dB — the shelf sits INSIDE the echo
    // feedback loop, so extreme boosts (+18 dB = 8× linear) cause runaway
    // that overflows to NaN and permanently kills the audio graph.
    const safeBassGain = Math.max(-12, Math.min(12, merged.bassShelfGainDb));
    rampBiquadParam(this.bassShelf.frequency, merged.bassShelfFreqHz, now);
    rampBiquadParam(this.bassShelf.Q, merged.bassShelfQ, now);
    rampBiquadParam(this.bassShelf.gain, safeBassGain, now);
    // Mirror compensating cut in feedback path — negated gain, same freq/Q
    rampBiquadParam(this.feedbackShelfComp.frequency, merged.bassShelfFreqHz, now);
    rampBiquadParam(this.feedbackShelfComp.Q, merged.bassShelfQ, now);
    rampBiquadParam(this.feedbackShelfComp.gain, -safeBassGain, now);
    rampBiquadParam(this.midScoop.frequency, merged.midScoopFreqHz, now);
    rampBiquadParam(this.midScoop.Q, merged.midScoopQ, now);
    rampBiquadParam(this.midScoop.gain, merged.midScoopGainDb, now);
    this._applyStereoWidth(merged.stereoWidth);
    // Master-insert TONE EQ — drives the whole mix (dry + wet) when wired.
    // Gain writes are gated so a disabled bus stays transparent on master.
    const masterActive = this.enabled && this.masterInsertActive;
    rampBiquadParam(this.masterBassShelf.frequency, merged.bassShelfFreqHz, now);
    rampBiquadParam(this.masterBassShelf.Q, merged.bassShelfQ, now);
    rampBiquadParam(this.masterBassShelf.gain, masterActive ? safeBassGain : 0, now);
    rampBiquadParam(this.masterMidScoop.frequency, merged.midScoopFreqHz, now);
    rampBiquadParam(this.masterMidScoop.Q, merged.midScoopQ, now);
    rampBiquadParam(this.masterMidScoop.gain, masterActive ? merged.midScoopGainDb : 0, now);
    // Master width: 4-gain coeff matrix matching the bus-level pattern.
    // Neutral (width=1 → coeffA=1, coeffB=0) when bus disabled or inactive
    // so the master stays untouched.
    const mw = masterActive ? Math.max(0, Math.min(2, merged.stereoWidth)) : 1;
    const mA = 0.5 + 0.5 * mw;
    const mB = 0.5 - 0.5 * mw;
    const masterInvertL = (this.masterSide as unknown as { _invertL?: GainNode })._invertL;
    this.masterMid.gain.setTargetAtTime(mA, now, 0.02);
    this.masterSide.gain.setTargetAtTime(mA, now, 0.02);
    this.masterInvertR.gain.setTargetAtTime(mB, now, 0.02);
    if (masterInvertL) masterInvertL.gain.setTargetAtTime(mB, now, 0.02);
    // Liquid sweep params — clamp + smooth. sweepAmount=0 fully silences
    // the branch; LFO keeps running (can't stop OscillatorNode).
    const sweepAmt = Math.max(0, Math.min(1, merged.sweepAmount));
    this.sweepOutput.gain.setTargetAtTime(sweepAmt, now, 0.02);
    const sweepRate = Math.max(0.05, Math.min(5, merged.sweepRateHz));
    this.sweepLfo.frequency.setTargetAtTime(sweepRate, now, 0.02);
    const sweepDepthSec = Math.max(0, Math.min(9, merged.sweepDepthMs)) / 1000;
    this.sweepLfoGain.gain.setTargetAtTime(sweepDepthSec, now, 0.02);
    const sweepFb = Math.max(0, Math.min(0.85, merged.sweepFeedback));
    this.sweepFeedback.gain.setTargetAtTime(sweepFb, now, 0.02);
    // Tape sat mode crossfade — both gates ramp over 60ms so switching
    // mid-gig doesn't click. Same time constant intentional: gains sum
    // near 1 during the overlap which is fine (quiet crossfade dip is
    // inaudible on dub tails). 'tape15ips' shares the single-path gate
    // but rebuilds the WaveShaper curve with a heavier drive + treble
    // roll-off (see _applyCharacterPreset + the mode-transition block
    // below).
    const wantStack = merged.tapeSatMode === 'stack';
    this.tapeSatBypass.gain.setTargetAtTime(wantStack ? 0 : 1, now, 0.03);
    this.tapeStackMix.gain.setTargetAtTime(wantStack ? 1 : 0, now, 0.03);

    // Plate-stage changes — swap the insert if the type changed, OR
    // update the wet send if only the mix moved. Type change is
    // relatively expensive (WASM teardown + worklet init for the new
    // plate) so we gate on a real transition.
    if (settings.plateStage !== undefined && settings.plateStage !== this._lastPlateStage) {
      this._lastPlateStage = settings.plateStage;
      this.setPlateStage(settings.plateStage);
    }
    if (settings.plateStageMix !== undefined && this.plateSend) {
      this.plateSend.gain.setTargetAtTime(
        Math.max(0, Math.min(1, settings.plateStageMix)),
        now, 0.03,
      );
    }
    // Apply the 15ips curve when that mode is selected. Rebuild triggered
    // only on mode transition to avoid hot-path curve allocation.
    if (merged.tapeSatMode !== this._lastTapeMode) {
      this._lastTapeMode = merged.tapeSatMode;
      if (merged.tapeSatMode === 'tape15ips') {
        try { this.tapeSat.curve = makeTapeSatCurve(0.7); } catch { /* ok */ }
      } else if (merged.tapeSatMode === 'single') {
        // Restore preset's tape curve or default 0.35.
        const p = this._lastAppliedPreset;
        const drive = p && p !== 'custom' ? (DUB_CHARACTER_PRESETS[p]?.tapeSatDrive ?? 0.35) : 0.35;
        try { this.tapeSat.curve = makeTapeSatCurve(drive); } catch { /* ok */ }
      }
    }

    // ─── Return EQ ─────────────────────────────────────────────────────────
    if (settings.returnEqEnabled !== undefined || settings.returnEqFreq !== undefined ||
        settings.returnEqGain !== undefined || settings.returnEqQ !== undefined) {
      const enabled = merged.returnEqEnabled;
      this.returnEQ.setB2Freq(merged.returnEqFreq);
      this.returnEQ.setB2Gain(enabled ? merged.returnEqGain : 0);
      this.returnEQ.setB2Q(merged.returnEqQ);
    }
    // Advanced bands (MCP/power users)
    if (settings.returnEqB1Freq !== undefined) this.returnEQ.setB1Freq(merged.returnEqB1Freq);
    if (settings.returnEqB1Gain !== undefined) this.returnEQ.setB1Gain(merged.returnEqB1Gain);
    if (settings.returnEqB1Q !== undefined) this.returnEQ.setB1Q(merged.returnEqB1Q);
    if (settings.returnEqB3Freq !== undefined) this.returnEQ.setB3Freq(merged.returnEqB3Freq);
    if (settings.returnEqB3Gain !== undefined) this.returnEQ.setB3Gain(merged.returnEqB3Gain);
    if (settings.returnEqB3Q !== undefined) this.returnEQ.setB3Q(merged.returnEqB3Q);
    if (settings.returnEqB4Freq !== undefined) this.returnEQ.setB4Freq(merged.returnEqB4Freq);
    if (settings.returnEqB4Gain !== undefined) this.returnEQ.setB4Gain(merged.returnEqB4Gain);
    if (settings.returnEqB4Q !== undefined) this.returnEQ.setB4Q(merged.returnEqB4Q);

    // ─── Sweep mode (comb vs phaser) ───────────────────────────────────────
    if (settings.sweepMode !== undefined || settings.sweepAmount !== undefined) {
      const isPhaser = merged.sweepMode === 'phaser';
      const amt = Math.max(0, Math.min(1, merged.sweepAmount));
      // Crossfade: one branch at full gain, other at 0
      this.combOutput.gain.setTargetAtTime(isPhaser ? 0 : 1, now, 0.01);
      this.phaserOutput.gain.setTargetAtTime(isPhaser ? 1 : 0, now, 0.01);
      this.sweepOutput.gain.setTargetAtTime(amt, now, 0.02);
    }
    // Phaser params — update even when mode is 'comb' (no harm, WASM just idles)
    if (settings.phaserRate !== undefined) this.phaser.setRate(merged.phaserRate);
    if (settings.phaserDepth !== undefined) this.phaser.setDepth(merged.phaserDepth);
    if (settings.phaserStages !== undefined) this.phaser.setStages(merged.phaserStages);
    if (settings.phaserFeedback !== undefined) this.phaser.setFeedback(merged.phaserFeedback);

    // ─── Post-echo tape saturation ────────────────────────────────────────
    if (settings.postEchoSatEnabled !== undefined || settings.postEchoSatDrive !== undefined) {
      const enabled = merged.postEchoSatEnabled;
      this.postEchoSatBypass.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.01);
      this.postEchoSatWet.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.01);
      if (settings.postEchoSatDrive !== undefined) {
        this.postEchoSat.curve = makeTapeSatCurve(merged.postEchoSatDrive);
      }
    }

    // ─── Ring modulator ───────────────────────────────────────────────────
    if (settings.ringModEnabled !== undefined || settings.ringModAmount !== undefined) {
      const amt = merged.ringModEnabled ? merged.ringModAmount : 0;
      this.ringModSend.gain.setTargetAtTime(amt, now, 0.02);
    }
    if (settings.ringModFreq !== undefined) this.ringMod.setFrequency(merged.ringModFreq);
    if (settings.ringModWaveform !== undefined) this.ringMod.setWaveform(merged.ringModWaveform);
    if (settings.ringModMix !== undefined) this.ringMod.setMix(merged.ringModMix);

    // ─── Lo-fi / voltage starve ───────────────────────────────────────────
    if (settings.lofiEnabled !== undefined || settings.lofiBits !== undefined) {
      const enabled = merged.lofiEnabled;
      this.lofiBypass.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.01);
      this.lofiSend.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.01);
      if (settings.lofiBits !== undefined) this.lofi.setCrush(merged.lofiBits);
    }

    // ─── External feedback loop ───────────────────────────────────────────
    if (settings.extFeedbackGain !== undefined) {
      const clamped = Math.min(0.85, Math.max(0, merged.extFeedbackGain));
      this.extFeedbackGain.gain.setTargetAtTime(clamped, now, 0.02);
    }
    if (settings.extFeedbackEqFreq !== undefined) {
      this.extFeedbackEq.frequency.setTargetAtTime(merged.extFeedbackEqFreq, now, 0.01);
    }
    if (settings.extFeedbackEqGain !== undefined) {
      this.extFeedbackEq.gain.setTargetAtTime(merged.extFeedbackEqGain, now, 0.01);
    }
    if (settings.extFeedbackEqQ !== undefined) {
      this.extFeedbackEq.Q.setTargetAtTime(merged.extFeedbackEqQ, now, 0.01);
    }

    // ─── Club simulation ──────────────────────────────────────────────────
    if (settings.clubSimEnabled !== undefined || settings.clubSimMix !== undefined) {
      const enabled = merged.clubSimEnabled;
      const mix = enabled ? merged.clubSimMix : 0;
      this.clubDry.gain.setTargetAtTime(enabled ? 1 - mix : 1, now, 0.02);
      this.clubWet.gain.setTargetAtTime(mix, now, 0.02);
      // Wire/unwire the ConvolverNode lazily to avoid null-buffer issues.
      if (enabled && !this._clubConvolverWired) {
        this.return_.connect(this.clubConvolver);
        this.clubConvolver.connect(this.clubWet);
        this._clubConvolverWired = true;
        // Ensure we have a buffer
        if (!this.clubConvolver.buffer) {
          const preset = CLUB_IR_PRESETS[merged.clubSimPreset] ?? CLUB_IR_PRESETS.soundSystem;
          this.clubConvolver.buffer = generateIR(this.context, preset);
          this._clubSimPreset = merged.clubSimPreset;
        }
      } else if (!enabled && this._clubConvolverWired) {
        try { this.return_.disconnect(this.clubConvolver); } catch { /* ok */ }
        try { this.clubConvolver.disconnect(this.clubWet); } catch { /* ok */ }
        this._clubConvolverWired = false;
      }
    }
    if (settings.clubSimPreset !== undefined && merged.clubSimPreset !== this._clubSimPreset) {
      const preset = CLUB_IR_PRESETS[merged.clubSimPreset] ?? CLUB_IR_PRESETS.soundSystem;
      this.clubConvolver.buffer = generateIR(this.context, preset);
      this._clubSimPreset = merged.clubSimPreset;
    }

    // Chain order: live-switchable reordering of echo/spring core routing.
    if (settings.chainOrder !== undefined && merged.chainOrder !== this._chainOrder) {
      this.setChainOrder(merged.chainOrder);
    }

    // Character-preset selection: apply the DSP-side bits (spring, tape
    // saturator curve) when the preset NAME transitions. The settings-side
    // overrides have already been rewritten upstream by the store's
    // setDubBus action — we don't need to re-apply them here. Gate on a
    // real transition so a mirror-effect render with unchanged preset
    // doesn't rebuild the WaveShaper curve on every tick.
    if (presetTransitioning) {
      if (engineChanging) {
        // Swap is in progress — _swapEchoEngine will apply the preset
        // inside its setTimeout callback (after return_ is at 0 and
        // sidechain is disabled). Just record the name here.
        this._lastAppliedPreset = incomingPreset;
      } else {
        /* Same-engine preset transition (e.g. Tubby→MadProfessor, both
           re201). No echo swap fires, but spring param writes still
           produce a burst that can lock the sidechain compressor. Gate
           with warmup mute + sidechain disable. */
        this._warmupMute(merged.sidechainAmount);
        this._applyCharacterPreset(incomingPreset as Exclude<typeof incomingPreset, 'custom'>);
        this._lastAppliedPreset = incomingPreset;
      }
    } else if (incomingPreset === 'custom') {
      this._lastAppliedPreset = 'custom';
    }
  }

  /**
   * Hold feedback + return_ at 0 for 120ms, then ramp back to their prior
   * values. Used for character-preset transitions that don't involve an
   * engine swap. The short warmup shields the bus from transient level
   * spikes during simultaneous multi-effect param writes (bass shelf,
   * tape saturation etc.) — the spring reverb itself is protected by
   * sample-accurate per-param smoothing inside Aelapse.worklet.js, so
   * no long ride-out is needed here.
   */
  private _warmupMute(sidechainAmount = 0.15): void {
    const ctx = this.context;
    const RAMP_SEC = 0.02;
    const WARMUP_SEC = 0.40; // spring I/O mute handles burst; 400ms for settle
    const priorFeedback = this.feedback.gain.value;
    const priorReturn = this.return_.gain.value;
    const targetThreshold = -6 - sidechainAmount * 30;
    console.log(`[DubBusCtrl] _warmupMute fired | feedback ${priorFeedback.toFixed(3)}→0→${priorFeedback.toFixed(3)} return_ ${priorReturn.toFixed(3)}→0→${priorReturn.toFixed(3)} hold=${(WARMUP_SEC*1000).toFixed(0)}ms`);
    this._muteHoldActive = true;
    this._pendingPostHoldSettings = null;
    // Mute spring I/O during warmup — same rationale as _swapEchoEngine:
    // spring param changes can excite waveguide resonances. muteInput()
    // prevents new audio from entering (no energy accumulates), muteOutput()
    // discards any residual resonance from the param change.
    try { this.spring.muteInput(); } catch { /* ok */ }
    try { this.spring.muteOutput(); } catch { /* ok */ }
    try {
      const now = ctx.currentTime;
      this.feedback.gain.cancelScheduledValues(now);
      this.feedback.gain.setValueAtTime(this.feedback.gain.value, now);
      this.feedback.gain.linearRampToValueAtTime(0, now + RAMP_SEC);
      this.feedback.gain.setValueAtTime(0, now + WARMUP_SEC);
      this.feedback.gain.linearRampToValueAtTime(priorFeedback, now + WARMUP_SEC + RAMP_SEC);

      this.return_.gain.cancelScheduledValues(now);
      this.return_.gain.setValueAtTime(this.return_.gain.value, now);
      this.return_.gain.linearRampToValueAtTime(0, now + RAMP_SEC);
      this.return_.gain.setValueAtTime(0, now + WARMUP_SEC);
      this.return_.gain.linearRampToValueAtTime(priorReturn, now + WARMUP_SEC + RAMP_SEC);

      this.sidechain.ratio.cancelScheduledValues(now);
      this.sidechain.ratio.setValueAtTime(1, now);
      this.sidechain.ratio.setTargetAtTime(6, now + WARMUP_SEC, 0.02);
      this.glue.ratio.cancelScheduledValues(now);
      this.glue.ratio.setValueAtTime(1, now);
      this.glue.ratio.setTargetAtTime(3, now + WARMUP_SEC, 0.02);
      this.sidechain.threshold.cancelScheduledValues(now);
      this.sidechain.threshold.setValueAtTime(0, now);
      this.sidechain.threshold.setTargetAtTime(targetThreshold, now + WARMUP_SEC, 0.05);
    } catch (err) {
      console.warn('[DubBusCtrl] _warmupMute threw:', err);
      this._muteHoldActive = false;
      this._pendingPostHoldSettings = null;
    }
    // Release the hold after warmup completes
    setTimeout(() => {
      try { this.spring.unmuteInput(); } catch { /* ok */ }
      try { this.spring.unmuteOutput(); } catch { /* ok */ }
      this._muteHoldActive = false;
      if (this._pendingPostHoldSettings) {
        const pending = this._pendingPostHoldSettings;
        this._pendingPostHoldSettings = null;
        const now2 = ctx.currentTime;
        this.return_.gain.setTargetAtTime(
          this.enabled ? pending.returnGain : 0, now2, 0.02,
        );
        if (!this._draining && this.enabled) {
          const threshold = -6 - pending.sidechainAmount * 30;
          this.sidechain.threshold.setTargetAtTime(threshold, now2, 0.05);
        }
      }
    }, (WARMUP_SEC + RAMP_SEC) * 1000 + 20);
  }

  /** Dense one-liner snapshot of the bus's live audio state. Use to pair with
   *  user-triggered actions so we can correlate "pushed button X" → "bus
   *  looks like Y" without needing many verbose log lines per event. */
  private _snap(label: string): void {
    try {
      console.log(
        `[DubBusSnap] ${label} | enabled=${this.enabled}`
        + ` input=${this.input.gain.value.toFixed(3)}`
        + ` feedback=${this.feedback.gain.value.toFixed(3)}`
        + ` return_=${this.return_.gain.value.toFixed(3)}`
        + ` springWet=${this._springWetCache.toFixed(3)}`
        + ` echo=${this._currentEchoEngine}`
        + ` preset=${this._lastAppliedPreset}`
        + ` masterInsert=${this.masterInsertActive}`
        + ` draining=${this._draining}`,
      );
    } catch { /* ok */ }
  }

  /**
   * Apply the DSP-only bits of a character preset — spring params + tape
   * saturator curve. The settings-side fields (hpfCutoff, bassShelfGainDb,
   * etc.) are applied upstream by the store's setDubBus action, which
   * rewrites those values into the store BEFORE the mirror effect fires
   * setSettings on us. So by the time we land here, this.settings already
   * matches the preset; we only need to touch the things the store can't:
   * the spring worklet params and the tape-sat WaveShaper curve.
   *
   * Called once per preset-transition from setSettings — idempotent, so
   * repeat writes are cheap (setParamById is a no-op at the same value).
   */
  private _applyCharacterPreset(name: Exclude<DubBusSettings['characterPreset'], 'custom'>): void {
    const preset = DUB_CHARACTER_PRESETS[name];
    if (!preset) return;
    console.log(
      `[DubBusCtrl] _applyCharacterPreset ${name} |`
      + ` springsLength=${preset.springsLength} damp=${preset.springsDamp}`
      + ` chaos=${preset.springsChaos} scatter=${preset.springsScatter}`
      + ` tone=${preset.springsTone} tapeSatDrive=${preset.tapeSatDrive}`,
    );
    /* Spring param writes are smoothed inside the worklet (43ms linear
       ramp per param — see Aelapse.worklet.js _applyParam / _advanceParamRamps).
       Node.js WASM test confirmed the spring's own transient from a raw
       5-param switch is only peak 0.49 (-6.1dB) — well within range.
       The 2.5 peak measured in earlier browser tests came from the echo
       swap transient flowing THROUGH the spring, NOT from the spring's
       param change. That transient is already blocked by return_=0
       during the swap warmup (_swapEchoEngine holds return_ at 0 for
       120ms) or the same-engine _warmupMute.
       Previous approach (muteInput+muteOutput for 600ms) starved the
       spring's delay lines of audio, requiring 500ms+ to refill after
       unmute — effectively killing the reverb tail. Removed. */
    try {
      if (preset.springsLength  !== undefined) this.spring.setParamById(PARAM_SPRINGS_LENGTH,  preset.springsLength);
      if (preset.springsDamp    !== undefined) this.spring.setParamById(PARAM_SPRINGS_DAMP,    preset.springsDamp);
      if (preset.springsChaos   !== undefined) this.spring.setParamById(PARAM_SPRINGS_CHAOS,   preset.springsChaos);
      if (preset.springsScatter !== undefined) this.spring.setParamById(PARAM_SPRINGS_SCATTER, preset.springsScatter);
      if (preset.springsTone    !== undefined) this.spring.setParamById(PARAM_SPRINGS_TONE,    preset.springsTone);
    } catch (err) { console.warn('[DubBusCtrl] spring param write threw:', err); }
    if (preset.tapeSatDrive !== undefined) {
      try { this.tapeSat.curve = makeTapeSatCurve(preset.tapeSatDrive); } catch { /* ok */ }
    }
    this._snap(`after _applyCharacterPreset(${name})`);
    this._measureSpringOutput(`after preset ${name}`);
  }

  /** Tap the spring output with a transient AnalyserNode, log RMS every
   *  200ms for 2s. Used to diagnose whether the spring worklet is
   *  latching silent after a preset transition. Disposes itself. */
  private _measureSpringOutput(label: string): void {
    try {
      const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;
      const native = getNativeAudioNode(springOut as unknown);
      if (!native) { console.log(`[SpringTap] ${label} — could not get native spring.output`); return; }
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      (native as AudioNode).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let ticks = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sumSq = 0, peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const s = buf[i]; sumSq += s * s;
          const a = Math.abs(s); if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        console.log(`[SpringTap] ${label} t+${ticks*200}ms | rms=${rms.toFixed(5)} (${rmsDb.toFixed(1)}dB) peak=${peak.toFixed(5)}`);
        ticks++;
        if (ticks < 10) setTimeout(tick, 200);
        else {
          try { (native as AudioNode).disconnect(analyser); } catch { /* ok */ }
        }
      };
      setTimeout(tick, 200);
    } catch (err) {
      console.warn('[SpringTap] measurement failed:', err);
    }
  }

  /**
   * Splice the master-side TONE EQ chain between `source` and `dest`. Called
   * by DubDeckStrip when the bus enables — it hands over the native
   * `masterEffectsInput` and `blepInput` nodes from ToneEngine so we can
   * intercept the whole master signal, not just the wet return. Caller is
   * responsible for calling `unwireMasterInsert()` on disable.
   *
   * Idempotent: re-calling while active is a no-op. Safe to call with the
   * same nodes after a hot-reload — we undo the previous wiring first.
   */
  wireMasterInsert(source: AudioNode, dest: AudioNode): void {
    console.log('[DubBusCtrl] wireMasterInsert');
    this._snap('pre-wireMasterInsert');
    if (this.masterInsertActive &&
        this.masterInsertSource === source &&
        this.masterInsertDest === dest) {
      return;
    }
    // Cancel any in-flight rewire timer — rapid enable/disable cycles
    // would otherwise race (pending rewire fires after we've already
    // moved on). Safe to call when no timer is pending.
    if (this.masterInsertPending !== null) {
      clearTimeout(this.masterInsertPending);
      this.masterInsertPending = null;
    }
    if (this.masterInsertActive) this.unwireMasterInsert();
    // G15: mute the insert envelope BEFORE touching the audio graph so
    // the source→dest disconnect + new-chain connect happens while the
    // insert path is silent. Then ramp the envelope back up to 1 over
    // ~10 ms. Imperfect (the direct source→dest cut still happens
    // inside the mute window; caller sees a brief silence) but avoids
    // the mid-buffer click the old hard rewire produced.
    const now = this.context.currentTime;
    const FADE_SEC = 0.01;
    try {
      this.masterInsertEnvelope.gain.cancelScheduledValues(now);
      this.masterInsertEnvelope.gain.setValueAtTime(0, now);
    } catch { /* ok */ }
    try { source.disconnect(dest); } catch { /* ok */ }
    try {
      source.connect(this.masterInsertHead);
      this.masterInsertTail.connect(dest);
      // Direct tap for vinyl clicks/scratches — lands right next to the
      // main signal at the destination, so they're NOT filtered by any
      // master-side FX.
      this.vinylDirect.connect(dest);
      this.masterInsertSource = source;
      this.masterInsertDest = dest;
      this.masterInsertActive = true;
      // Re-run setSettings so the master-side gain writes pick up masterActive=true.
      this.setSettings({});
      // Ramp envelope back to 1 — insert fades in smoothly.
      try {
        this.masterInsertEnvelope.gain.linearRampToValueAtTime(1, now + FADE_SEC);
      } catch { /* ok */ }
    } catch (err) {
      console.warn('[DubBus] wireMasterInsert failed, restoring passthrough:', err);
      try { source.connect(dest); } catch { /* ok */ }
      try { this.masterInsertEnvelope.gain.setValueAtTime(1, this.context.currentTime); } catch { /* ok */ }
      this.masterInsertActive = false;
    }
  }

  /** Reverse the master insert. Safe to call when inactive. */
  unwireMasterInsert(): void {
    console.log('[DubBusCtrl] unwireMasterInsert');
    this._snap('pre-unwireMasterInsert');
    if (!this.masterInsertActive || !this.masterInsertSource || !this.masterInsertDest) {
      this.masterInsertActive = false;
      return;
    }
    // G15: ramp the insert envelope down to 0 first. After the ramp
    // completes, disconnect the insert chain and restore the direct
    // source→dest passthrough. Scheduling the swap inside a setTimeout
    // (after the ramp) means the hard reconnect happens while the
    // insert's contribution is already silent — no click from the
    // insert dropping out, only the direct-path pop-in to contend with.
    const now = this.context.currentTime;
    const FADE_SEC = 0.01;
    const source = this.masterInsertSource;
    const dest = this.masterInsertDest;
    try {
      this.masterInsertEnvelope.gain.cancelScheduledValues(now);
      this.masterInsertEnvelope.gain.setValueAtTime(this.masterInsertEnvelope.gain.value, now);
      this.masterInsertEnvelope.gain.linearRampToValueAtTime(0, now + FADE_SEC);
    } catch { /* ok */ }
    // Mark inactive immediately so setSettings (if called during the
    // pending-disconnect window) doesn't keep writing master-side gains
    // into a chain that's on its way out.
    this.masterInsertActive = false;
    this.masterInsertSource = null;
    this.masterInsertDest = null;
    this.masterInsertPending = setTimeout(() => {
      this.masterInsertPending = null;
      try { source.disconnect(this.masterInsertHead); } catch { /* ok */ }
      try { this.masterInsertTail.disconnect(dest); } catch { /* ok */ }
      try { this.vinylDirect.disconnect(dest); } catch { /* ok */ }
      try { source.connect(dest); } catch { /* ok */ }
      // Restore envelope to 1 so the next wire starts from a known state.
      try { this.masterInsertEnvelope.gain.setValueAtTime(1, this.context.currentTime); } catch { /* ok */ }
    }, (FADE_SEC * 1000) + 5);
    // Reset master-side gains to neutral so even a dangling reference is silent.
    rampBiquadParam(this.masterBassShelf.gain, 0, now);
    rampBiquadParam(this.masterMidScoop.gain, 0, now);
    try {
      this.masterMid.gain.setTargetAtTime(1, now, 0.02);
      this.masterSide.gain.setTargetAtTime(1, now, 0.02);
      this.masterInvertR.gain.setTargetAtTime(0, now, 0.02);
      const iL = (this.masterSide as unknown as { _invertL?: GainNode })._invertL;
      if (iL) iL.gain.setTargetAtTime(0, now, 0.02);
    } catch { /* ok */ }
  }

  /**
   * Update the M/S matrix gain coefficients per `width`:
   *   coeffA = 0.5 + 0.5*width (straight through from own side)
   *   coeffB = 0.5 - 0.5*width (cross-bleed to the other side)
   * width=0 → both sides see (L+R)/2 = mono
   * width=1 → identity (L→L, R→R)
   * width=2 → doubled side content (wide Mad Professor)
   */
  private _applyStereoWidth(width: number): void {
    const w = Math.max(0, Math.min(2, width));
    const a = 0.5 + 0.5 * w;
    const b = 0.5 - 0.5 * w;
    const now = this.context.currentTime;
    const invertL = (this.stereoSide as unknown as { _invertL?: GainNode })._invertL;
    try {
      this.stereoMid.gain.setTargetAtTime(a, now, 0.02);       // L→left
      this.stereoSide.gain.setTargetAtTime(a, now, 0.02);      // R→right
      this.stereoInvertR.gain.setTargetAtTime(b, now, 0.02);   // L→right
      if (invertL) invertL.gain.setTargetAtTime(b, now, 0.02); // R→left
    } catch { /* ok */ }
  }

  getSettings(): DubBusSettings {
    return { ...this.settings };
  }

  // ─── Tracker Channel Tap API ───────────────────────────────────────────────

  /** Called by ChannelRoutedEffects when a per-channel tap is created. */
  registerChannelTap(channelId: number, tap: GainNode): void {
    this.channelTaps.set(channelId, tap);
  }

  /** Called by ChannelRoutedEffects when a tap is torn down (dubSend → 0). */
  unregisterChannelTap(channelId: number): void {
    this.channelTaps.delete(channelId);
  }

  // ─── DJ deck per-channel taps ──────────────────────────────────────────
  //
  // Caller provides `sourceGain` — a GainNode the DJ deck returned from
  // DeckEngine.openChannelTap() that carries one channel's audio. Bus
  // creates a busGain at 0 (idle silent) and connects
  //   sourceGain → busGain → deckHpf → input.
  // openChannelTap(..., ctx: { deckId }) ramps busGain up for the
  // duration of the move and back to 0 on release.
  //
  // Keyed by `${deckId}:${ch}` so two decks can own the same channel
  // index without aliasing the tracker-view `channelTaps` map.

  registerDeckChannelTap(deckId: DeckId, channelIndex: number, sourceGain: GainNode): void {
    const key = `${deckId}:${channelIndex}`;
    // Re-registration: tear down the previous entry first. Common on song
    // reload or when the FX-target set changes membership.
    const existing = this.deckChannelTaps.get(key);
    if (existing) {
      try { existing.disposeSource(); } catch { /* ok */ }
      try { existing.busGain.disconnect(); } catch { /* ok */ }
      this.deckChannelTaps.delete(key);
    }

    const busGain = this.context.createGain();
    busGain.gain.value = 0; // idle silent until a move opens the tap
    try {
      sourceGain.connect(busGain);
      busGain.connect(this.deckHpf);
    } catch (e) {
      console.warn(`[DubBus] registerDeckChannelTap(${key}) connect failed:`, e);
      try { busGain.disconnect(); } catch { /* ok */ }
      return;
    }

    const disposeSource = () => {
      try { sourceGain.disconnect(busGain); } catch { /* ok */ }
    };
    this.deckChannelTaps.set(key, { busGain, disposeSource });
  }

  unregisterDeckChannelTap(deckId: DeckId, channelIndex: number): void {
    const key = `${deckId}:${channelIndex}`;
    const entry = this.deckChannelTaps.get(key);
    if (!entry) return;
    try { entry.disposeSource(); } catch { /* ok */ }
    try { entry.busGain.disconnect(); } catch { /* ok */ }
    this.deckChannelTaps.delete(key);
  }

  // ─── DJ deck per-stem taps (continuous send) ─────────────────────────────
  //
  // Unlike channel taps (move-activated, busGain starts at 0), stem taps are
  // continuous sends: busGain starts at STEM_DUB_SEND_GAIN so the stem audio
  // immediately feeds the dub effects chain (echo, spring, etc.). This mirrors
  // how hardware dub mixers route individual channels to effect sends.
  //
  // Keyed by `${deckId}:stem:${stemName}` in the same deckChannelTaps map.

  private static readonly STEM_DUB_SEND_GAIN = 0.7;

  registerDeckStemTap(deckId: DeckId, stemName: string, sourceGain: GainNode): void {
    const key = `${deckId}:stem:${stemName}`;
    const existing = this.deckChannelTaps.get(key);
    if (existing) {
      try { existing.disposeSource(); } catch { /* ok */ }
      try { existing.busGain.disconnect(); } catch { /* ok */ }
      this.deckChannelTaps.delete(key);
    }

    const busGain = this.context.createGain();
    busGain.gain.value = DubBus.STEM_DUB_SEND_GAIN;
    try {
      sourceGain.connect(busGain);
      busGain.connect(this.deckHpf);
    } catch (e) {
      console.warn(`[DubBus] registerDeckStemTap(${key}) connect failed:`, e);
      try { busGain.disconnect(); } catch { /* ok */ }
      return;
    }

    const disposeSource = () => {
      try { sourceGain.disconnect(busGain); } catch { /* ok */ }
    };
    this.deckChannelTaps.set(key, { busGain, disposeSource });
    console.log(`[DubBus] stem tap registered: ${key} (gain=${DubBus.STEM_DUB_SEND_GAIN})`);
  }

  unregisterDeckStemTap(deckId: DeckId, stemName: string): void {
    const key = `${deckId}:stem:${stemName}`;
    const entry = this.deckChannelTaps.get(key);
    if (!entry) return;
    try { entry.disposeSource(); } catch { /* ok */ }
    try { entry.busGain.disconnect(); } catch { /* ok */ }
    this.deckChannelTaps.delete(key);
    console.log(`[DubBus] stem tap unregistered: ${key}`);
  }

  /** Remove all stem taps for a deck (e.g. on track change). */
  unregisterAllDeckStemTaps(deckId: DeckId): void {
    const prefix = `${deckId}:stem:`;
    for (const [key, entry] of this.deckChannelTaps) {
      if (!key.startsWith(prefix)) continue;
      try { entry.disposeSource(); } catch { /* ok */ }
      try { entry.busGain.disconnect(); } catch { /* ok */ }
      this.deckChannelTaps.delete(key);
    }
  }

  // Activation callback — set by DubDeckStrip on mount. Lets openChannelTap
  // lazy-activate a channel's dub send when the user fires a move on a
  // channel whose fader is at 0 (no tap registered yet). Without this, the
  // whole move library (Echo Throw, Dub Stab, Channel Throw, Spring Slam,
  // etc.) was silent on cold channels because the tap only exists after
  // setChannelDubSend's async worklet activation.
  private channelActivate: ((channelId: number, amount: number) => void) | null = null;

  setChannelActivationCallback(cb: ((channelId: number, amount: number) => void) | null): void {
    this.channelActivate = cb;
  }

  /**
   * Echo Throw entry point — momentarily bump the channel's tap gain to
   * `amount` (regardless of the user's baseline dubSend), then close back
   * to the baseline when the returned releaser fires. Mirrors openDeckTap.
   *
   * Returns a releaser that ramps the tap back to its baseline.
   *
   * Warm path: tap already registered (fader > 0) — ramp existing gain.
   * Cold path: tap not yet registered — drive the mixer store's dubSend
   * via activation callback so the worklet spins up its dub slot, then on
   * release drive it back to the prior value.
   */
  openChannelTap(
    channelId: number,
    amount: number,
    attackSec = 0.005,
    ctx?: { deckId?: DeckId },
  ): () => void {
    if (!this.enabled) return () => {};
    const clamped = Math.min(1, Math.max(0, amount));

    // DJ deck routing takes precedence when a deckId is present. Deck
    // taps are pre-registered by the DJ store→engine bridge on
    // fxTargetChannels change (no cold path — no DJ fader controlling
    // a baseline send). If the tap isn't registered yet, silently
    // return a no-op so the move's release still runs without
    // errors — the user simply won't hear any contribution from this
    // channel for this fire.
    if (ctx?.deckId) {
      const key = `${ctx.deckId}:${channelId}`;
      const entry = this.deckChannelTaps.get(key);
      if (entry) {
        const gain = entry.busGain.gain;
        const baseline = 0; // DJ deck taps rest at 0 (no UI fader baseline)
        const now = this.context.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(clamped, now + attackSec);
        return () => {
          const release = this.context.currentTime;
          gain.cancelScheduledValues(release);
          gain.setValueAtTime(gain.value, release);
          gain.linearRampToValueAtTime(baseline, release + 0.08);
        };
      }
      return () => {};
    }

    const tap = this.channelTaps.get(channelId);

    if (tap) {
      const baseline = tap.gain.value;
      const now = this.context.currentTime;
      tap.gain.cancelScheduledValues(now);
      tap.gain.setValueAtTime(tap.gain.value, now);
      tap.gain.linearRampToValueAtTime(clamped, now + attackSec);
      fireParamLiveSubscribers(`dub.channelSend.ch${channelId}`, clamped);
      return () => {
        const release = this.context.currentTime;
        tap.gain.cancelScheduledValues(release);
        tap.gain.setValueAtTime(tap.gain.value, release);
        tap.gain.linearRampToValueAtTime(baseline, release + 0.08);
        fireParamLiveSubscribers(`dub.channelSend.ch${channelId}`, baseline);
      };
    }

    // SID mode — no per-channel worklet taps exist. Instead, boost the
    // global SID dub send gain (full-mix throw). This is the authentic dub
    // technique: SID's 3 voices are like instruments on one channel strip,
    // and the engineer pushes the strip's aux send for the throw.
    if (this._sidMode && this._sidDubSendGain) {
      const gain = this._sidDubSendGain.gain;
      // Baseline is the higher of the registered baseline and any manual channel slider
      const sliderMax = Math.max(...this._sidChannelDubSends);
      const baseline = Math.max(this._sidDubSendBaseline, sliderMax);
      const now = this.context.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(clamped, now + attackSec);
      // Animate all SID channel faders to show the tap opening
      for (let ch = 0; ch < 3; ch++) {
        fireParamLiveSubscribers(`dub.channelSend.ch${ch}`, clamped);
      }
      return () => {
        const release = this.context.currentTime;
        gain.cancelScheduledValues(release);
        gain.setValueAtTime(gain.value, release);
        gain.linearRampToValueAtTime(baseline, release + 0.08);
        for (let ch = 0; ch < 3; ch++) {
          fireParamLiveSubscribers(`dub.channelSend.ch${ch}`, this._sidChannelDubSends[ch] ?? 0);
        }
      };
    }

    // Cold channel — no tap yet. Activate via callback; the mixer store's
    // setChannelDubSend triggers ChannelRoutedEffects._activateDubChannel
    // which spins up the worklet dub slot + registers the tap with us.
    // Tap will exist shortly after but we don't wait — the gain ramp from
    // setChannelDubSend (0.02 s) is short enough that the move's envelope
    // lands audibly inside the throw window.
    if (!this.channelActivate) return () => {};
    this.channelActivate(channelId, clamped);
    return () => {
      try { this.channelActivate?.(channelId, 0); } catch { /* ok */ }
    };
  }

  /**
   * Temporarily boost echo feedback by `delta`, clamp to maxFeedback=0.95,
   * then restore the user's echoIntensity after `ms`. No-ops when disabled.
   * Used by echoThrow + (future) dubStab to create the "swelling echo tail"
   * that is the defining Echo Throw sound.
   */
  modulateFeedback(delta: number, ms: number): void {
    console.log(`[DubBusCtrl] modulateFeedback(delta=${delta.toFixed(3)}, ms=${ms})`);
    if (!this.enabled) return;
    const target = Math.min(0.95, this.settings.echoIntensity + Math.max(0, delta));
    try { this.echo.setIntensityInstant(target); } catch { /* ok */ }
    const t = setTimeout(() => {
      this.throwTimers.delete(t);
      try { this.echo.setIntensity(this.settings.echoIntensity); } catch { /* ok */ }
    }, ms);
    this.throwTimers.add(t);
  }

  /**
   * Solo a single channel's dub tap for the window of a move. Snapshot every
   * registered channelTap's gain, zero all except `channelId`, return a
   * releaser that restores the snapshot. Caller schedules the release when
   * the effect completes (triggers) or drives it on pointer release (holds).
   *
   * Effect: while soloed, only `channelId`'s audio feeds the bus chain
   * (echo, spring, etc.). So a Spring Slam or Filter Drop fired "on
   * channel 3" only splashes / sweeps channel 3's content.
   *
   * No-op + empty releaser when bus is disabled.
   */
  soloChannelTap(channelId: number, attackSec = 0.005): () => void {
    if (!this.enabled) return () => {};
    // Snapshot current gains so release can restore exact values (including
    // any mid-flight rampTo on other taps).
    const snapshot = new Map<number, number>();
    for (const [id, tap] of this.channelTaps) {
      snapshot.set(id, tap.gain.value);
    }
    const now = this.context.currentTime;
    for (const [id, tap] of this.channelTaps) {
      if (id === channelId) continue;
      try {
        tap.gain.cancelScheduledValues(now);
        tap.gain.setValueAtTime(tap.gain.value, now);
        tap.gain.linearRampToValueAtTime(0, now + attackSec);
      } catch { /* ok */ }
    }
    // Also bump the target channel to full so the solo "opens" its tap
    // even if the user had its send low.
    const tgt = this.channelTaps.get(channelId);
    if (tgt) {
      try {
        tgt.gain.cancelScheduledValues(now);
        tgt.gain.setValueAtTime(tgt.gain.value, now);
        tgt.gain.linearRampToValueAtTime(1, now + attackSec);
      } catch { /* ok */ }
    }
    return () => {
      const release = this.context.currentTime;
      for (const [id, gain] of snapshot) {
        const tap = this.channelTaps.get(id);
        if (!tap) continue;
        try {
          tap.gain.cancelScheduledValues(release);
          tap.gain.setValueAtTime(tap.gain.value, release);
          tap.gain.linearRampToValueAtTime(gain, release + 0.08);
        } catch { /* ok */ }
      }
    };
  }

  /**
   * Spring Slam — temporarily crank spring wet to `amount` (default 1.0),
   * then restore the user's baseline after `ms`. Designed for rhythmic
   * "splash" hits where a drum/clap gets a sudden tail of metal-tank
   * reverb and then snaps back. Mirrors modulateFeedback's pattern so
   * disposal works the same way. No-op when bus is disabled.
   */
  slamSpring(amount = 1.0, ms = 800): void {
    console.log(`[DubBusCtrl] slamSpring(amount=${amount.toFixed(3)}, ms=${ms})`);
    if (!this.enabled) return;
    const target = Math.min(1.0, Math.max(0, amount));

    // SID mode: replace the clean WebAudio sine+noise tandem with authentic
    // SID-chip excitation (triangle sub on CH_BASS + noise snare on
    // CH_ONESHOT). The SID output already feeds bus.input, so the chip
    // audio flows through HPF → tapeSat → spring naturally. We just crank
    // the spring wet for the tail window so the kick rings through clearly.
    if (this._sidMode && this._sidSynths?.isReady) {
      try {
        this._sidSynths.fireSlam(Math.min(400, ms));
      } catch (err) {
        console.warn('[DubBus] SID slamSpring excitation failed:', err);
      }
      this._setSpringWet(target);
      const t = setTimeout(() => {
        this.throwTimers.delete(t);
        this._setSpringWet(this.settings.springWet);
      }, ms);
      this.throwTimers.add(t);
      return;
    }

    // Kick the tank: TWO stacked layers model the physical reality of
    // hitting a spring reverb unit.
    //   1. SUB-THUMP — a 55 Hz sine with 200 ms exp decay, the tank body
    //      "whumping". Routed through the bus input AND into the return
    //      directly so it hits the output LOUD even when the mix is quiet.
    //   2. METAL SHANG — bandpass-filtered noise at 800 Hz, routed into
    //      the spring's input so every spring in the tank oscillates.
    // Without (1) the user only hears a metallic click; without (2) only
    // a low whump. Stacked they read as THUNDER.
    try {
      const ctx = this.context;
      const now = ctx.currentTime;
      const sr = ctx.sampleRate;

      // ── Layer 1: sub-thump ─────────────────────────────────────────────
      const thumpDur = 0.30;
      const thumpBuf = ctx.createBuffer(2, Math.round(sr * thumpDur), sr);
      for (let c = 0; c < 2; c++) {
        const ch = thumpBuf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const t = i / sr;
          const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.08);
          // 55 Hz sine, slight detune per channel for stereo body
          const freq = 55 + (c === 0 ? -1 : 1);
          ch[i] = Math.sin(2 * Math.PI * freq * t) * env;
        }
      }
      const thumpSrc = ctx.createBufferSource();
      thumpSrc.buffer = thumpBuf;
      const thumpToInput = ctx.createGain();
      thumpToInput.gain.value = target * 1.5;
      thumpSrc.connect(thumpToInput);
      thumpToInput.connect(this.input);
      // Direct to return so the whump is always audible, not choked by bus sidechain
      const thumpToReturn = ctx.createGain();
      thumpToReturn.gain.value = target * 2.0;
      thumpSrc.connect(thumpToReturn);
      thumpToReturn.connect(this.return_);
      thumpSrc.start(now);
      thumpSrc.stop(now + thumpDur + 0.05);
      thumpSrc.onended = () => {
        try { thumpSrc.disconnect(); thumpToInput.disconnect(); thumpToReturn.disconnect(); } catch { /* ok */ }
      };

      // ── Layer 2: metal shang ───────────────────────────────────────────
      const shangDur = 0.15;
      const shangBuf = ctx.createBuffer(2, Math.round(sr * shangDur), sr);
      for (let c = 0; c < 2; c++) {
        const ch = shangBuf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const attackSamples = sr * 0.003;
          const attack = Math.min(1, i / attackSamples);
          const decay = Math.exp(-Math.max(0, i - attackSamples) / (ch.length * 0.22));
          ch[i] = (Math.random() * 2 - 1) * attack * decay;
        }
      }
      const shangSrc = ctx.createBufferSource();
      shangSrc.buffer = shangBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      bp.Q.value = 0.8;
      shangSrc.connect(bp);
      // Add a bright top-end splash — 6 kHz peaking filter in parallel
      // with the main bandpass so the shang has real crystalline sparkle.
      const bright = ctx.createBiquadFilter();
      bright.type = 'peaking';
      bright.frequency.value = 5500;
      bright.Q.value = 2.0;
      bright.gain.value = 9;  // +9 dB presence at 5.5 kHz
      shangSrc.connect(bright);
      const shangToSpring = ctx.createGain();
      shangToSpring.gain.value = target * 3.0;  // hit the tank HARD
      bp.connect(shangToSpring);
      bright.connect(shangToSpring);
      Tone.connect(shangToSpring, this.spring.input as unknown as Tone.InputNode);
      const shangToReturn = ctx.createGain();
      shangToReturn.gain.value = target * 1.5;
      bp.connect(shangToReturn);
      bright.connect(shangToReturn);
      shangToReturn.connect(this.return_);
      shangSrc.start(now);
      shangSrc.stop(now + shangDur + 0.05);
      shangSrc.onended = () => {
        try { shangSrc.disconnect(); bp.disconnect(); bright.disconnect(); shangToSpring.disconnect(); shangToReturn.disconnect(); } catch { /* ok */ }
      };
    } catch (err) {
      console.warn('[DubBus] slamSpring impulse failed:', err);
    }
    // Crank wet for a long tail window so the tank ring reads clearly.
    this._setSpringWet(target);
    const t = setTimeout(() => {
      this.throwTimers.delete(t);
      this._setSpringWet(this.settings.springWet);
    }, ms);
    this.throwTimers.add(t);
  }

  /**
   * kickSpring — inject a 5ms broadband impulse directly into the spring
   * input at massive amplitude. Models physically kicking the reverb tank.
   * All spring resonant modes fire at once → thunderous crash.
   */
  kickSpring(amount = 1.0, holdMs = 600): void {
    console.log(`[DubBusCtrl] kickSpring(amount=${amount.toFixed(3)}, holdMs=${holdMs})`);
    if (!this.enabled) return;
    const gain = Math.min(1.0, Math.max(0, amount));

    try {
      const ctx = this.context;
      const now = ctx.currentTime;
      const sr = ctx.sampleRate;

      // Ultra-short broadband impulse — 5ms of full-spectrum noise
      // shaped by a 0.5ms attack + 4.5ms exponential decay.
      const dur = 0.005;
      const buf = ctx.createBuffer(2, Math.round(sr * dur), sr);
      for (let c = 0; c < 2; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const t = i / sr;
          const env = Math.min(1, t / 0.0005) * Math.exp(-t / 0.0015);
          ch[i] = (Math.random() * 2 - 1) * env;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const impulseGain = ctx.createGain();
      impulseGain.gain.value = gain * 6.0;  // hit HARD
      src.connect(impulseGain);
      Tone.connect(impulseGain, this.spring.input as unknown as Tone.InputNode);
      src.start(now);
      src.stop(now + dur + 0.01);
      src.onended = () => {
        try { src.disconnect(); impulseGain.disconnect(); } catch { /* ok */ }
      };
    } catch (err) {
      console.warn('[DubBus] kickSpring impulse failed:', err);
    }

    // Crank wet so the tank ring is clearly audible
    this._setSpringWet(Math.max(this.settings.springWet, gain));
    const t2 = setTimeout(() => {
      this.throwTimers.delete(t2);
      this._setSpringWet(this.settings.springWet);
    }, holdMs);
    this.throwTimers.add(t2);
  }

  /**
   * Sweep the echo delay time to `targetMs` over `downMs`, hold at target,
   * then return to the user's baseline over `upMs`. When the tape head
   * accelerates/decelerates on a real RE-201, echoes in flight get
   * pitch-shifted — this move emulates that by ramping the delay time
   * faster than one echo period, producing a whoosh as the tail's
   * pitch rises or falls.
   */
  throwEchoTime(targetMs: number, downMs = 120, holdMs = 200, upMs = 300): void {
    console.log(`[DubBusCtrl] throwEchoTime(target=${targetMs}ms, downMs=${downMs}, holdMs=${holdMs}, upMs=${upMs})`);
    if (!this.enabled) return;
    const baseline = this.settings.echoRateMs;
    const target = Math.max(20, Math.min(1500, targetMs));
    // Step the rate through a short linear ramp via sequential setRate calls.
    // SpaceEchoEffect.setRate internally smooths to avoid clicks.
    const steps = 6;
    const stepMs = downMs / steps;
    for (let i = 1; i <= steps; i++) {
      const v = baseline + (target - baseline) * (i / steps);
      const t = setTimeout(() => {
        this.throwTimers.delete(t);
        try { this.echo.setRate(v); } catch { /* ok */ }
      }, stepMs * i);
      this.throwTimers.add(t);
    }
    const returnAt = downMs + holdMs;
    const upSteps = 6;
    const upStepMs = upMs / upSteps;
    for (let i = 1; i <= upSteps; i++) {
      const v = target + (baseline - target) * (i / upSteps);
      const t = setTimeout(() => {
        this.throwTimers.delete(t);
        try { this.echo.setRate(v); } catch { /* ok */ }
      }, returnAt + upStepMs * i);
      this.throwTimers.add(t);
    }
  }

  /**
   * Continuous echo-rate LFO — call to start wobbling the delay line
   * at `depthMs` around the user's baseline at `rateHz`. Returns a
   * releaser that stops the LFO and restores the baseline smoothly.
   * Real tape heads wow on every platter rotation; this emulates that
   * seasick flutter without the RE-201's own wow param (which bakes
   * a fixed-rate wobble into the tape head read point, not the delay
   * time itself).
   */
  /**
   * Lazily install the ReverseCapture worklet and wire it as a silenced tap
   * off `input`. First call fetches the worklet module; subsequent calls
   * resolve immediately. The tap node must have its output connected to
   * something (else Web Audio won't pull audio through it and the ring stays
   * empty) — we route through a silenced gain → destination so no audio
   * leaks out.
   */
  private async _ensureReverseCapture(): Promise<AudioWorkletNode | null> {
    if (this.reverseCapture) return this.reverseCapture;
    if (this.reverseCaptureInit) {
      await this.reverseCaptureInit;
      return this.reverseCapture;
    }
    this.reverseCaptureInit = (async () => {
      try {
        const baseUrl = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
        const cacheBuster = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? `?v=${Date.now()}` : '';
        await this.context.audioWorklet.addModule(`${baseUrl}dub/ReverseCapture.worklet.js${cacheBuster}`);
        const node = new AudioWorkletNode(this.context, 'reverse-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        const silencer = this.context.createGain();
        silencer.gain.value = 0;
        this.input.connect(node);
        node.connect(silencer);
        silencer.connect(this.context.destination);
        this.reverseCapture = node;
        this.reverseCaptureSilencer = silencer;
      } catch (e) {
        console.warn('[DubBus] ReverseCapture init failed:', e);
      }
    })();
    await this.reverseCaptureInit;
    return this.reverseCapture;
  }

  /**
   * Backward Reverb — classic dub move where the last N seconds of bus
   * input are time-reversed and played back through the bus chain. Because
   * the reversed signal hits echo + spring on its way out, the reverb
   * "builds up" into the original attack rather than tailing out from it.
   * Not a simple spring-wet swell — that's audibly different.
   *
   * Fire-and-forget: each call snapshots the ring, plays the reversed
   * buffer exactly once, and disconnects the source when playback ends.
   * Stacks cleanly — multiple simultaneous reverses don't collide.
   */
  async backwardReverb(durationSec = 0.8): Promise<void> {
    if (!this.enabled) { console.warn('[DubBus] backwardReverb ignored — bus disabled'); return; }
    const node = await this._ensureReverseCapture();
    if (!node) { console.warn('[DubBus] backwardReverb ignored — capture node missing'); return; }
    console.log(`[DubBus] backwardReverb ▶ captureDur=${durationSec}s`);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[DubBus] backwardReverb timeout — worklet did not reply within 1s');
        node.port.removeEventListener('message', handler);
        resolve();
      }, 1000);

      const handler = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || msg.cmd !== 'snapshot') return;
        clearTimeout(timeout);
        node.port.removeEventListener('message', handler);
        try {
          // Copy into fresh ArrayBuffer-backed Float32Arrays so the TS strict
          // Float32Array<ArrayBuffer> signature of copyToChannel matches (the
          // message port's received arrays are Float32Array<ArrayBufferLike>).
          const srcLeft = msg.left as Float32Array;
          const srcRight = msg.right as Float32Array;
          const frames = Number(msg.frames) || srcLeft.length;
          console.log(`[DubBus] backwardReverb snapshot received — frames=${frames}`);
          if (!frames) {
            console.warn('[DubBus] backwardReverb abort — empty ring buffer (no audio reached bus.input yet)');
            resolve();
            return;
          }
          const left = new Float32Array(new ArrayBuffer(frames * 4));
          const right = new Float32Array(new ArrayBuffer(frames * 4));
          left.set(srcLeft);
          right.set(srcRight);
          const buffer = this.context.createBuffer(2, frames, this.context.sampleRate);
          buffer.copyToChannel(left, 0);
          buffer.copyToChannel(right, 1);
          const src = this.context.createBufferSource();
          src.buffer = buffer;
          // Play straight into bus input so echo + spring process the
          // reversed signal. Ramp in/out over 5ms each side to avoid a
          // click on the attack sample and tail sample (which were the
          // live bus's "now" and "N seconds ago", not necessarily zero).
          const shaper = this.context.createGain();
          shaper.gain.value = 0;
          src.connect(shaper);
          shaper.connect(this.input);
          // Route a parallel copy to return_ so the reverse reads LOUD even
          // when bus sidechain/glue damps the wet return.
          const reverseToReturn = this.context.createGain();
          reverseToReturn.gain.value = 0;
          src.connect(reverseToReturn);
          reverseToReturn.connect(this.return_);
          const now = this.context.currentTime;
          const durationPlayed = frames / this.context.sampleRate;
          // Rising swell envelope — reversed audio gets louder as it
          // approaches the "original attack" moment, classic "suck into
          // the downbeat" character. Peaks at 1.5 (hot) and ramps down over
          // final 10ms to avoid click.
          shaper.gain.setValueAtTime(0, now);
          shaper.gain.linearRampToValueAtTime(1.2, now + durationPlayed * 0.85);
          shaper.gain.setValueAtTime(1.2, now + Math.max(0.01, durationPlayed - 0.01));
          shaper.gain.linearRampToValueAtTime(0, now + durationPlayed);
          // Parallel direct-to-return at lower gain for body
          reverseToReturn.gain.setValueAtTime(0, now);
          reverseToReturn.gain.linearRampToValueAtTime(0.6, now + durationPlayed * 0.85);
          reverseToReturn.gain.setValueAtTime(0.6, now + Math.max(0.01, durationPlayed - 0.01));
          reverseToReturn.gain.linearRampToValueAtTime(0, now + durationPlayed);
          // Spring wet swell — crank to 1.0 peaking at the end of the
          // reverse so the spring tank rings out as the reverse lands.
          const priorWet = this._springWetCache;
          this._setSpringWet(1.0);
          const wetRestoreTimer = setTimeout(() => {
            this.throwTimers.delete(wetRestoreTimer);
            this._setSpringWet(priorWet);
          }, (durationPlayed + 0.3) * 1000);
          this.throwTimers.add(wetRestoreTimer);
          src.start(now);
          src.stop(now + durationPlayed + 0.01);
          src.onended = () => {
            try { shaper.disconnect(); reverseToReturn.disconnect(); } catch { /* ok */ }
          };
        } catch (err) {
          console.warn('[DubBus] backwardReverb playback failed:', err);
        }
        resolve();
      };

      node.port.addEventListener('message', handler);
      node.port.start?.();
      node.port.postMessage({ cmd: 'snapshot', durationSec });
    });
  }

  /**
   * Tape Stop — the classic reel-to-reel slowdown on the bus tail. Not a
   * transport-level speed change (which would require per-engine coordination
   * across libopenmpt / UADE / Hively / Furnace); instead, this is a
   * bus-only effect that reads as "the dub tail melts into the floor":
   *   - LPF sweeps down to 80 Hz over downSec (all HF gone)
   *   - Echo rate ramps up ×2.5 over the same window (tail slows, pitch drops)
   *   - return gain ramps to 0 in the last 15% (muffled silence to cap the drop)
   * After holdSec, every param snaps back to the user's baseline. Fire-and-
   * forget; owns its own timeline, no disposer. No-op when bus disabled.
   */
  /**
   * Reverse Echo — grab last `durationSec` from the reverse-capture ring,
   * reverse it, play forward at `amount` gain directly into the echo
   * input path. Distinct from backwardReverb which goes through the FULL
   * bus wet chain. This version stays tight and "dry-reverse-echoed",
   * landing as a pre-downbeat flourish rather than a long swell.
   */
  async reverseEcho(durationSec = 0.4, amount = 1.0): Promise<void> {
    if (!this.enabled) { console.warn('[DubBus] reverseEcho ignored — bus disabled'); return; }
    const node = await this._ensureReverseCapture();
    if (!node) { console.warn('[DubBus] reverseEcho ignored — capture node missing'); return; }
    console.log(`[DubBus] reverseEcho ▶ captureDur=${durationSec}s amount=${amount}`);
    // First-fire robustness: if the capture worklet was created only moments
    // ago (bus just enabled), its ring buffer may still be empty. 2026-04-20
    // sweep caught this as Δpk=+0.006 on the first fire vs +0.103 on later
    // fires. Retry up to 2× with 180ms between attempts — at normal sample
    // rates ~8k frames accumulate per 180ms block, enough for any sensible
    // durationSec <= ~800ms.
    await this._snapshotReverseRing(node, durationSec, /* playbackAmount */ amount, /* maxAttempts */ 3);
  }

  /**
   * Internal — snapshot the reverse-capture ring and schedule the reversed
   * buffer for playback. Retries on empty ring (worklet just booted, audio
   * hasn't accumulated yet). Shared by reverseEcho (into echo chain only)
   * and could be extended to backwardReverb if it hits the same race.
   */
  private async _snapshotReverseRing(
    node: AudioWorkletNode,
    durationSec: number,
    amount: number,
    maxAttempts: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const didPlay = await this._snapshotReverseRingOnce(node, durationSec, amount);
      if (didPlay) return;
      // Empty ring on this attempt — wait briefly for the capture worklet to
      // accumulate more frames, then try again.
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 180));
      }
    }
    console.warn('[DubBus] reverseEcho abort — ring still empty after retries; bus input likely silent');
  }

  private async _snapshotReverseRingOnce(
    node: AudioWorkletNode,
    durationSec: number,
    amount: number,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[DubBus] reverseEcho timeout — worklet did not reply within 1s');
        node.port.removeEventListener('message', handler);
        resolve(false);
      }, 1000);
      const handler = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || msg.cmd !== 'snapshot') return;
        clearTimeout(timeout);
        node.port.removeEventListener('message', handler);
        try {
          const srcLeft = msg.left as Float32Array;
          const srcRight = msg.right as Float32Array;
          const frames = Number(msg.frames) || srcLeft.length;
          console.log(`[DubBus] reverseEcho snapshot received — frames=${frames}`);
          if (!frames) {
            // Signal empty — caller decides whether to retry.
            resolve(false);
            return;
          }
          const left = new Float32Array(new ArrayBuffer(frames * 4));
          const right = new Float32Array(new ArrayBuffer(frames * 4));
          left.set(srcLeft);
          right.set(srcRight);
          const buf = this.context.createBuffer(2, frames, this.context.sampleRate);
          buf.copyToChannel(left, 0);
          buf.copyToChannel(right, 1);
          const src = this.context.createBufferSource();
          src.buffer = buf;
          const envG = this.context.createGain();
          envG.gain.value = 0;
          src.connect(envG);
          // Route directly into echo input rather than bus input so the
          // signal gets the 3-head tape-echo treatment without the HPF +
          // bassShelf + tapeSat pre-chain coloring the reverse further.
          const echoIn = this.echo.input as unknown as Tone.InputNode;
          Tone.connect(envG, echoIn);
          const now = this.context.currentTime;
          const dur = frames / this.context.sampleRate;
          const peak = Math.max(0, Math.min(1.5, amount));
          envG.gain.setValueAtTime(0, now);
          envG.gain.linearRampToValueAtTime(peak, now + 0.003);
          envG.gain.setValueAtTime(peak, now + Math.max(0.005, dur - 0.005));
          envG.gain.linearRampToValueAtTime(0, now + dur);
          src.start(now);
          src.stop(now + dur + 0.01);
          src.onended = () => { try { envG.disconnect(); } catch { /* ok */ } };
          resolve(true);
          return;
        } catch (err) {
          console.warn('[DubBus] reverseEcho playback failed:', err);
        }
        resolve(false);
      };
      node.port.addEventListener('message', handler);
      node.port.start?.();
      node.port.postMessage({ cmd: 'snapshot', durationSec });
    });
  }

  /**
   * Set the echo delay rate directly. Used by delayPreset* moves to snap
   * to canonical Tubby / Perry timings without touching the user-facing
   * settings.echoRateMs (so the preset is "drive-by" — next setSettings
   * pass from the UI will push the user's rate back).
   */
  setEchoRate(ms: number): void {
    console.log(`[DubBusCtrl] setEchoRate(${ms}ms)`);
    if (!this.enabled) return;
    try { this.echo.setRate(Math.max(10, Math.min(1500, ms))); } catch { /* ok */ }
  }

  /**
   * Sonar Ping — single sine pulse fed into the echo input so it repeats
   * across 3 tape heads. Clean tone, short envelope, ride the default
   * echo rate. Classic Tubby / Perry transition accent.
   */
  firePing(freq = 1000, durationMs = 140, level = 0.8): void {
    if (!this.enabled) return;
    // SID mode: triangle ping
    if (this._sidMode && this._sidSynths?.isReady) {
      this._sidSynths.firePing(undefined, durationMs);
      return;
    }
    try {
      const ctx = this.context;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = Math.max(100, Math.min(8000, freq));
      const env = ctx.createGain();
      env.gain.value = 0;
      osc.connect(env);
      const peak = Math.max(0, Math.min(1.0, level));
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.005);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.01), now + durationMs / 1000);
      // Route into echo input so the repeats stack; small parallel to return_
      // so the first ping lands audibly even if return gain is low.
      const toEcho = ctx.createGain();
      toEcho.gain.value = 1.0;
      env.connect(toEcho);
      const echoIn = this.echo.input as unknown as Tone.InputNode;
      Tone.connect(toEcho, echoIn);
      const toReturn = ctx.createGain();
      toReturn.gain.value = 0.6;
      env.connect(toReturn);
      toReturn.connect(this.return_);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.02);
      osc.onended = () => {
        try { env.disconnect(); toEcho.disconnect(); toReturn.disconnect(); } catch { /* ok */ }
      };
    } catch (err) {
      console.warn('[DubBus] firePing failed:', err);
    }
  }

  /**
   * Radio Riser — band-limited pink-noise swept from `startHz` → `endHz`
   * over `sweepSec`, routed into the bus. Rising build-up that can stand
   * in for a Dub Siren or precede a drop.
   */
  fireRadioRiser(startHz = 200, endHz = 5000, sweepSec = 1.2, level = 0.7): void {
    if (!this.enabled) return;
    // SID mode: noise riser
    if (this._sidMode && this._sidSynths?.isReady) {
      this._sidSynths.fireRadioRiser(sweepSec * 1000);
      return;
    }
    try {
      const ctx = this.context;
      const sr = ctx.sampleRate;
      const dur = Math.max(0.2, sweepSec);
      const frames = Math.ceil(sr * (dur + 0.1));
      const buf = ctx.createBuffer(1, frames, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // Bandpass sweep from startHz → endHz with moderate Q for the
      // "radio between stations" character
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.max(80, startHz);
      bp.Q.value = 3;
      const now = ctx.currentTime;
      bp.frequency.setValueAtTime(Math.max(80, startHz), now);
      bp.frequency.exponentialRampToValueAtTime(Math.max(80, endHz), now + dur);
      // Rising envelope
      const env = ctx.createGain();
      env.gain.value = 0;
      const peak = Math.max(0, Math.min(1.0, level));
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + dur);
      env.gain.linearRampToValueAtTime(0, now + dur + 0.05);
      src.connect(bp);
      bp.connect(env);
      const toInput = ctx.createGain();
      toInput.gain.value = 0.9;
      env.connect(toInput);
      toInput.connect(this.input);
      const toReturn = ctx.createGain();
      toReturn.gain.value = 0.5;
      env.connect(toReturn);
      toReturn.connect(this.return_);
      src.start(now);
      src.stop(now + dur + 0.1);
      src.onended = () => {
        try { bp.disconnect(); env.disconnect(); toInput.disconnect(); toReturn.disconnect(); } catch { /* ok */ }
      };
    } catch (err) {
      console.warn('[DubBus] fireRadioRiser failed:', err);
    }
  }

  /**
   * Sub Swell — clean low-frequency sine pulse routed direct to return
   * to add weight without going through the echo/spring chain. Short
   * envelope so it reads as a "UUUUM" pulse rather than a drone.
   */
  fireSubSwell(freq = 55, durationMs = 400, level = 0.8): void {
    if (!this.enabled) return;
    // SID mode: triangle sub swell
    if (this._sidMode && this._sidSynths?.isReady) {
      this._sidSynths.fireSubSwell(undefined, durationMs);
      return;
    }
    try {
      const ctx = this.context;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = Math.max(30, Math.min(200, freq));
      const env = ctx.createGain();
      env.gain.value = 0;
      osc.connect(env);
      const peak = Math.max(0, Math.min(1.0, level));
      const dur = durationMs / 1000;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.02);
      env.gain.setValueAtTime(peak, now + Math.max(0.03, dur * 0.7));
      env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.001), now + dur);
      env.connect(this.return_);
      osc.start(now);
      osc.stop(now + dur + 0.02);
      osc.onended = () => { try { env.disconnect(); } catch { /* ok */ } };
    } catch (err) {
      console.warn('[DubBus] fireSubSwell failed:', err);
    }
  }

  /**
   * Sub Harmonic — envelope-follower that triggers a short sub-sine pulse
   * whenever the bus input crosses `threshold`. The sub rides every
   * transient in the music, thickening kicks/snares without a continuous
   * drone. Implemented via an AnalyserNode polling on rAF — not sample-
   * accurate but punchy enough for a dub move.
   */
  startSubHarmonic(freq = 55, threshold = 0.06, level = 0.5): () => void {
    if (!this.enabled) return () => {};
    const ctx = this.context;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.1;
    try {
      Tone.connect(this.input, analyser as unknown as Tone.InputNode);
    } catch { /* ok */ }
    const data = new Float32Array(analyser.fftSize);
    let rafHandle = 0;
    let lastFireAt = 0;
    let running = true;
    // In SID mode we fire a SID triangle sub-blip on CH_ONESHOT instead of
    // a clean WebAudio sine so the booster has 8-bit character matching
    // the SID that's actually playing. Falls through to the WebAudio path
    // if the SID synths aren't ready yet.
    const useSid = this._sidMode && this._sidSynths?.isReady;
    const sidSynths = this._sidSynths;
    const fireSub = () => {
      if (useSid && sidSynths) {
        try {
          // Low SID note roughly matching `freq`. 0x48 ≈ C-1, 0x50 ≈ G-1,
          // 0x60 ≈ C-2. Clamp `freq` into the expected 30–120 Hz range
          // and map linearly to the 0x48–0x60 SID note band.
          const clamped = Math.max(30, Math.min(120, freq));
          const noteByte = Math.round(0x48 + ((clamped - 30) / 90) * 0x18);
          sidSynths.fireSubBooster(noteByte, 120);
        } catch { /* ok */ }
        return;
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = Math.max(30, Math.min(200, freq));
      const env = ctx.createGain();
      env.gain.value = 0;
      osc.connect(env);
      env.connect(this.return_);
      // Sine sums in phase with the song at low frequencies — level 0.85 over
      // a song at baseline 0.86 pushed peak to 1.066 in the 2026-04-20 sweep.
      // Clamp at 0.55 leaves enough headroom that even in-phase summation
      // with a loud song stays below full scale.
      const peak = Math.max(0, Math.min(0.55, level));
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
      osc.onended = () => { try { env.disconnect(); } catch { /* ok */ } };
    };
    const poll = () => {
      if (!running) return;
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
      }
      const nowMs = performance.now();
      // Fire if above threshold AND we haven't fired in 100 ms (debounce)
      if (peak > threshold && nowMs - lastFireAt > 100) {
        lastFireAt = nowMs;
        fireSub();
      }
      rafHandle = requestAnimationFrame(poll);
    };
    rafHandle = requestAnimationFrame(poll);
    return () => {
      running = false;
      cancelAnimationFrame(rafHandle);
      try { analyser.disconnect(); } catch { /* ok */ }
    };
  }

  /**
   * Crush Bass — sawtooth → WaveShaper quantized to N bits → LPF → return.
   * The bit-depth reduction creates stepped quantization distortion (hard
   * odd-harmonic edge), LPF removes aliased hiss. 3-bit = 8 quantize
   * levels; 2-bit = 4; 1-bit = hard square. Lower bits = more aggressive.
   */
  startCrushBass(freq = 55, bits = 3, level = 0.55): () => void {
    if (!this.enabled) return () => {};
    // SID mode: narrow pulse bass
    if (this._sidMode && this._sidSynths?.isReady) {
      return this._sidSynths.startCrushBass();
    }
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = Math.max(20, Math.min(400, freq));
    // WaveShaper quantize curve — map -1..1 to the nearest N-bit level
    const levels = Math.pow(2, Math.max(1, Math.min(8, bits)));
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;  // -1..1
      curve[i] = Math.round((x + 1) * 0.5 * (levels - 1)) / (levels - 1) * 2 - 1;
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1800;  // kills aliased hiss above bass content
    lpf.Q.value = 0.707;
    const env = ctx.createGain();
    env.gain.value = 0;
    osc.connect(shaper);
    shaper.connect(lpf);
    lpf.connect(env);
    env.connect(this.return_);
    // Bit-crushed saw adds hard odd harmonics on top of the song's own low
    // end — measured peak 1.004 in the 2026-04-20 sweep at level 0.75 over
    // baseline 0.75. Clamp at 0.55 keeps it under unity while still sounding
    // aggressive against the mix.
    const peak = Math.max(0, Math.min(0.55, level));
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.05);
    osc.start(now);
    return () => {
      const release = ctx.currentTime;
      try {
        env.gain.cancelScheduledValues(release);
        env.gain.setValueAtTime(env.gain.value, release);
        env.gain.linearRampToValueAtTime(0, release + 0.2);
      } catch { /* ok */ }
      setTimeout(() => {
        try { osc.stop(); osc.disconnect(); shaper.disconnect(); lpf.disconnect(); env.disconnect(); } catch { /* ok */ }
      }, 300);
    };
  }

  /**
   * Osc Bass — self-oscillating LPF as a bass source. A sawtooth through
   * a high-Q lowpass at the target frequency, creating a resonant drone
   * bass. Hold move; release fades over 200 ms.
   *
   * Chain: osc → filt (Q=18 LPF) → env → softClip → return_
   *
   * The Q=18 lowpass rings on the saw's fundamental, producing a resonant
   * bass note. Level-clamping env.gain alone wasn't enough — the filter's
   * ringing transients are not strictly proportional to env.gain (2026-04-20
   * sweep: 0.35→0.30 reduction only moved peak 1.003→1.002). A tanh-curve
   * waveshaper after env hard-limits individual samples to ±0.7 regardless
   * of how loud the filter rings, so oscBass can never push the bus past
   * unity even when summed with a loud song underneath.
   */
  startOscBass(freq = 55, level = 0.45): () => void {
    if (!this.enabled) return () => {};
    // SID mode: sawtooth bass
    if (this._sidMode && this._sidSynths?.isReady) {
      return this._sidSynths.startOscBass();
    }
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = Math.max(30, Math.min(200, freq));
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = Math.max(30, Math.min(200, freq));
    filt.Q.value = 18;  // self-oscillation territory
    const env = ctx.createGain();
    env.gain.value = 0;
    // Hard soft-clip stage — tanh curve that caps the branch output near
    // ±0.4 regardless of how loud the Q=18 filter's resonance rings.
    // Provides headroom for summation with the song without cutting off
    // the resonant character. Localized to this branch so it only
    // affects oscBass's contribution; the song's own dynamics pass
    // through the rest of the bus untouched.
    const softClip = ctx.createWaveShaper();
    const clipCurve = new Float32Array(2049);
    for (let i = 0; i < clipCurve.length; i++) {
      const x = (i / (clipCurve.length - 1)) * 2 - 1;  // -1..1
      clipCurve[i] = 0.4 * Math.tanh(x * 2.5);
    }
    softClip.curve = clipCurve;
    softClip.oversample = '2x';
    osc.connect(filt);
    filt.connect(env);
    env.connect(softClip);
    softClip.connect(this.return_);
    const peak = Math.max(0, Math.min(0.6, level));
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.08);
    osc.start(now);
    return () => {
      const release = ctx.currentTime;
      try {
        env.gain.cancelScheduledValues(release);
        env.gain.setValueAtTime(env.gain.value, release);
        env.gain.linearRampToValueAtTime(0, release + 0.2);
      } catch { /* ok */ }
      setTimeout(() => {
        try { osc.stop(); osc.disconnect(); filt.disconnect(); env.disconnect(); softClip.disconnect(); } catch { /* ok */ }
      }, 300);
    };
  }

  /**
   * Cross-fed Stereo Doubler — inject a ~20ms delayed copy of the bus input
   * panned opposite with cross-feedback between the channels. Mono content
   * reads as wide stereo via Haas + comb-filter character. Classic dub
   * widening trick quoted by Dan D.N.A. in the Dub Scrolls.
   */
  startStereoDoubler(delayMs = 20, feedback = 0.3, wet = 0.6): () => void {
    if (!this.enabled) {
      console.warn('[DubBus] startStereoDoubler ignored — bus disabled');
      return () => {};
    }
    console.log(`[DubBus] stereoDoubler ▶ delay=${delayMs}ms fb=${feedback.toFixed(2)} wet=${wet.toFixed(2)}`);
    const ctx = this.context;
    const now = ctx.currentTime;
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const delayL = ctx.createDelay(0.1);
    const delayR = ctx.createDelay(0.1);
    delayL.delayTime.value = delayMs / 1000;
    delayR.delayTime.value = delayMs / 1000;
    const fbL = ctx.createGain(); fbL.gain.value = Math.max(0, Math.min(0.7, feedback));
    const fbR = ctx.createGain(); fbR.gain.value = Math.max(0, Math.min(0.7, feedback));
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0;
    // Topology:
    //   input → splitter →
    //     L → delayL → merger(R)   + fb to delayR
    //     R → delayR → merger(L)   + fb to delayL
    //   merger → wetGain → return_ (parallel, so dry stays intact)
    try {
      Tone.connect(this.input, splitter as unknown as Tone.InputNode);
    } catch { /* ok */ }
    splitter.connect(delayL, 0);
    splitter.connect(delayR, 1);
    delayL.connect(merger, 0, 1);
    delayR.connect(merger, 0, 0);
    delayL.connect(fbL); fbL.connect(delayR);
    delayR.connect(fbR); fbR.connect(delayL);
    merger.connect(wetGain);
    wetGain.connect(this.return_);
    wetGain.gain.setValueAtTime(0, now);
    wetGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, wet)), now + 0.1);
    return () => {
      const release = ctx.currentTime;
      try {
        wetGain.gain.cancelScheduledValues(release);
        wetGain.gain.setValueAtTime(wetGain.gain.value, release);
        wetGain.gain.linearRampToValueAtTime(0, release + 0.2);
      } catch { /* ok */ }
      setTimeout(() => {
        try { splitter.disconnect(); delayL.disconnect(); delayR.disconnect(); fbL.disconnect(); fbR.disconnect(); merger.disconnect(); wetGain.disconnect(); } catch { /* ok */ }
      }, 300);
    };
  }

  /**
   * Tubby Scream — route the spring return back into the spring input
   * through a sweepable bandpass, so the reverb drives itself into
   * self-oscillation at the band center. Sweeping the center from low to
   * high produces the signature "crying metal" scream that rises in pitch
   * while ramping up in amplitude. Release kills the feedback loop.
   */
  startTubbyScream(
    centerHz = 900,
    topHz = 2600,
    sweepSec = 3,
    feedbackAmount = 2.2,
  ): () => void {
    console.log(`[DubBusCtrl] startTubbyScream(center=${centerHz}Hz, top=${topHz}Hz, sweep=${sweepSec}s, fb=${feedbackAmount})`);
    if (!this.enabled) return () => {};
    const ctx = this.context;
    const now = ctx.currentTime;
    // Tap spring output → bandpass → gain → back into spring input.
    // Self-oscillation requires LOOP GAIN > 1.0 at resonance; with spring
    // dry/wet ~0.55 and unity bandpass, the tap MUST exceed 1.0 to build.
    // Cap at 1.8 — above that the loop saturates too hard and sounds
    // like harsh noise instead of the metallic cry.
    const tap = ctx.createGain();
    tap.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.max(100, centerHz);
    // Q=2.2 gives the metallic scream character without driving the filter
    // into numerical instability during connect+ramp. Q>=3 on a bandpass
    // inside a loop-gain>1 feedback path triggers Chromium's
    // "BiquadFilterNode: state is bad" coefficient-blowup detection on
    // every fire (poles sit too close to the unit circle).
    bp.Q.value = 2.2;
    // Cap at 2.5 — at spring dry/wet 0.55, the tap's output passes through
    // the spring at ~0.45× (dry only, since fb doesn't excite wet), so the
    // tap must exceed ~2.2 to build up self-oscillation from the noise seed.
    const fbAmt = Math.max(0, Math.min(2.5, feedbackAmount));
    // Hold the feedback at 0 for 30 ms after connect so the bandpass has
    // at least a few render quanta of clean signal to reach steady state
    // before the loop closes at gain > 1. Without this hold, the filter
    // state blows up in the first ~3 ms of the fire and Chromium resets
    // it to zero (audible click + warning).
    tap.gain.setValueAtTime(0, now);
    tap.gain.setValueAtTime(0, now + 0.03);
    tap.gain.linearRampToValueAtTime(fbAmt, now + 0.23);
    // Crank spring wet to 1.0 for the duration of SCREAM so the loop runs
    // through 100% wet spring (where the resonant ringing lives). Prior
    // value restored on dispose.
    const priorWet = this._springWetCache;
    this._setSpringWet(1.0);
    // Sweep center frequency over sweepSec — rising whine
    bp.frequency.cancelScheduledValues(now);
    bp.frequency.setValueAtTime(Math.max(100, centerHz), now);
    bp.frequency.exponentialRampToValueAtTime(Math.max(100, topHz), now + sweepSec);
    try {
      // Get spring output via Tone ref; connect to bandpass then back to spring input
      const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;
      Tone.connect(springOut, bp as unknown as Tone.InputNode);
      bp.connect(tap);
      Tone.connect(tap, this.spring.input as unknown as Tone.InputNode);
      console.log('[DubBus] tubbyScream ▶ wired spring→bp→tap→spring, fb=' + fbAmt.toFixed(2) + ' Q=' + bp.Q.value.toFixed(1));
    } catch (err) {
      console.warn('[DubBus] tubbyScream wire failed:', err);
      return () => {};
    }
    // Seed the feedback loop with a brief noise burst — without any signal
    // in the spring the loop has nothing to amplify even with gain > 1.0
    // (digital silence stays zero). 20ms filtered-noise kick gets the
    // self-oscillation going.
    try {
      const seedBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.008), ctx.sampleRate);
      const seedData = seedBuf.getChannelData(0);
      // Decaying noise burst — quieter over time so the initial "tick"
      // is softer; loop will amplify it once running.
      for (let i = 0; i < seedData.length; i++) {
        const env = Math.exp(-i / (seedData.length * 0.4));
        seedData[i] = (Math.random() * 2 - 1) * env * 0.2;
      }
      const seedSrc = ctx.createBufferSource();
      seedSrc.buffer = seedBuf;
      const seedGain = ctx.createGain();
      seedGain.gain.value = 0.15;
      seedSrc.connect(seedGain);
      Tone.connect(seedGain, this.spring.input as unknown as Tone.InputNode);
      seedSrc.start(now);
      seedSrc.stop(now + 0.04);
      seedSrc.onended = () => { try { seedGain.disconnect(); } catch { /* ok */ } };
    } catch { /* ok */ }
    return () => {
      const release = ctx.currentTime;
      try {
        tap.gain.cancelScheduledValues(release);
        tap.gain.setValueAtTime(tap.gain.value, release);
        tap.gain.linearRampToValueAtTime(0, release + 0.2);
      } catch { /* ok */ }
      // Restore spring wet to the user's prior setting.
      try { this._setSpringWet(priorWet); } catch { /* ok */ }
      // Disconnect after ramp completes
      setTimeout(() => {
        try { bp.disconnect(); tap.disconnect(); } catch { /* ok */ }
      }, 300);
    };
  }

  /**
   * Reverb→Delay order swap. When `reverseOrder` is true, the chain runs
   * spring → echo instead of the default echo → spring. Research: "reverb
   * then delay = whole room repeated" — delay AFTER reverb captures the
   * reverberant space and echoes THAT, producing a distinct geometry from
   * the conventional delay-into-reverb which just adds reverb to echoed
   * taps.
   *
   * Live-switchable: mute → disconnect → reconnect → unmute. Web Audio
   * topology changes settle at the next processing quantum (~3 ms at
   * 44.1 kHz), so a straight disconnect → connect left BOTH routings
   * (echo→spring AND spring→echo) momentarily live. With high echo
   * feedback + high spring Q that's enough to spark audible
   * self-oscillation before the new topology takes over. Muting
   * return_.gain across the splice eliminates the feedback path —
   * total dip is ~50 ms of wet bus, well within dub tolerance.
   */
  setChainOrder(order: 'echoSpring' | 'springEcho' | 'parallel'): void {
    console.log(`[DubBusCtrl] setChainOrder(${order})`);
    if (order === this._chainOrder) return;
    this._snap(`pre-setChainOrder(${order})`);

    const ctx = this.context;
    const priorReturnGain = this.return_.gain.value;
    const priorInputGain = this.input.gain.value;
    const priorFeedbackGain = this.feedback.gain.value;
    const RAMP_SEC = 0.02;
    const SWAP_DELAY_MS = RAMP_SEC * 1000 + 5;
    const version = ++this._routingVersion;

    // Full quiesce: mute return + input + feedback to prevent transients
    try {
      const now = ctx.currentTime;
      this.return_.gain.cancelScheduledValues(now);
      this.return_.gain.setValueAtTime(priorReturnGain, now);
      this.return_.gain.linearRampToValueAtTime(0, now + RAMP_SEC);

      this.input.gain.cancelScheduledValues(now);
      this.input.gain.setValueAtTime(priorInputGain, now);
      this.input.gain.linearRampToValueAtTime(0, now + RAMP_SEC);

      this.feedback.gain.cancelScheduledValues(now);
      this.feedback.gain.setValueAtTime(priorFeedbackGain, now);
      this.feedback.gain.linearRampToValueAtTime(0, now + RAMP_SEC);
    } catch { /* ok */ }

    setTimeout(() => {
      // Race guard: if another setChainOrder was called, abandon this one
      if (this._routingVersion !== version) return;
      try {
        this._disconnectCoreRouting();
        this._applyCoreRouting(order);
      } catch (err) {
        console.warn('[DubBus] setChainOrder swap failed:', err);
      }
      // Ramp back regardless
      try {
        const now2 = ctx.currentTime;
        this.return_.gain.cancelScheduledValues(now2);
        this.return_.gain.setValueAtTime(0, now2);
        this.return_.gain.linearRampToValueAtTime(priorReturnGain, now2 + RAMP_SEC);

        this.input.gain.cancelScheduledValues(now2);
        this.input.gain.setValueAtTime(0, now2);
        this.input.gain.linearRampToValueAtTime(priorInputGain, now2 + RAMP_SEC);

        this.feedback.gain.cancelScheduledValues(now2);
        this.feedback.gain.setValueAtTime(0, now2);
        this.feedback.gain.linearRampToValueAtTime(priorFeedbackGain, now2 + RAMP_SEC);
      } catch { /* ok */ }
    }, SWAP_DELAY_MS);
  }

  /**
   * JA Press vinyl degradation level. `level10` is 0-10; 0 = clean, 10 =
   * gutter-scraped Jamaican 7". Drives every stage of the vinyl chain:
   *   - Wow LFO depth (pitch drift from warped groove)
   *   - Rumble boost (sub-bass tonearm vibration)
   *   - HF roll-off (worn stylus + compressed 7" mastering)
   *   - Surface noise (constant pink hiss)
   *   - Random click/pop generator (stochastic impulses)
   *   - L/R balance drift (off-center groove)
   *
   * All params scale non-linearly (cubed) so levels 1-3 are SUBTLE wear
   * and 7-10 is SEVERE shit pressing. Live-updatable; 20 ms smoothing.
   */
  setVinylLevel(level10: number): void {
    const l = Math.max(0, Math.min(10, level10));
    this.vinylLevel = l / 10;
    const lin = this.vinylLevel;
    const sq = lin * lin;
    const cubed = lin * lin * lin;
    // ToneArm physics — turntable motion + cartridge physics.
    const ta = this.toneArmEffect;
    if (ta) {
      try {
        ta.setWow(0.7 * sq);       // slow pitch wobble (one per rotation)
        ta.setCoil(0.35 * lin);    // cartridge Faraday induction distortion
        ta.setFlutter(0.55 * sq);  // fast AM wobble
        ta.setRiaa(0.3 * lin);     // RIAA curve blend
        ta.setStylus(0.6 * sq);    // HF rolloff from worn needle
        ta.setHiss(0.25 * lin);    // baseline surface hiss
        ta.setPops(0.9 * cubed);   // CLICK/POP density — main "dirty record" character
        ta.wet = l === 0 ? 0 : 1;
      } catch { /* ok */ }
    }
    // VinylNoise — additional surface defects layered on top.
    const vn = this.vinylEffect;
    if (vn) {
      try {
        vn.setDust(0.95 * sq);           // big clicks + crackles
        vn.setAge(0.8 * cubed);          // cumulative groove damage
        vn.setWornStylus(0.4 * sq);      // HF smear (avoid doubling w/ToneArm stylus)
        vn.setPinch(0.3 * lin);          // even-harmonic distortion
        vn.setInnerGroove(0.5 * sq);     // asymmetric waveshaping
        vn.setGhostEcho(0.4 * cubed);    // BPF pre-echo (groove pre-print)
        vn.setDropout(0.6 * cubed);      // random amplitude dips
        vn.setWarp(0.4 * sq);            // multi-LFO pitch wobble
        vn.setEccentricity(0.5 * sq);    // rotation-rate drift
        vn.setStylusResonance(0.25 * lin);
        vn.setHiss(0);                    // ToneArm handles hiss, avoid doubling
        vn.setRiaa(0);                    // ditto
        vn.wet = l === 0 ? 0 : 1;
        vn.setPlaying(l > 0);
      } catch { /* ok */ }
    }
  }

  /** Enable/disable the chorus-on-master finisher. Ramps over 200 ms. */
  setMasterChorus(on: boolean): void {
    if (!this.masterChorusWet) return;
    const now = this.context.currentTime;
    try {
      this.masterChorusWet.gain.cancelScheduledValues(now);
      this.masterChorusWet.gain.setValueAtTime(this.masterChorusWet.gain.value, now);
      this.masterChorusWet.gain.linearRampToValueAtTime(on ? 0.45 : 0, now + 0.2);
    } catch { /* ok */ }
  }

  /** Enable/disable the Club Simulator convolver. Lazy-allocates the IR
   *  on first enable — a procedurally-generated small-club impulse with
   *  ~350 ms decay and some high-frequency roll-off to mimic a PA-in-room
   *  response. */
  setClubSim(on: boolean): void {
    if (!this.masterConvolverWet) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    if (on && !this.masterConvolver) {
      try {
        this.masterConvolver = ctx.createConvolver();
        // Generate a 350ms IR with exponential decay + stereo decorrelation.
        const len = Math.round(ctx.sampleRate * 0.35);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const ch = buf.getChannelData(c);
          for (let i = 0; i < len; i++) {
            const tau = len * 0.22;
            const env = Math.exp(-i / tau);
            // Low-pass noise — duplicate last sample weighted for rolling avg
            const noise = (Math.random() * 2 - 1) * env;
            ch[i] = i > 0 ? ch[i - 1] * 0.6 + noise * 0.4 : noise;
          }
        }
        this.masterConvolver.buffer = buf;
        this.masterConvolver.normalize = true;
        this.masterConvolverDry.connect(this.masterConvolver);
        this.masterConvolver.connect(this.masterConvolverWet);
      } catch (err) {
        console.warn('[DubBus] club-sim convolver init failed:', err);
        return;
      }
    }
    try {
      this.masterConvolverWet.gain.cancelScheduledValues(now);
      this.masterConvolverWet.gain.setValueAtTime(this.masterConvolverWet.gain.value, now);
      this.masterConvolverWet.gain.linearRampToValueAtTime(on ? 0.55 : 0, now + 0.3);
    } catch { /* ok */ }
  }

  /**
   * Sweep the master-insert LPF down to `targetHz` over `downSec`, hold for
   * `holdSec`, then open back to 18 kHz (bypass). Used by transportTapeStop
   * to mask LibOpenMPT's resampler aliasing at extreme slowdown — high
   * frequencies that would read as "bit-crush" get rolled off the master
   * output during the wind-down.
   */
  sweepMasterLpf(targetHz = 400, downSec = 0.8, holdSec = 0.2): void {
    if (!this.masterLpf) return;
    const now = this.context.currentTime;
    const f = this.masterLpf.frequency;
    try {
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.value, now);
      f.exponentialRampToValueAtTime(Math.max(100, targetHz), now + downSec);
    } catch { /* ok */ }
    const restore = setTimeout(() => {
      this.throwTimers.delete(restore);
      try {
        const t = this.context.currentTime;
        f.cancelScheduledValues(t);
        f.setValueAtTime(f.value, t);
        f.exponentialRampToValueAtTime(18000, t + 0.35);
      } catch { /* ok */ }
    }, (downSec + holdSec) * 1000);
    this.throwTimers.add(restore);
  }

  tapeStop(downSec = 0.6, holdSec = 0.15): void {
    if (!this.enabled) return;
    const now = this.context.currentTime;
    const baselineReturn = this.settings.returnGain;
    const baselineRate = this.settings.echoRateMs;
    try {
      // LPF sweep down
      const f = this.lpf.frequency;
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.value, now);
      f.exponentialRampToValueAtTime(100, now + downSec);
      // Echo rate ramp up — stepped calls so setRate's internal ramps stack
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const v = baselineRate + (baselineRate * 1.5) * (i / steps);
        const t = setTimeout(() => {
          this.throwTimers.delete(t);
          try { this.echo.setRate(Math.min(1500, v)); } catch { /* ok */ }
        }, (downSec * 1000) * (i / steps));
        this.throwTimers.add(t);
      }
      // Return gain to 0 in the final 15% — the muffled drop-off
      const rg = this.return_.gain;
      rg.cancelScheduledValues(now);
      rg.setValueAtTime(rg.value, now);
      rg.linearRampToValueAtTime(rg.value, now + downSec * 0.85);
      rg.linearRampToValueAtTime(0, now + downSec);
    } catch { /* ok */ }

    // Restore after hold window
    const restoreAt = setTimeout(() => {
      this.throwTimers.delete(restoreAt);
      if (this._disposed) return;
      const t2 = this.context.currentTime;
      try {
        const f = this.lpf.frequency;
        f.cancelScheduledValues(t2);
        f.setValueAtTime(f.value, t2);
        f.exponentialRampToValueAtTime(20000, t2 + 0.15);
        this.echo.setRate(baselineRate);
        const rg = this.return_.gain;
        rg.cancelScheduledValues(t2);
        rg.setValueAtTime(rg.value, t2);
        rg.linearRampToValueAtTime(this.enabled ? baselineReturn : 0, t2 + 0.08);
      } catch { /* ok */ }
    }, (downSec + holdSec) * 1000);
    this.throwTimers.add(restoreAt);
  }

  /**
   * Fire a short white-noise burst straight into the bus input. Shaped by a
   * fast attack-decay envelope so it reads as a "crack" not a "shhh". The
   * burst inherits whatever processing the bus currently has — spring
   * reverb catches the tail and adds the classic metal-tank ping that
   * makes snare/hihat accents come alive in dub.
   *
   * @param durationMs  Total duration of the noise burst (default 40ms)
   * @param level       Peak gain 0..1 (default 0.6)
   */
  fireNoiseBurst(durationMs = 80, level = 1.0): void {
    if (!this.enabled) return;
    // SID mode: noise burst
    if (this._sidMode && this._sidSynths?.isReady) {
      this._sidSynths.fireSnare(durationMs);
      return;
    }
    try {
      const ctx = this.context;
      const sr = ctx.sampleRate;
      const frames = Math.ceil((durationMs + 30) * sr / 1000);
      const buf = ctx.createBuffer(1, frames, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // Bandpass filter @ 3.5 kHz with low Q so it covers 2-6 kHz — that's
      // where snare snap + stick-attack energy lives. Makes the burst read
      // as a real snare crack rather than broadband hiss.
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3500;
      bp.Q.value = 0.7;
      // Highpass on top to kill any low-end rumble leaking through
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500;
      hp.Q.value = 0.5;
      src.connect(bp);
      bp.connect(hp);
      // Envelope — 1ms attack, fast exp decay
      const env = ctx.createGain();
      env.gain.value = 0;
      hp.connect(env);
      const peak = Math.min(1.5, Math.max(0, level));
      const now = ctx.currentTime;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + 0.001);
      env.gain.setTargetAtTime(0, now + 0.001, durationMs / 3000);
      // Path 1: bus input — echo/spring tail the crack
      const toInput = ctx.createGain();
      toInput.gain.value = 0.8;
      env.connect(toInput);
      toInput.connect(this.input);
      // Path 2: direct to return — guaranteed loud snap even if bus is damped
      const toReturn = ctx.createGain();
      toReturn.gain.value = 1.0;
      env.connect(toReturn);
      toReturn.connect(this.return_);
      src.start(now);
      src.stop(now + durationMs / 1000 + 0.03);
      src.onended = () => {
        try { bp.disconnect(); hp.disconnect(); env.disconnect(); toInput.disconnect(); toReturn.disconnect(); } catch { /* ok */ }
      };
    } catch { /* best-effort */ }
  }

  startTapeWobble(depthMs = 30, rateHz = 2.5): () => void {
    if (!this.enabled) return () => {};
    const baseline = this.settings.echoRateMs;
    const period = 1000 / Math.max(0.05, rateHz);
    const stepMs = Math.max(16, period / 16);  // 16 steps per cycle, ≥16ms
    let phase = 0;
    const handle = setInterval(() => {
      phase += stepMs / period;
      const rate = baseline + Math.sin(phase * Math.PI * 2) * depthMs;
      try { this.echo.setRate(Math.max(20, rate)); } catch { /* ok */ }
    }, stepMs);
    this.wobbleHandles.add(handle);
    return () => {
      clearInterval(handle);
      this.wobbleHandles.delete(handle);
      try { this.echo.setRate(baseline); } catch { /* ok */ }
    };
  }

  /** Dispose and release all bus resources. */
  dispose(): void {
    this._disposed = true;
    if (_activeDubBus === this) _activeDubBus = null;
    // Detach from any mixer the bus was pulling deck taps from.
    this.detachDJMixer();
    for (const tap of this.deckTaps.values()) {
      try { tap.disconnect(); } catch { /* already disconnected */ }
    }
    this.deckTaps.clear();
    // Channel taps are owned by ChannelEffectsManager — just clear our registry.
    // The actual Tone.Gain nodes are disposed by ChannelEffectsManager.disposeAll().
    this.channelTaps.clear();
    // Deck-channel taps are OWNED by the bus (we created the busGain).
    // Tear down every entry: disconnect the source side, disconnect the
    // bus gain, clear the map.
    for (const entry of this.deckChannelTaps.values()) {
      try { entry.disposeSource(); } catch { /* ok */ }
      try { entry.busGain.disconnect(); } catch { /* ok */ }
    }
    this.deckChannelTaps.clear();
    // Cancel any in-flight dub action releasers + pending throw timers before
    // tearing nodes down — otherwise late-firing timers try to cancelScheduledValues
    // on disposed AudioParams and spam the console with errors.
    for (const h of this.wobbleHandles) clearInterval(h);
    this.wobbleHandles.clear();
    // Tear down the reverse-capture tap + its silencer if they were allocated
    try { this.reverseCapture?.disconnect(); } catch { /* ok */ }
    try { this.reverseCaptureSilencer?.disconnect(); } catch { /* ok */ }
    this.reverseCapture = null;
    this.reverseCaptureSilencer = null;
    for (const t of this.throwTimers) clearTimeout(t);
    this.throwTimers.clear();
    clearAllPendingThrows();
    this.actionReleasers.clear();
    // Stop the pink noise source first so it doesn't keep the graph alive.
    try { this.noise.stop(); } catch { /* may already be stopped */ }
    try { this.noise.disconnect(); } catch { /* ok */ }
    try { this.noiseGain.disconnect(); } catch { /* ok */ }
    try { this.input.disconnect(); } catch { /* already disconnected */ }
    try { this.hpf.disconnect(); } catch { /* ok */ }
    try { this.tapeSat.disconnect(); } catch { /* ok */ }
    try { this.feedback.disconnect(); } catch { /* ok */ }
    try { this.sidechain.disconnect(); } catch { /* ok */ }
    try { this.glue.disconnect(); } catch { /* ok */ }
    try { this.lpf.disconnect(); } catch { /* ok */ }
    try { this.return_.disconnect(); } catch { /* ok */ }
    try { this.extFeedbackDelay.disconnect(); } catch { /* ok */ }
    try { this.clubConvolver.disconnect(); } catch { /* ok */ }
    try { this.spring.dispose(); } catch { /* ok */ }
    try { this.echo.dispose(); } catch { /* ok */ }
    this._teardownPlateStage();
    this.stopEQSweep();
    try { this.returnEQ.dispose(); } catch { /* ok */ }
    try { this.phaser.dispose(); } catch { /* ok */ }
    try { this.ringMod.dispose(); } catch { /* ok */ }
    try { this.lofi.dispose(); } catch { /* ok */ }
    // SID dub synths
    if (this._sidSynths) {
      this._sidSynths.dispose();
      this._sidSynths = null;
    }
  }
}
