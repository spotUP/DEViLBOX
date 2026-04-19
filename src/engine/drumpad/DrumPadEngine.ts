/**
 * DrumPadEngine - Audio playback engine for drum pads
 * Handles sample triggering with velocity, ADSR, filtering, and routing.
 * Supports per-pad effects chains (SpringReverb, SpaceEcho, TapeSaturation, etc.)
 * using Tone.js effect nodes connected inline with Web Audio routing.
 */

import * as Tone from 'tone';
import type { DrumPad, DubBusSettings } from '../../types/drumpad';
import { DEFAULT_DUB_BUS } from '../../types/drumpad';
import { createEffectChain } from '../factories/EffectFactory';
import { SpringReverbEffect } from '../effects/SpringReverbEffect';
import { SpaceEchoEffect } from '../effects/SpaceEchoEffect';
import { getNativeAudioNode } from '@utils/audio-context';
import type { DJMixerEngine } from '../dj/DJMixerEngine';
import type { DeckId } from '../dj/DeckEngine';
import { clearAllPendingThrows } from './DubActions';

const DECK_IDS: DeckId[] = ['A', 'B', 'C'];

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

interface VoiceState {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  filterNode: BiquadFilterNode | null;
  panNode: StereoPannerNode;
  // Per-voice dub send (null when pad.dubSend === 0). Held here so
  // cleanupVoice can disconnect it — otherwise we leak orphan GainNodes
  // connected to dubBusInput on every trigger and rely on GC to reclaim,
  // which under long sessions builds up audible CPU overhead.
  dubSendNode: GainNode | null;
  startTime: number;
  noteOffTime: number | null;
  velocity: number;
}

interface PadEffectsChain {
  inputGain: GainNode;
  effects: { disconnect(): void; dispose(): void }[];
  outputGain: GainNode;
  configHash: string; // detect when effects config changes
}

export class DrumPadEngine {
  private static readonly MAX_VOICES = 32; // Polyphony limit

  private context: AudioContext;
  private masterGain: GainNode;
  private voices: Map<number, VoiceState> = new Map();
  private outputs: Map<string, GainNode> = new Map();
  private muteGroups: Map<number, number> = new Map(); // padId -> muteGroup
  private reversedBufferCache: WeakMap<AudioBuffer, AudioBuffer> = new WeakMap();
  private pendingCleanupTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private padEffects: Map<number, PadEffectsChain> = new Map();
  private _disposed = false;
  private _miniDrainPending = false;

  // ─── Shared Dub Bus — Vintage King Tubby / Scientist chain ─────────────────
  // Sources fanning into `dubBusInput`:
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
  //                 → LPF(filter drop sweeps) → return → masterGain
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
  private dubBusInput: GainNode;
  private dubBusHPF: BiquadFilterNode;
  private dubBusTapeSat: WaveShaperNode;    // asymmetric tanh — MCI board bite
  private dubBusSpring: SpringReverbEffect;
  private dubBusEcho: SpaceEchoEffect;
  private dubBusSidechain: DynamicsCompressorNode;  // fast (pumping)
  private dubBusGlue: DynamicsCompressorNode;       // slow (dubplate glue)
  private dubBusLPF: BiquadFilterNode;      // sweep-able LPF on return
  private dubBusReturn: GainNode;
  private dubBusFeedback: GainNode;         // echo → feedback → input (siren)
  private dubBusNoise: AudioBufferSourceNode;  // pink noise loop
  private dubBusNoiseGain: GainNode;           // -55 dBFS level
  private dubBusEnabled = DEFAULT_DUB_BUS.enabled;
  private dubBusSettings: DubBusSettings = { ...DEFAULT_DUB_BUS };

  // DJ deck taps — each is a GainNode with gain=0 at rest. When attached to a
  // DJ mixer, the mixer's deck input connects INTO these, which feed the bus.
  // Dub-action pads raise these gains to spill deck audio into the bus.
  private dubDeckTaps: Map<DeckId, GainNode> = new Map();
  private attachedMixer: DJMixerEngine | null = null;
  // Track mixer→tap connections so we can cleanly detach if the mixer changes.
  private mixerTapConnections: Array<{ nativeFrom: AudioNode; to: GainNode }> = [];
  // In-flight dub-action releasers, keyed so releasing the same action re-uses
  // (e.g. pressing the same throw pad while the prior one is decaying).
  private dubActionReleasers: Map<string, () => void> = new Map();
  // Timers scheduled by throwDeck that will fire their releaser after the
  // hold window expires. Held here so dispose() can clear them — otherwise
  // a timer that fires post-dispose tries to write to torn-down AudioParams.
  private dubThrowTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  // When true, setDubBusSettings suppresses writes to echoIntensity and
  // springWet on the live nodes. Set by `dubPanic` while draining the echo
  // / spring buffers; cleared by the restore timer after the drain window.
  // Required because the store's mirror effect writes the user-configured
  // values back on any dubBus change during the drain, which would override
  // panic's `setIntensity(0)` and leave a loud echo ghost when the user
  // re-enables the bus (audible at high intensity settings — ~-13 dB of
  // the pre-panic tail at default intensity=0.62 after 1 s).
  private _draining = false;
  // Once-per-engine warning latches so we don't flood the console during a
  // live set if the bus is disabled or the mixer isn't attached. Reset when
  // the condition clears (attach succeeds / bus gets enabled).
  private _warnedBusDisabled = false;
  private _warnedNoMixer = false;

  constructor(context: AudioContext, outputDestination?: AudioNode) {
    this.context = context;

    // Create master output — route to custom destination or default to context.destination.
    // Default gain is -6 dB (0.5): the DJ deck path auto-normalizes to
    // TARGET_RMS_DB = -14, while drumpad pads ship at native peak levels
    // (most oneshot presets at -4 dBFS). Without this cut, pad hits sat
    // ~10 dB above the deck bed and blew the PA. User can push it back up
    // at will — there's no separate master volume UI for the drumpad bus
    // yet, so a conservative default is the safer place to land.
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.25;
    this.masterGain.connect(outputDestination ?? this.context.destination);

    // Create separate output buses
    this.outputs.set('stereo', this.masterGain);
    ['out1', 'out2', 'out3', 'out4'].forEach(bus => {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.outputs.set(bus, gain);
    });

    // Build the shared Dub Bus: dubBusInput → HPF → Spring → Echo → Sidechain → return → masterGain
    // The return gain is gated by dubBusEnabled — when disabled, return.gain = 0
    // so sends have zero effect (no audible bus output, but graph stays wired).
    this.dubBusInput = this.context.createGain();
    this.dubBusInput.gain.value = 1;

    this.dubBusHPF = this.context.createBiquadFilter();
    this.dubBusHPF.type = 'highpass';
    this.dubBusHPF.frequency.value = this.dubBusSettings.hpfCutoff;
    this.dubBusHPF.Q.value = 0.707;

    // Tape saturation — asymmetric tanh curve that models the positive/negative
    // asymmetry of transformer-coupled magnetic tape. Softens positive peaks
    // more than negative, which is what gives RE-201 / Studer saturation its
    // distinctive warmth (not the razor-edge of digital clipping). Sits before
    // the echo so the crunch gets chopped up into repeats, not smeared over
    // the whole tail.
    this.dubBusTapeSat = this.context.createWaveShaper();
    this.dubBusTapeSat.curve = makeTapeSatCurve(0.35);
    this.dubBusTapeSat.oversample = '2x';

    // Spring reverb — tightened diffusion from 0.7 → 0.4 for a more
    // pronounced single-slap character (less "cathedral", more "metal tank").
    // That's what gives King Tubby's recordings their snappy springiness.
    this.dubBusSpring = new SpringReverbEffect({
      decay: 0.6, damping: 0.45, tension: 0.55, mix: 0.55, drip: 0.7, diffusion: 0.4,
      wet: this.dubBusSettings.springWet,
    });

    this.dubBusEcho = new SpaceEchoEffect({
      mode: 4,                              // tape heads + built-in spring
      rate: this.dubBusSettings.echoRateMs,
      intensity: this.dubBusSettings.echoIntensity,
      echoVolume: 0.7,
      reverbVolume: 0.3,
      bass: 2,                              // gentle warmth
      treble: -2,                           // tame fizz on the tail
      wow: 0.35,                            // seasick tape flutter — Perry dial
      wet: this.dubBusSettings.echoWet,
    });

    // Sidechain pumping — fast: catches transients, makes the tail breathe
    // under the drums. Not a true kick-keyed sidechain (would need per-pad
    // routing) but the fast-attack/release compression produces the same
    // "duck on every hit" feel.
    this.dubBusSidechain = this.context.createDynamicsCompressor();
    this.dubBusSidechain.threshold.value = -28;
    this.dubBusSidechain.ratio.value = 6;
    this.dubBusSidechain.attack.value = 0.002;
    this.dubBusSidechain.release.value = 0.18;
    this.dubBusSidechain.knee.value = 6;

    // Glue compressor — slow: models the compression character of cutting
    // a dub straight to acetate lathe. Soft attack (30ms) lets transients
    // through but then settles gently; long release (300ms) welds the whole
    // tail into one coherent sustained thing instead of a pile of effects.
    // This is the "finished dub record" texture that modern digital chains
    // miss when they stop at the pumping compressor.
    this.dubBusGlue = this.context.createDynamicsCompressor();
    this.dubBusGlue.threshold.value = -14;
    this.dubBusGlue.ratio.value = 3;
    this.dubBusGlue.attack.value = 0.030;
    this.dubBusGlue.release.value = 0.300;
    this.dubBusGlue.knee.value = 8;

    // Sweepable LPF on the return — drops dub into "underwater" muffle.
    // Open position (~20 kHz) is effectively transparent.
    this.dubBusLPF = this.context.createBiquadFilter();
    this.dubBusLPF.type = 'lowpass';
    this.dubBusLPF.frequency.value = 20000;
    this.dubBusLPF.Q.value = 0.707;

    this.dubBusReturn = this.context.createGain();
    this.dubBusReturn.gain.value = this.dubBusEnabled ? this.dubBusSettings.returnGain : 0;

    // Feedback loop for siren self-oscillation. At rest gain=0 → no loop.
    // When raised toward 0.9+, the echo's output recirculates into the input
    // and climbs until hitting the tank/tape saturation ceiling — that's the
    // classic King Tubby siren/wobble. Capped internally at 0.95 to avoid
    // runaway blowups regardless of settings.
    this.dubBusFeedback = this.context.createGain();
    this.dubBusFeedback.gain.value = 0;

    // Pink noise floor — ~-55 dBFS continuous noise that you don't notice
    // during normal play, but becomes audible during mute-and-dub drops as
    // the "tape hiss" texture of vintage dub records. Two-second loop buffer
    // is enough to avoid obvious periodicity at this level.
    const noiseBuffer = makePinkNoiseBuffer(this.context, 2);
    this.dubBusNoise = this.context.createBufferSource();
    this.dubBusNoise.buffer = noiseBuffer;
    this.dubBusNoise.loop = true;
    this.dubBusNoiseGain = this.context.createGain();
    // **Gig fix (2026-04-18):** previously the pink-noise floor ramped up to
    // -55 dBFS whenever the bus was enabled, to simulate vintage tape hiss.
    // At -55 dBFS plus the bus return gain + echo intensity + spring reverb
    // feedback, the hiss compounded into audible white noise whenever the
    // user opened the drumpad view with a persisted bus-enabled state.
    // Keeping the node plumbed in case we ever reintroduce a user-facing
    // "tape hiss" knob, but gain is clamped to 0 at construction AND at
    // every enable toggle below.
    this.dubBusNoiseGain.gain.value = 0;

    // Wire the vintage Tubby/Scientist chain:
    //   input → HPF → TapeSat → Echo → Spring
    //                           │
    //                      feedback ← echoOut
    //
    //   Spring.output → Sidechain → Glue → LPF → return → masterGain
    this.dubBusInput.connect(this.dubBusHPF);
    this.dubBusHPF.connect(this.dubBusTapeSat);
    Tone.connect(this.dubBusTapeSat, this.dubBusEcho as unknown as Tone.InputNode);
    this.dubBusEcho.connect(this.dubBusSpring);
    // Feedback regen: tap echo output (before spring) back into input.
    // Pre-spring means the siren rings without flooding the spring with
    // runaway self-oscillation.
    const echoOut = (this.dubBusEcho as unknown as { output: Tone.ToneAudioNode }).output;
    Tone.connect(echoOut, this.dubBusFeedback as unknown as Tone.InputNode);
    this.dubBusFeedback.connect(this.dubBusInput);
    // Post-spring output chain
    const springOut = (this.dubBusSpring as unknown as { output: Tone.ToneAudioNode }).output;
    Tone.connect(springOut, this.dubBusSidechain as unknown as Tone.InputNode);
    this.dubBusSidechain.connect(this.dubBusGlue);
    this.dubBusGlue.connect(this.dubBusLPF);
    this.dubBusLPF.connect(this.dubBusReturn);
    this.dubBusReturn.connect(this.masterGain);
    // Noise source into input — runs always; masked by the return gain going
    // to zero when the bus is disabled.
    this.dubBusNoise.connect(this.dubBusNoiseGain);
    this.dubBusNoiseGain.connect(this.dubBusInput);
    this.dubBusNoise.start(0);

    // Create per-deck tap gains. Always exist so dub-action handlers can
    // modulate them without null checks; only feed audio when a DJ mixer is
    // attached via attachDJMixer(). At rest gain=0 so bus hears nothing from
    // the decks until a dub-action pad opens the tap.
    for (const deck of DECK_IDS) {
      const tap = this.context.createGain();
      tap.gain.value = 0;
      tap.connect(this.dubBusInput);
      this.dubDeckTaps.set(deck, tap);
    }
  }

  /**
   * Attach a DJ mixer so dub-action pads can pull deck audio into the bus.
   * Connects each deck's pre-crossfader tap into this engine's deck-tap gain
   * node. Tap gains stay at 0 — action handlers open them on demand.
   *
   * Safe to call after engine construction; can be called again to switch
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
      const engineTap = this.dubDeckTaps.get(deck);
      if (!mixerTap || !engineTap) continue;
      try {
        // Bridge Tone.Gain → raw GainNode via native node. Store the native
        // ref (not the Tone wrapper) so detachDJMixer can disconnect using
        // the same node identity — re-unwrapping the wrapper on detach risks
        // returning a different internal node and silently leaking the tap.
        const native = getNativeAudioNode(mixerTap as unknown as Tone.ToneAudioNode);
        if (!native) {
          console.warn(`[DrumPadEngine] attachDJMixer deck ${deck}: could not unwrap mixer tap to native node`);
          continue;
        }
        native.connect(engineTap);
        this.mixerTapConnections.push({ nativeFrom: native, to: engineTap });
        connectedCount++;
      } catch (err) {
        console.warn(`[DrumPadEngine] attachDJMixer: deck ${deck} tap connect failed:`, err);
      }
    }
    // ALSO reroute the engine's master output through mixer.samplerInput so
    // that MIDI-triggered pad audio lands in the DJ master chain (master FX
    // + limiter). Otherwise the singleton engine used by useMIDIPadRouting
    // writes directly to ctx.destination, bypassing the DJ mix — that made
    // dub throws via MIDI sound totally different from touch-triggered ones.
    try {
      this.rerouteOutput(mixer.samplerInput);
    } catch (err) {
      console.warn('[DrumPadEngine] attachDJMixer: reroute to samplerInput failed:', err);
    }
    console.log(`[DrumPadEngine] attachDJMixer: ${connectedCount}/${DECK_IDS.length} deck taps connected, busEnabled=${this.dubBusEnabled}, output→mixer.samplerInput`);
  }

  /** Tear down the deck-tap connections to the attached mixer. */
  detachDJMixer(): void {
    for (const { nativeFrom, to } of this.mixerTapConnections) {
      try { nativeFrom.disconnect(to); } catch { /* already gone */ }
    }
    this.mixerTapConnections = [];
    this.attachedMixer = null;
    // Restore default output routing so pads still make sound when the DJ
    // view isn't active. Caller that owns the destination (DJSamplerPanel)
    // should reroute explicitly after detaching if needed.
    try { this.rerouteOutput(this.context.destination); } catch { /* ok */ }
  }

  // ─── Dub Action API ────────────────────────────────────────────────────────
  // High-level operations driven by pad actions. All ramps use `setTargetAtTime`
  // with short time-constants so closures are click-free and composable.
  //
  // Every action returns a releaser. The engine also keeps an internal registry
  // of in-flight releasers keyed by action; pressing the same action while one
  // is already fading cancels the prior fade and starts fresh.

  private _scheduleExclusiveRelease(key: string, release: () => void): () => void {
    // Call any prior releaser for this action key, then register the new one.
    const prior = this.dubActionReleasers.get(key);
    if (prior) prior();
    this.dubActionReleasers.set(key, release);
    return () => {
      if (this.dubActionReleasers.get(key) === release) {
        this.dubActionReleasers.delete(key);
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
  private _miniDrainIfIdle(): void {
    if (this._draining) return;
    if (!this.dubBusEnabled) return;
    if (this.dubActionReleasers.size > 0) return;
    // Don't stack mini-drains — if one's already pending, let it finish.
    if (this._miniDrainPending) return;
    this._miniDrainPending = true;
    const settings = this.dubBusSettings;
    try {
      this.dubBusEcho.setIntensityInstant(0);
      this.dubBusSpring.wet = 0;
      console.log('[DubBus] mini-drain ▶ last releaser fired, zeroed echo+spring');
    } catch { /* ok */ }
    const t = setTimeout(() => {
      this.dubThrowTimers.delete(t);
      this._miniDrainPending = false;
      if (this._disposed) return;
      // Abort the restore if panic fired during our quiet window — panic's
      // own 2 s drain now owns the state, don't fight it.
      if (this._draining) return;
      // A new dub pad may have already engaged during the quiet window,
      // in which case the user's settings are already back in force. Only
      // restore if we're still the only reason echo/spring are muted.
      if (this.dubActionReleasers.size > 0) return;
      try {
        this.dubBusEcho.setIntensity(settings.echoIntensity);
        this.dubBusSpring.wet = settings.springWet;
        console.log(`[DubBus] mini-drain ◀ restored echoIntensity=${settings.echoIntensity.toFixed(2)} springWet=${settings.springWet.toFixed(2)}`);
      } catch { /* ok */ }
    }, 180);
    this.dubThrowTimers.add(t);
  }

  /**
   * Open a deck tap to `amount` immediately (short ramp for click-safety),
   * hold until the returned releaser is called, then fade to 0 over
   * `releaseSec`. If the bus is disabled, returns a no-op releaser.
   */
  openDeckTap(deck: DeckId | 'ALL', amount = 1.0, attackSec = 0.005, releaseSec = 0.08): () => void {
    if (!this.dubBusEnabled) {
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
      const g = this.dubDeckTaps.get(d)?.gain;
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
        const g = this.dubDeckTaps.get(d)?.gain;
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
    if (!this.dubBusEnabled) {
      console.warn('[DubBus] throwDeck ignored — bus disabled');
      return;
    }
    console.log(`[DubBus] throwDeck ▶ deck=${deck} amount=${amount.toFixed(2)} holdSec=${holdSec} releaseSec=${releaseSec}`);
    const releaser = this.openDeckTap(deck, amount, 0.005, releaseSec);
    const timer = setTimeout(() => {
      console.log(`[DubBus] throwDeck ◀ hold expired, closing tap deck=${deck}`);
      this.dubThrowTimers.delete(timer);
      releaser();
    }, Math.max(0, holdSec * 1000));
    this.dubThrowTimers.add(timer);
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
  setSirenFeedback(amount: number, rampSec = 0.08): () => void {
    if (!this.dubBusEnabled) {
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
    const g = this.dubBusFeedback.gain;
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
        enabled: this.dubBusEnabled,
        inputGain: this.dubBusInput.gain.value,
        returnGain: this.dubBusReturn.gain.value,
        feedbackGain: this.dubBusFeedback.gain.value,
        lpfHz: this.dubBusLPF.frequency.value,
        echoIntensity: this.dubBusSettings.echoIntensity,
        springWet: this.dubBusSettings.springWet,
        activeReleasers: this.dubActionReleasers.size,
        pendingTimers: this.dubThrowTimers.size,
        activeDeckTaps: this.dubDeckTaps.size,
      });
    } catch { /* logging never breaks panic */ }

    // 1. Cancel every pending timer + releaser — no ghost ramps firing later.
    for (const t of this.dubThrowTimers) clearTimeout(t);
    this.dubThrowTimers.clear();
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
    // dubActionReleasers (via _scheduleExclusiveRelease's cleanup function),
    // and iterating while mutating a Map is subtle. Snapshot + clear
    // up-front, then fire the snapshots, guarantees every registered hold
    // gets a release call even if the callbacks reorder the map.
    const releasers = Array.from(this.dubActionReleasers.values());
    this.dubActionReleasers.clear();
    for (const release of releasers) {
      try { release(); } catch { /* ok */ }
    }

    // 2. Slam deck taps shut. No ramp — a faint click is better than audio
    //    slipping through during panic.
    for (const tap of this.dubDeckTaps.values()) {
      try {
        tap.gain.cancelScheduledValues(now);
        tap.gain.setValueAtTime(0, now);
      } catch { /* ok */ }
    }

    // 3. Kill siren feedback + reset LPF to open.
    try {
      this.dubBusFeedback.gain.cancelScheduledValues(now);
      this.dubBusFeedback.gain.setValueAtTime(0, now);
      this.dubBusLPF.frequency.cancelScheduledValues(now);
      this.dubBusLPF.frequency.setValueAtTime(20000, now);
    } catch { /* ok */ }

    // 4. Fast but smooth return ramp — 20 ms cuts audible tail almost
    //    instantly without the click of an instant value change.
    try {
      const g = this.dubBusReturn.gain;
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
    //    `_draining` flag suppresses echo/spring writes from setDubBusSettings
    //    during the 2 s drain window — otherwise the mirror effect's writes
    //    (triggered by store changes, including the store.setDubBus({
    //    enabled:false}) that usually accompanies panic) would restore the
    //    user's intensity values mid-drain and stomp the zero.
    try {
      const ig = this.dubBusInput.gain;
      ig.cancelScheduledValues(now);
      ig.setValueAtTime(ig.value, now);
      ig.linearRampToValueAtTime(0, now + 0.02);
    } catch { /* ok */ }
    this._draining = true;
    try {
      // Instant zero — setIntensity() ramps over 100 ms and lets the
      // delay line keep recirculating during the ramp, which is the
      // "echo lingers forever" tail users hit during live panic.
      this.dubBusEcho.setIntensityInstant(0);
      this.dubBusSpring.wet = 0;
    } catch (err) { console.warn('[DubPanic] echo/spring zero failed:', err); }
    const drainTimer = setTimeout(() => {
      this.dubThrowTimers.delete(drainTimer);
      if (this._disposed) return;
      this._draining = false;
      // Restore from the CURRENT settings (not a closure snapshot) so any
      // knob tweaks the user made during the drain window are honored.
      try {
        this.dubBusEcho.setIntensity(this.dubBusSettings.echoIntensity);
        this.dubBusSpring.wet = this.dubBusSettings.springWet;
      } catch { /* ok */ }
    }, 2000);
    this.dubThrowTimers.add(drainTimer);

    // 6. Flip the engine's enabled flag. Intentionally do NOT write to
    //    `this.dubBusSettings.enabled` — that's the "desired state" mirror
    //    of the store, and pre-writing it would make the store's mirror
    //    effect short-circuit via the equality check in setDubBusSettings
    //    when it later pushes the same value. Instead let the caller's
    //    `store.setDubBus({enabled:false})` flow through normally; its
    //    engine-side write will find `dubBusSettings.enabled=true` !== false
    //    and run the full disable path (noise gate, sync the flag, etc.).
    const wasEnabled = this.dubBusEnabled;
    this.dubBusEnabled = false;
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
    if (!this.dubBusEnabled) return () => {};
    const now = this.context.currentTime;
    const f = this.dubBusLPF.frequency;
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

  /**
   * Get the dub bus input node — used by triggerPad to route per-voice sends
   * into the shared bus. Only returns the node when the bus is enabled; if
   * disabled, the bus return is muted so sends have no audible effect.
   */
  getDubBusInput(): AudioNode {
    return this.dubBusInput;
  }

  /** Update the dub bus settings (enable, gains, delay params). */
  setDubBusSettings(settings: Partial<DubBusSettings>): void {
    // Short-circuit no-op writes. PadGrid + DJSamplerPanel mirror this state
    // every time the store's `dubBus` OR the active deck's BPM changes —
    // during a crossfader sweep that's ~60 Hz of identical settings being
    // pushed. Without this guard we'd schedule dozens of AudioParam ramps
    // per second across 6 params for zero audible change.
    let changed = false;
    for (const key of Object.keys(settings) as (keyof DubBusSettings)[]) {
      if (this.dubBusSettings[key] !== settings[key]) { changed = true; break; }
    }
    if (!changed) return;

    const merged: DubBusSettings = { ...this.dubBusSettings, ...settings };
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
        console.log(`[DubBus] setDubBusSettings ${flags.join(' ')} _draining=${this._draining}`);
      }
    } catch { /* logging never breaks the setter */ }
    this.dubBusSettings = merged;
    if (typeof settings.enabled === 'boolean') {
      this.dubBusEnabled = settings.enabled;
      // Reset "bus disabled" warn latch so the user gets a fresh warning if
      // they later toggle back off without re-enabling — helpful during
      // soundcheck when knobs move around.
      if (settings.enabled) this._warnedBusDisabled = false;
      // Gate the pink-noise source level alongside the bus return. Pure
      // silence when disabled — no rogue noise floor, no wasted CPU
      // feeding inaudible samples through the whole chain.
      try {
        // Gig fix: keep the pink-noise floor at zero at all times. See the
        // constructor note — the -55 dBFS floor was compounding through the
        // echo/spring feedback loop into audible white noise the instant
        // the user opened the drumpad view with a persisted enabled bus.
        const t = this.context.currentTime;
        this.dubBusNoiseGain.gain.cancelScheduledValues(t);
        this.dubBusNoiseGain.gain.setValueAtTime(0, t);
      } catch { /* ok */ }
      // Restore the bus input gain when re-enabling. dubPanic() mutes it
      // to 0 to drain the echo — re-enable needs to open the gate back up
      // or the bus would accept audio but produce nothing audible from new
      // throws because no signal reaches the echo/spring chain.
      if (settings.enabled) {
        try {
          const t = this.context.currentTime;
          const ig = this.dubBusInput.gain;
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
            this.dubBusEcho.setIntensity(merged.echoIntensity);
            this.dubBusSpring.wet = merged.springWet;
          } catch { /* ok */ }
        }
      }
    }
    const now = this.context.currentTime;
    this.dubBusHPF.frequency.setTargetAtTime(merged.hpfCutoff, now, 0.02);
    this.dubBusReturn.gain.setTargetAtTime(
      this.dubBusEnabled ? merged.returnGain : 0, now, 0.02,
    );
    // Suppress echo/spring writes while panic is draining the delay lines.
    // The drain restore timer applies the user's settings at the end of the
    // 2 s window. Without this guard, mirror-effect writes during drain
    // would restore intensity mid-flight and leave residual echo on re-enable.
    if (!this._draining) {
      this.dubBusSpring.wet = merged.springWet;
      this.dubBusEcho.setIntensity(merged.echoIntensity);
      this.dubBusEcho.wet = merged.echoWet;
    }
    this.dubBusEcho.setRate(merged.echoRateMs);
    // Sidechain depth maps to compressor threshold — more duck = lower threshold.
    // 0 → -6 dB threshold (barely compresses), 1 → -36 dB (heavy pumping).
    const threshold = -6 - merged.sidechainAmount * 30;
    this.dubBusSidechain.threshold.setTargetAtTime(threshold, now, 0.05);
  }

  getDubBusSettings(): DubBusSettings {
    return { ...this.dubBusSettings };
  }

  /**
   * Reconnect master output to a different destination node.
   * Used when switching between standalone and DJ mixer routing.
   */
  rerouteOutput(destination: AudioNode): void {
    this.masterGain.disconnect();
    this.masterGain.connect(destination);
  }

  /**
   * Set mute group assignments for all pads
   */
  setMuteGroups(pads: DrumPad[]): void {
    this.muteGroups.clear();
    for (const pad of pads) {
      if (pad.muteGroup > 0) {
        this.muteGroups.set(pad.id, pad.muteGroup);
      }
    }
  }

  /**
   * Build or update the per-pad effects chain.
   * Called lazily on trigger — caches by config hash to avoid rebuilding every hit.
   */
  private async ensurePadEffectsChain(pad: DrumPad): Promise<PadEffectsChain | null> {
    if (!pad.effects || pad.effects.length === 0) {
      // No effects — dispose any existing chain
      this.disposePadEffectsChain(pad.id);
      return null;
    }

    const hash = JSON.stringify(pad.effects.map(e => ({ t: e.type, e: e.enabled, w: e.wet, p: e.parameters })));
    const existing = this.padEffects.get(pad.id);
    if (existing && existing.configHash === hash) return existing;

    // Dispose old chain
    this.disposePadEffectsChain(pad.id);

    const outputBus = this.outputs.get(pad.output) || this.masterGain;

    // Create input/output gains for the chain
    const inputGain = this.context.createGain();
    const outputGain = this.context.createGain();
    outputGain.connect(outputBus);

    try {
      const effectNodes = await createEffectChain(pad.effects);

      if (effectNodes.length === 0) {
        inputGain.connect(outputGain);
      } else {
        // Connect: inputGain → first effect
        const first = effectNodes[0] as Tone.ToneAudioNode;
        Tone.connect(inputGain, first);

        // Chain effects together
        for (let i = 0; i < effectNodes.length - 1; i++) {
          const a = effectNodes[i] as Tone.ToneAudioNode;
          const b = effectNodes[i + 1] as Tone.ToneAudioNode;
          a.connect(b);
        }

        // Last effect → outputGain
        const last = effectNodes[effectNodes.length - 1] as Tone.ToneAudioNode;
        Tone.connect(last, outputGain);
      }

      const chain: PadEffectsChain = { inputGain, effects: effectNodes as any[], outputGain, configHash: hash };
      this.padEffects.set(pad.id, chain);
      return chain;
    } catch (err) {
      console.warn('[DrumPadEngine] Failed to create effects chain for pad', pad.id, err);
      inputGain.connect(outputGain);
      const chain: PadEffectsChain = { inputGain, effects: [], outputGain, configHash: hash };
      this.padEffects.set(pad.id, chain);
      return chain;
    }
  }

  /**
   * Dispose and remove a pad's effects chain.
   */
  private disposePadEffectsChain(padId: number): void {
    const chain = this.padEffects.get(padId);
    if (!chain) return;

    for (const fx of chain.effects) {
      try {
        (fx as Tone.ToneAudioNode).disconnect();
        fx.dispose();
      } catch { /* already disposed */ }
    }
    try { chain.inputGain.disconnect(); } catch { /* */ }
    try { chain.outputGain.disconnect(); } catch { /* */ }
    this.padEffects.delete(padId);
  }

  /**
   * Get or lazily create a reversed copy of an AudioBuffer
   */
  private getReversedBuffer(buffer: AudioBuffer): AudioBuffer {
    const cached = this.reversedBufferCache.get(buffer);
    if (cached) return cached;

    const reversed = this.context.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    this.reversedBufferCache.set(buffer, reversed);
    return reversed;
  }

  /**
   * Trigger a pad with velocity
   */
  triggerPad(pad: DrumPad, velocity: number): void {
    // Select sample: check velocity layers first, fall back to main sample
    let sampleBuffer = pad.sample?.audioBuffer ?? null;
    let layerLevelOffset = 0;

    if (pad.layers.length > 0) {
      const matchingLayer = pad.layers.find(
        l => velocity >= l.velocityRange[0] && velocity <= l.velocityRange[1]
      );
      if (matchingLayer?.sample?.audioBuffer) {
        sampleBuffer = matchingLayer.sample.audioBuffer;
        layerLevelOffset = matchingLayer.levelOffset;
      }
    }

    if (!sampleBuffer) return;

    // Handle reverse: use reversed buffer
    if (pad.reverse) {
      sampleBuffer = this.getReversedBuffer(sampleBuffer);
    }

    // Mute group choking: stop all voices in the same non-zero mute group
    if (pad.muteGroup > 0) {
      for (const [otherPadId, otherGroup] of this.muteGroups.entries()) {
        if (otherGroup === pad.muteGroup && otherPadId !== pad.id) {
          this.stopPad(otherPadId);
        }
      }
    }

    // Stop any existing voice for this pad. Use an immediate hard-stop
    // (sync teardown) instead of the ramped stopPad so rapid-fire retriggers
    // don't leave a ~60 ms cleanup timer hanging that will later kill the
    // brand-new voice we're about to create. Previously this sequence races:
    //   1. stopPad(pad.id) → schedules cleanupVoice in 60 ms
    //   2. voices.set(pad.id, newVoice)
    //   3. 60 ms timer fires → cleanupVoice(pad.id) reads THE NEW voice and
    //      disconnects/stops it → pad goes silent after 60 ms.
    // Same hazard with onended from the OLD source firing after replacement.
    // Hard-stopping up-front kills the prior voice synchronously and cancels
    // any pending cleanup, leaving the voices map clean before we populate it.
    this.hardStopVoice(pad.id);

    // Enforce polyphony limit with voice stealing
    if (this.voices.size >= DrumPadEngine.MAX_VOICES) {
      this.stealOldestVoice();
    }

    const now = this.context.currentTime;
    const useFilter = pad.filterType !== 'off';

    // Create audio nodes — skip filter when not needed
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const panNode = this.context.createStereoPanner();
    let filterNode: BiquadFilterNode | null = null;

    // Configure source
    source.buffer = sampleBuffer;

    // Pitch: tune is ±120, where 10 units = 1 semitone (MPC-style fine tuning)
    const veloFactor = velocity / 127;
    const inverseVeloFactor = 1 - veloFactor;
    const pitchMod = (pad.veloToPitch / 100) * veloFactor * 12;
    const totalTune = pad.tune / 10 + pitchMod;
    if (totalTune !== 0) {
      source.playbackRate.value = Math.pow(2, totalTune / 12);
    }

    // Configure filter (only if active)
    if (useFilter) {
      filterNode = this.context.createBiquadFilter();
      switch (pad.filterType) {
        case 'lpf': filterNode.type = 'lowpass'; break;
        case 'hpf': filterNode.type = 'highpass'; break;
        case 'bpf': filterNode.type = 'bandpass'; break;
      }

      const veloCutoffMod = (pad.veloToFilter / 100) * veloFactor;
      const baseCutoff = pad.cutoff;
      const modulatedCutoff = baseCutoff + veloCutoffMod * (20000 - baseCutoff);

      filterNode.frequency.value = Math.min(20000, Math.max(20, modulatedCutoff));
      filterNode.Q.value = (pad.resonance / 100) * 20;

      // Filter envelope sweep (MPC-style)
      if (pad.filterEnvAmount > 0) {
        const envDepth = (pad.filterEnvAmount / 100) * (20000 - modulatedCutoff);
        const fAttackTime = (pad.filterAttack / 100) * 3;
        const fDecayTime = (pad.filterDecay / 100) * 2.6;
        const peakCutoff = Math.min(20000, modulatedCutoff + envDepth);

        filterNode.frequency.setValueAtTime(modulatedCutoff, now);
        filterNode.frequency.linearRampToValueAtTime(peakCutoff, now + fAttackTime);
        filterNode.frequency.exponentialRampToValueAtTime(
          Math.max(20, modulatedCutoff),
          now + fAttackTime + fDecayTime
        );
      }
    }

    // Configure pan (skip if centered)
    if (pad.pan !== 0) {
      panNode.pan.value = pad.pan / 64;
    }

    // Velocity-to-level: controls how much velocity affects amplitude
    const veloLevelAmount = pad.veloToLevel / 100;
    const velocityScale = 1 - veloLevelAmount * inverseVeloFactor;
    const levelScale = pad.level / 127;
    const layerScale = layerLevelOffset !== 0 ? Math.pow(10, layerLevelOffset / 20) : 1;
    const targetGain = velocityScale * levelScale * layerScale;

    // Velocity-to-attack modulation: higher velocity = shorter attack
    const baseAttack = pad.attack / 1000;
    const veloAttackMod = (pad.veloToAttack / 100) * inverseVeloFactor;
    const attackTime = baseAttack * (1 + veloAttackMod * 2);

    const decayTime = pad.decay / 1000;
    const sustainLevel = (pad.sustain / 100) * targetGain;

    // ADSR envelope — use setValueAtTime for instant-attack pads to avoid ramp overhead
    if (attackTime < 0.001) {
      gainNode.gain.setValueAtTime(targetGain, now);
    } else {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
    }
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);

    // Connect nodes — route through effects chain if pad has effects
    const effectsChain = this.padEffects.get(pad.id);
    const outputBus = this.outputs.get(pad.output) || this.masterGain;
    if (filterNode) {
      source.connect(filterNode);
      filterNode.connect(panNode);
    } else {
      source.connect(panNode);
    }
    panNode.connect(gainNode);

    // The "final" node for this voice — whatever comes after the pad's FX
    // chain (if any) and before the dry bus. Both the dry send and the
    // dub-bus send tap off this node. We tap POST-FX so the pad's EQ/Sat
    // colors the send too; matches the subjective "this pad + X% more echo".
    let voiceOutput: AudioNode = gainNode;
    if (effectsChain) {
      gainNode.connect(effectsChain.inputGain);
      voiceOutput = effectsChain.outputGain;
      // effectsChain.outputGain is already connected to outputBus inside
      // ensurePadEffectsChain(), so the dry path is done.
    } else {
      gainNode.connect(outputBus);
    }

    // Per-voice dub send — tap post-FX, held on voice state so cleanupVoice
    // can disconnect it deterministically instead of waiting for GC. Under
    // high polyphony a GC-only strategy accumulated hundreds of orphan
    // GainNodes in a long session; explicit disconnect keeps the audio graph
    // lean for hours of live use.
    let dubSendNode: GainNode | null = null;
    if (this.dubBusEnabled && (pad.dubSend ?? 0) > 0) {
      dubSendNode = this.context.createGain();
      dubSendNode.gain.value = pad.dubSend!;
      voiceOutput.connect(dubSendNode);
      dubSendNode.connect(this.dubBusInput);
    }

    // Lazily build effects chain for next trigger if pad has effects but no chain yet
    if (pad.effects && pad.effects.length > 0 && !effectsChain) {
      this.ensurePadEffectsChain(pad).catch(() => {});
    }

    // Calculate sample start/end offsets
    const veloStartMod = (pad.veloToStart / 100) * inverseVeloFactor;
    let effectiveStart = pad.sampleStart + veloStartMod * (pad.sampleEnd - pad.sampleStart);
    effectiveStart = Math.min(effectiveStart, pad.sampleEnd - 0.01);

    let startOffset: number;
    let playDuration: number;
    if (pad.reverse) {
      startOffset = (1 - pad.sampleEnd) * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    } else {
      startOffset = effectiveStart * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    }

    // Start playback — schedule at 0 (now) for minimum latency
    source.start(0, startOffset, playDuration);

    // Store voice state
    const voice: VoiceState = {
      source,
      gainNode,
      filterNode: filterNode!,
      panNode,
      dubSendNode,
      startTime: now,
      noteOffTime: null,
      velocity,
    };

    // Auto-cleanup via onended (no extra silent-buffer timer node).
    // Guard against voice replacement: if a newer voice has taken this pad's
    // slot (e.g. rapid-fire retrigger), our onended must NOT tear that one
    // down. Identity check on the source handles this cleanly.
    source.onended = () => {
      const current = this.voices.get(pad.id);
      if (current?.source === source) {
        this.cleanupVoice(pad.id);
      } else {
        // Stale onended — our source was replaced. Best-effort disconnect
        // the local nodes so they're immediately GC-eligible.
        try { source.disconnect(); } catch { /* ok */ }
        try { gainNode.disconnect(); } catch { /* ok */ }
        try { filterNode?.disconnect(); } catch { /* ok */ }
        try { panNode.disconnect(); } catch { /* ok */ }
        try { dubSendNode?.disconnect(); } catch { /* ok */ }
      }
    };

    this.voices.set(pad.id, voice);
  }

  /**
   * Synchronously stop and disconnect a pad's current voice — no ramp, no
   * timer. Used by `triggerPad` on retrigger so the replacement voice we're
   * about to insert into the voices map isn't racing a 60 ms cleanup timer
   * scheduled by the previous `stopPad` call. A tiny click is acceptable
   * here; the alternative (the previous silent-after-60 ms bug) was worse.
   */
  private hardStopVoice(padId: number): void {
    // Cancel any scheduled soft-stop cleanup timer first so it can't run
    // against the voice we're about to insert.
    const pending = this.pendingCleanupTimers.get(padId);
    if (pending) {
      clearTimeout(pending);
      this.pendingCleanupTimers.delete(padId);
    }
    const voice = this.voices.get(padId);
    if (!voice) return;
    // Delete BEFORE disconnect so any onended that fires synchronously from
    // source.stop() below sees no entry and short-circuits.
    this.voices.delete(padId);
    try {
      voice.gainNode.gain.cancelScheduledValues(this.context.currentTime);
      voice.gainNode.gain.setValueAtTime(0, this.context.currentTime);
    } catch { /* ok */ }
    try { voice.source?.stop(); } catch { /* already stopped */ }
    try { voice.source?.disconnect(); } catch { /* ok */ }
    try { voice.gainNode.disconnect(); } catch { /* ok */ }
    try { voice.filterNode?.disconnect(); } catch { /* ok */ }
    try { voice.panNode.disconnect(); } catch { /* ok */ }
    try { voice.dubSendNode?.disconnect(); } catch { /* ok */ }
  }

  /**
   * Stop a pad (note off). Optional releaseTime in seconds for sustain mode pads.
   */
  stopPad(padId: number, releaseTime?: number): void {
    const voice = this.voices.get(padId);
    if (!voice || voice.noteOffTime !== null) {
      return;
    }

    const now = this.context.currentTime;
    voice.noteOffTime = now;

    const fadeTime = releaseTime ?? 0.01; // Default 10ms for fast choke

    // Release envelope (linear ramp to 0)
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);

    // Cleanup after fade completes. Snapshot the voice identity so the timer
    // only tears down THIS voice — if another triggerPad inserts a new voice
    // into this slot before the timer fires, we leave it alone.
    const pendingSource = voice.source;
    // Clear any earlier pending cleanup for this pad before replacing it.
    const prior = this.pendingCleanupTimers.get(padId);
    if (prior) clearTimeout(prior);
    const timer = setTimeout(() => {
      this.pendingCleanupTimers.delete(padId);
      const cur = this.voices.get(padId);
      if (cur?.source === pendingSource) {
        this.cleanupVoice(padId);
      }
      // else: voice was replaced by a newer trigger — leave it alone.
    }, (fadeTime + 0.05) * 1000);
    this.pendingCleanupTimers.set(padId, timer);
  }

  /**
   * Steal the oldest voice when polyphony limit is reached
   */
  private stealOldestVoice(): void {
    if (this.voices.size === 0) return;

    // Find the voice with the oldest start time
    let oldestPadId: number | null = null;
    let oldestStartTime = Infinity;

    for (const [padId, voice] of this.voices.entries()) {
      if (voice.startTime < oldestStartTime) {
        oldestStartTime = voice.startTime;
        oldestPadId = padId;
      }
    }

    if (oldestPadId !== null) {
      // Stop the oldest voice to make room
      this.stopPad(oldestPadId);
    }
  }

  /**
   * Clean up voice resources (now race-condition safe)
   */
  private cleanupVoice(padId: number): void {
    if (this._disposed) return;
    const voice = this.voices.get(padId);
    if (!voice) {
      return;
    }

    this.voices.delete(padId);

    try {
      voice.source?.disconnect();
      voice.gainNode.disconnect();
      voice.filterNode?.disconnect();
      voice.panNode.disconnect();
      // Disconnect the per-voice dub send so the GainNode is eligible for
      // immediate GC instead of lingering attached to dubBusInput.
      voice.dubSendNode?.disconnect();
      voice.source?.stop();
    } catch {
      // Ignore errors from already-stopped sources
    }
  }

  /**
   * Set master level
   */
  setMasterLevel(level: number): void {
    this.masterGain.gain.value = level / 127;
  }

  /** Set master gain directly in linear units (0..N). */
  setMasterVolume(value: number): void {
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(4, value)), this.context.currentTime, 0.01);
  }

  /** Read master gain (linear units). */
  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  /**
   * Set output bus level
   */
  setOutputLevel(bus: string, level: number): void {
    const output = this.outputs.get(bus);
    if (output) {
      output.gain.value = level / 127;
    }
  }

  /**
   * Stop all voices
   */
  stopAll(): void {
    const padIds = Array.from(this.voices.keys());
    padIds.forEach(padId => this.stopPad(padId));
  }

  /**
   * Cleanup and release resources
   */
  dispose(): void {
    this._disposed = true;
    // Cancel all pending async cleanup timers
    this.pendingCleanupTimers.forEach(t => clearTimeout(t));
    this.pendingCleanupTimers.clear();
    // Dispose all pad effects chains
    for (const padId of this.padEffects.keys()) {
      this.disposePadEffectsChain(padId);
    }
    // Synchronously disconnect all voices
    for (const [, voice] of this.voices) {
      try {
        voice.source?.disconnect();
        voice.gainNode.disconnect();
        voice.filterNode?.disconnect();
        voice.panNode.disconnect();
        voice.source?.stop();
      } catch { /* ignore */ }
    }
    this.voices.clear();
    // Tear down the dub bus — disconnect + dispose the Tone nodes to release
    // the shared SpringReverb WASM instance and the SpaceEcho delay buffers.
    // Also detach from any mixer the bus was pulling deck taps from.
    this.detachDJMixer();
    for (const tap of this.dubDeckTaps.values()) {
      try { tap.disconnect(); } catch { /* already disconnected */ }
    }
    this.dubDeckTaps.clear();
    // Cancel any in-flight dub action releasers + pending throw timers before
    // tearing nodes down — otherwise late-firing timers try to cancelScheduledValues
    // on disposed AudioParams and spam the console with errors.
    for (const t of this.dubThrowTimers) clearTimeout(t);
    this.dubThrowTimers.clear();
    clearAllPendingThrows();
    this.dubActionReleasers.clear();
    // Stop the pink noise source first so it doesn't keep the graph alive.
    try { this.dubBusNoise.stop(); } catch { /* may already be stopped */ }
    try { this.dubBusNoise.disconnect(); } catch { /* ok */ }
    try { this.dubBusNoiseGain.disconnect(); } catch { /* ok */ }
    try { this.dubBusInput.disconnect(); } catch { /* already disconnected */ }
    try { this.dubBusHPF.disconnect(); } catch { /* ok */ }
    try { this.dubBusTapeSat.disconnect(); } catch { /* ok */ }
    try { this.dubBusFeedback.disconnect(); } catch { /* ok */ }
    try { this.dubBusSidechain.disconnect(); } catch { /* ok */ }
    try { this.dubBusGlue.disconnect(); } catch { /* ok */ }
    try { this.dubBusLPF.disconnect(); } catch { /* ok */ }
    try { this.dubBusReturn.disconnect(); } catch { /* ok */ }
    try { this.dubBusSpring.dispose(); } catch { /* ok */ }
    try { this.dubBusEcho.dispose(); } catch { /* ok */ }
    this.masterGain.disconnect();
    this.outputs.forEach(output => output.disconnect());
    this.outputs.clear();
  }

  /**
   * Pre-build effects chains for all pads that have effects.
   * Call after pad config changes (e.g., applying FX preset from context menu).
   */
  async updatePadEffects(pads: DrumPad[]): Promise<void> {
    for (const pad of pads) {
      if (pad.effects && pad.effects.length > 0) {
        await this.ensurePadEffectsChain(pad);
      } else {
        this.disposePadEffectsChain(pad.id);
      }
    }
  }

  /**
   * Get a voice's filter node for real-time modulation (joystick etc.)
   * Returns null if pad has no active voice or no filter.
   */
  getVoiceFilter(padId: number): BiquadFilterNode | null {
    return this.voices.get(padId)?.filterNode ?? null;
  }
}
