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
import { DEFAULT_DUB_BUS } from '../../types/dub';
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
  private hpf: BiquadFilterNode;
  private tapeSat: WaveShaperNode;    // asymmetric tanh — MCI board bite
  private spring: SpringReverbEffect;
  private echo: SpaceEchoEffect;
  private sidechain: DynamicsCompressorNode;  // fast (pumping)
  private glue: DynamicsCompressorNode;       // slow (dubplate glue)
  private lpf: BiquadFilterNode;      // sweep-able LPF on return
  private return_: GainNode;
  private feedback: GainNode;         // echo → feedback → input (siren)
  private noise: AudioBufferSourceNode;  // pink noise loop
  private noiseGain: GainNode;           // -55 dBFS level
  private enabled = DEFAULT_DUB_BUS.enabled;
  private settings: DubBusSettings = { ...DEFAULT_DUB_BUS };

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
  // Once-per-engine warning latches so we don't flood the console during a
  // live set if the bus is disabled or the mixer isn't attached. Reset when
  // the condition clears (attach succeeds / bus gets enabled).
  private _warnedBusDisabled = false;
  private _warnedNoMixer = false;
  private _disposed = false;

  private readonly context: AudioContext;
  private readonly master: AudioNode;

  constructor(context: AudioContext, master: AudioNode) {
    this.context = context;
    this.master = master;
    // Build the shared Dub Bus: input → HPF → Spring → Echo → Sidechain → return → master
    // The return gain is gated by enabled — when disabled, return.gain = 0
    // so sends have zero effect (no audible bus output, but graph stays wired).
    this.input = this.context.createGain();
    this.input.gain.value = 1;

    this.hpf = this.context.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = this.settings.hpfCutoff;
    this.hpf.Q.value = 0.707;

    // Tape saturation — asymmetric tanh curve that models the positive/negative
    // asymmetry of transformer-coupled magnetic tape. Softens positive peaks
    // more than negative, which is what gives RE-201 / Studer saturation its
    // distinctive warmth (not the razor-edge of digital clipping). Sits before
    // the echo so the crunch gets chopped up into repeats, not smeared over
    // the whole tail.
    this.tapeSat = this.context.createWaveShaper();
    this.tapeSat.curve = makeTapeSatCurve(0.35);
    this.tapeSat.oversample = '2x';

    // Spring reverb — tightened diffusion from 0.7 → 0.4 for a more
    // pronounced single-slap character (less "cathedral", more "metal tank").
    // That's what gives King Tubby's recordings their snappy springiness.
    this.spring = new SpringReverbEffect({
      decay: 0.6, damping: 0.45, tension: 0.55, mix: 0.55, drip: 0.7, diffusion: 0.4,
      wet: this.settings.springWet,
    });

    this.echo = new SpaceEchoEffect({
      mode: 4,                              // tape heads + built-in spring
      rate: this.settings.echoRateMs,
      intensity: this.settings.echoIntensity,
      echoVolume: 0.7,
      reverbVolume: 0.3,
      bass: 2,                              // gentle warmth
      treble: -2,                           // tame fizz on the tail
      wow: 0.35,                            // seasick tape flutter — Perry dial
      wet: this.settings.echoWet,
    });

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

    this.return_ = this.context.createGain();
    this.return_.gain.value = this.enabled ? this.settings.returnGain : 0;

    // Feedback loop for siren self-oscillation. At rest gain=0 → no loop.
    // When raised toward 0.9+, the echo's output recirculates into the input
    // and climbs until hitting the tank/tape saturation ceiling — that's the
    // classic King Tubby siren/wobble. Capped internally at 0.95 to avoid
    // runaway blowups regardless of settings.
    this.feedback = this.context.createGain();
    this.feedback.gain.value = 0;

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

    // Wire the vintage Tubby/Scientist chain:
    //   input → HPF → TapeSat → Echo → Spring
    //                           │
    //                      feedback ← echoOut
    //
    //   Spring.output → Sidechain → Glue → LPF → return → master
    this.input.connect(this.hpf);
    this.hpf.connect(this.tapeSat);
    Tone.connect(this.tapeSat, this.echo as unknown as Tone.InputNode);
    this.echo.connect(this.spring);
    // Feedback regen: tap echo output (before spring) back into input.
    // Pre-spring means the siren rings without flooding the spring with
    // runaway self-oscillation.
    const echoOut = (this.echo as unknown as { output: Tone.ToneAudioNode }).output;
    Tone.connect(echoOut, this.feedback as unknown as Tone.InputNode);
    this.feedback.connect(this.input);
    // Post-spring output chain
    const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;
    Tone.connect(springOut, this.sidechain as unknown as Tone.InputNode);
    this.sidechain.connect(this.glue);
    this.glue.connect(this.lpf);
    this.lpf.connect(this.return_);
    this.return_.connect(this.master);
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
  }

  /** The bus input node — pad sources connect to this. */
  get inputNode(): GainNode { return this.input; }

  /** Whether the bus is currently enabled (return gain > 0). */
  get isEnabled(): boolean { return this.enabled; }

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
      this.spring.wet = this.settings.springWet;
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
      this.spring.wet = 0;
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
        this.spring.wet = settings.springWet;
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

    // 3. Kill siren feedback + reset LPF to open.
    try {
      this.feedback.gain.cancelScheduledValues(now);
      this.feedback.gain.setValueAtTime(0, now);
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
      this.spring.wet = 0;
    } catch (err) { console.warn('[DubPanic] echo/spring zero failed:', err); }
    const drainTimer = setTimeout(() => {
      this.throwTimers.delete(drainTimer);
      if (this._disposed) return;
      this._draining = false;
      // Restore from the CURRENT settings (not a closure snapshot) so any
      // knob tweaks the user made during the drain window are honored.
      try {
        this.echo.setIntensity(this.settings.echoIntensity);
        this.spring.wet = this.settings.springWet;
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
            this.spring.wet = merged.springWet;
          } catch { /* ok */ }
        }
      }
    }
    const now = this.context.currentTime;
    this.hpf.frequency.setTargetAtTime(merged.hpfCutoff, now, 0.02);
    this.return_.gain.setTargetAtTime(
      this.enabled ? merged.returnGain : 0, now, 0.02,
    );
    // Suppress echo/spring writes while panic is draining the delay lines.
    // The drain restore timer applies the user's settings at the end of the
    // 2 s window. Without this guard, mirror-effect writes during drain
    // would restore intensity mid-flight and leave residual echo on re-enable.
    if (!this._draining) {
      this.spring.wet = merged.springWet;
      this.echo.setIntensity(merged.echoIntensity);
      this.echo.wet = merged.echoWet;
    }
    this.echo.setRate(merged.echoRateMs);
    // Sidechain depth maps to compressor threshold — more duck = lower threshold.
    // 0 → -6 dB threshold (barely compresses), 1 → -36 dB (heavy pumping).
    const threshold = -6 - merged.sidechainAmount * 30;
    this.sidechain.threshold.setTargetAtTime(threshold, now, 0.05);
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

  /**
   * Echo Throw entry point — momentarily bump the channel's tap gain to
   * `amount` (regardless of the user's baseline dubSend), then close back
   * to the baseline when the returned releaser fires. Mirrors openDeckTap.
   *
   * Returns a releaser that ramps the tap back to its baseline; echoThrow
   * schedules this after throwBeats. No-ops cleanly when the bus is disabled
   * or no tap is registered for this channel (dubSend = 0 / engine not ready).
   */
  openChannelTap(channelId: number, amount: number, attackSec = 0.005): () => void {
    if (!this.enabled) return () => {};
    const tap = this.channelTaps.get(channelId);
    if (!tap) return () => {};

    const baseline = tap.gain.value;
    const clamped = Math.min(1, Math.max(0, amount));
    const now = this.context.currentTime;
    tap.gain.cancelScheduledValues(now);
    tap.gain.setValueAtTime(tap.gain.value, now);
    tap.gain.linearRampToValueAtTime(clamped, now + attackSec);

    return () => {
      const release = this.context.currentTime;
      tap.gain.cancelScheduledValues(release);
      tap.gain.setValueAtTime(tap.gain.value, release);
      tap.gain.linearRampToValueAtTime(baseline, release + 0.08);
    };
  }

  /**
   * Temporarily boost echo feedback by `delta`, clamp to maxFeedback=0.95,
   * then restore the user's echoIntensity after `ms`. No-ops when disabled.
   * Used by echoThrow + (future) dubStab to create the "swelling echo tail"
   * that is the defining Echo Throw sound.
   */
  modulateFeedback(delta: number, ms: number): void {
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
   * Spring Slam — temporarily crank spring wet to `amount` (default 1.0),
   * then restore the user's baseline after `ms`. Designed for rhythmic
   * "splash" hits where a drum/clap gets a sudden tail of metal-tank
   * reverb and then snaps back. Mirrors modulateFeedback's pattern so
   * disposal works the same way. No-op when bus is disabled.
   */
  slamSpring(amount = 1.0, ms = 400): void {
    if (!this.enabled) return;
    const target = Math.min(1.0, Math.max(0, amount));
    try { this.spring.wet = target; } catch { /* ok */ }
    const t = setTimeout(() => {
      this.throwTimers.delete(t);
      try { this.spring.wet = this.settings.springWet; } catch { /* ok */ }
    }, ms);
    this.throwTimers.add(t);
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
      f.exponentialRampToValueAtTime(80, now + downSec);
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
  fireNoiseBurst(durationMs = 40, level = 0.6): void {
    if (!this.enabled) return;
    try {
      // Generate ~200ms of white noise so the buffer outlives any reasonable
      // burst duration. Re-used per call — cheap vs. the echo/spring work.
      const sr = this.context.sampleRate;
      const frames = Math.ceil((durationMs + 20) * sr / 1000);
      const buf = this.context.createBuffer(1, frames, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = this.context.createBufferSource();
      src.buffer = buf;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.input);
      const now = this.context.currentTime;
      const peak = Math.min(1, Math.max(0, level));
      // Attack 1ms → decay to 0 over remaining duration. Exponential-ish via
      // setTargetAtTime gives a snappier crack than a linear ramp.
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.001);
      gain.gain.setTargetAtTime(0, now + 0.001, durationMs / 3000);
      src.start(now);
      src.stop(now + durationMs / 1000 + 0.02);
      src.onended = () => { try { gain.disconnect(); } catch { /* ok */ } };
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
    // Detach from any mixer the bus was pulling deck taps from.
    this.detachDJMixer();
    for (const tap of this.deckTaps.values()) {
      try { tap.disconnect(); } catch { /* already disconnected */ }
    }
    this.deckTaps.clear();
    // Channel taps are owned by ChannelEffectsManager — just clear our registry.
    // The actual Tone.Gain nodes are disposed by ChannelEffectsManager.disposeAll().
    this.channelTaps.clear();
    // Cancel any in-flight dub action releasers + pending throw timers before
    // tearing nodes down — otherwise late-firing timers try to cancelScheduledValues
    // on disposed AudioParams and spam the console with errors.
    for (const h of this.wobbleHandles) clearInterval(h);
    this.wobbleHandles.clear();
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
    try { this.spring.dispose(); } catch { /* ok */ }
    try { this.echo.dispose(); } catch { /* ok */ }
  }
}
