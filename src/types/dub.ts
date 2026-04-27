/**
 * Dub bus types — canonical home. Originally embedded in types/drumpad.ts;
 * promoted to its own module during Phase 0 of the Tracker Dub Studio work.
 *
 * See: thoughts/shared/plans/2026-04-19-tracker-dub-studio-design.md
 */

/**
 * Dub action IDs — pad-fired "King Tubby moves" that route DJ deck audio
 * into the shared Dub Bus. Behaviors:
 *
 *   dub_throw_*     — momentary one-shot: press grabs a slice of the deck
 *                     into the echo, then releases on its own after ~1 beat.
 *                     Dry deck audio never mutes.
 *   dub_hold_*      — press-and-hold: deck audio feeds the bus while held,
 *                     closes on release. Longer captures.
 *   dub_mute_*      — "the drop": mutes dry deck + opens bus at full while
 *                     held. The classic King Tubby move.
 */
export type DubActionId =
  // ── Auto-select: resolves the currently-loudest playing deck at press ──
  // Primary layout. One pad per gesture regardless of which deck is playing —
  // the kit follows the DJ's crossfader automatically.
  | 'dub_throw' | 'dub_hold' | 'dub_mute'
  // Throw-length variants — different musical rhythmic feel
  | 'dub_slap_back'      // 0.125 beats — tiny accent grab
  | 'dub_throw_short'    // 0.25 beats  — quarter-beat chop
  | 'dub_throw_long'     // 2 beats     — big half-bar phrase grab
  // Combined "the drop" — simultaneous mute + filter sweep, the classic
  // King Tubby move where the mix drops out AND ducks tonally at once.
  | 'dub_combo_drop'
  // ── Broadcast: hit every playing deck at once ──
  | 'dub_throw_all' | 'dub_hold_all' | 'dub_mute_all'
  // ── Explicit targeting (retained for context-menu power users; not in
  //    the factory kit layout anymore since auto-select covers every case).
  | 'dub_throw_a' | 'dub_throw_b' | 'dub_throw_c'
  | 'dub_hold_a' | 'dub_hold_b' | 'dub_hold_c'
  | 'dub_mute_a' | 'dub_mute_b' | 'dub_mute_c'
  // ── Bus FX: no deck source needed ──
  | 'dub_siren'
  | 'dub_filter_drop';

/** Dub Bus — shared send FX for all drumpads. Settings apply engine-wide. */
export interface DubBusSettings {
  enabled: boolean;
  // Return gain for the whole bus (0-1). 1 = full wet.
  returnGain: number;
  // HPF cutoff on the bus input — rolls bass off the send so the echo/reverb
  // doesn't muddy the low end (classic dub trick). Default 180 Hz.
  hpfCutoff: number;
  // Spring reverb amount in the bus chain (0-1).
  springWet: number;
  // Space Echo intensity (feedback) — one shared delay, so this can run
  // higher than a per-pad chain could. 0-0.85 sensible range.
  echoIntensity: number;
  // Space Echo wet amount (0-1).
  echoWet: number;
  // Space Echo rate in ms (shorter = tighter repeats, longer = more spaced).
  echoRateMs: number;
  // Sidechain-style duck on the bus return. When loud input hits the bus,
  // the return briefly ducks so transients cut through the tail (the
  // "pumping dub" effect). 0 = no duck, 1 = full duck.
  sidechainAmount: number;
  // Sidechain source — what audio drives the ducking.
  //   'bus'     = the bus input itself (self-compression; current default)
  //   'channel' = a specific tracker channel (e.g. only the kick triggers
  //               ducking, even when it's low in the bus)
  // Channel mode works via ChannelRoutedEffects' isolation tap: a per-
  // channel worklet output is summed into the bus compressor alongside
  // the normal bus signal, so loud channel transients pull the threshold
  // down harder than the bus alone would.
  sidechainSource: 'bus' | 'channel';
  // When sidechainSource = 'channel', which tracker channel index (0-based)
  // drives the ducking. Ignored for 'bus' mode. Defaults to 0 (first ch).
  sidechainChannelIndex: number;
  // How much of a deck's audio is injected into the bus when a dub-action
  // pad fires (throw / hold / mute). 0-1; typical 0.85-1.0.
  deckTapAmount: number;
  // Throw duration in beats — how long the tap stays open for a
  // dub_throw_* action before it begins releasing. 0.5 = eighth note.
  throwBeats: number;
  // Siren feedback target (0-0.95) — how hot the self-oscillation runs
  // when a dub_siren pad is held. Above ~0.9 gets screaming.
  sirenFeedback: number;
  // Filter drop target in Hz — where the bus LPF drops to while a
  // dub_filter_drop pad is held. 80-600 Hz is the classic muffle range.
  filterDropHz: number;
  // Echo engine — which delay effect the bus uses. Default 'spaceEcho'
  // preserves the original bus behavior. Swapping the engine changes the
  // tonal character: RE-201 adds tape magnetisation + spring reverb,
  // AnotherDelay adds wow/flutter + Freeverb, RETapeEcho adds BBD echo.
  // Character presets auto-set this per engineer (Tubby=RE-201, etc.).
  echoEngine: 'spaceEcho' | 're201' | 'anotherDelay' | 'reTapeEcho';

  // Echo rate BPM-sync — when non-'off', the SpaceEcho `rate` is derived
  // live from transport BPM using the selected note division instead of
  // the free-running `echoRateMs`. That's how classic dub delays stay
  // locked to the groove: repeats hit on the beat subdivisions.
  //   '1/4'  = quarter note   (one repeat per beat)
  //   '1/8'  = eighth note    (tight stutter)
  //   '1/8D' = dotted eighth  (the classic reggae/dub skank feel)
  //   '1/16' = sixteenth      (very dense)
  //   '1/2'  = half note      (long dub tail)
  echoSyncDivision: 'off' | '1/4' | '1/4T' | '1/8' | '1/8D' | '1/8T' | '1/16' | '1/2';
  // Throw quantize — when non-'off', dub throws wait for the next beat
  // subdivision boundary before firing. Gives the pad a "locked-to-the-
  // groove" feel instead of free-timing. 'offbeat' is the King Tubby
  // signature: hits land on the "&" between beats so echoes fill onbeats.
  //   'off'     = fire immediately
  //   '1/16'    = tight grid — hit feels perfectly locked
  //   '1/8'     = next eighth boundary
  //   'offbeat' = next half-beat (the "&" between downbeats)
  //   'bar'     = next downbeat only (biggest moves)
  throwQuantize: 'off' | '1/16' | '1/8' | 'offbeat' | 'bar';

  // ─── Sound coloring (research doc 2026-04-20_dub-sound-coloring.md) ──────
  // King Tubby bass shelf — resonant lowshelf at 90 Hz for the dub "weight."
  // Gain in dB (negative = cut), Q around 0.7-1.0 for musical shelf.
  // Default +3 dB to give the bus some inherent dub heft out of the box.
  bassShelfGainDb: number;
  bassShelfFreqHz: number;
  bassShelfQ: number;
  // Scientist mid-scoop — peaking cut around 700 Hz for the "hollow" dub
  // space that lets vocals + horns pop through the echo tail. Gain in dB
  // (negative = cut). Default 0 — engage per-engineer via CHARACTER preset.
  midScoopGainDb: number;
  midScoopFreqHz: number;
  midScoopQ: number;
  // Master bus stereo width at the return (M/S matrix).
  //   0.0 = mono (Perry / Tubby era)
  //   1.0 = neutral stereo (what you have today)
  //   2.0 = doubled side signal (Mad Professor ping-pong width)
  stereoWidth: number;

  // Engineer character preset — applies a curated snapshot of every
  // coloring param when selected. 'custom' = user-edited, don't overwrite.
  characterPreset: 'custom' | 'tubby' | 'scientist' | 'perry' | 'madProfessor' | 'gatedFlanger';

  /** Glue compressor bypass — Scientist mode. When true sets the glue
   *  DynamicsCompressor to 1:1 ratio (unity), passing the signal untouched.
   *  Research: Scientist explicitly rejected all bus compression as a design
   *  principle. Default false (3:1 ratio, −14 dB threshold active). */
  glueBypass: boolean;

  // ─── Altec-style stepped HPF (Tubby "Big Knob") ─────────────────────────
  // When true, the bus snaps hpfCutoff to the nearest of 11 discrete Altec
  // positions (70/100/150/250/500/1k/2k/3k/5k/7.5k/10k Hz) on every write.
  // Gives the rhythmic-click feel of Tubby sweeping his 9069B passive
  // filter on effect-return channels. Independent of HPF slope (which is
  // always 18 dB/oct as of 2026-04-20 — 3-biquad cascade).
  hpfStepped: boolean;
  /** Altec 9069B T-network resonant peak gain (dB). The real passive filter
   *  has a resonant hump just above the cutoff that gives Tubby's sweeps their
   *  characteristic voice vs a plain HPF. 0 = flat/off, 2.5 = authentic Altec.
   *  Q is fixed at 2.0 (moderately tight peak). */
  hpfResonanceDb: number;

  // ─── Liquid sweep — parallel short-delay comb filter with LFO ──────────
  // Dub's "liquid drums" motion. Technically a flanger (1-10ms modulated
  // delay + feedback); in practice the move also overlaps phaser territory
  // and swept-filter pseudo-phasing on returns. One amount knob: 0 = off,
  // 1 = full parallel send. Rate + depth expose per-preset for character.
  sweepAmount: number;   // 0..1, wet send level
  sweepRateHz: number;   // LFO rate, 0.05-5 Hz (dub norm: 0.1-0.5)
  sweepDepthMs: number;  // delay-time sweep excursion ±ms
  sweepFeedback: number; // 0-0.85, how "resonant" the comb gets

  // ─── Tape saturation mode ──────────────────────────────────────────────
  // 'single':     one WaveShaper (current default). 30 ips-adjacent.
  // 'stack':      3 parallel WaveShapers with different drives + uncorrelated
  //               wow, modeling Perry's 4-track-bounce tape-stacking at 7.5ips.
  // 'tape15ips':  heavier drive + rolled-off treble curve, mimicking slower
  //               tape speed (half of 30 ips). Research-quoted as the dub
  //               engineer's trick for "heavier/dirtier bottom."
  tapeSatMode: 'single' | 'stack' | 'tape15ips';

  // ─── Mad Professor asymmetric L/R ping-pong ──────────────────────────────
  // Two delay lines panned hard L/R with independent delay times (research:
  // Ariwa's SDE-3000 ran 3/8 note to the left and 1/2 note to the right).
  // Creates genuine stereo rhythmic motion vs the M/S width which is
  // mono-compatible. Activates on startPingPong(); off by default.
  pingPongLMs: number;   // left delay time in ms (default: 337.5 = 3/8 at 120 BPM)
  pingPongRMs: number;   // right delay time in ms (default: 450 = 1/2 at 120 BPM)
  pingPongFeedback: number; // feedback 0-0.9 (default 0.45)
  pingPongWet: number;   // 0-1 (default 0.65)
  /** When true, L/R delay times auto-calculate from BPM: L = 3/8 beat,
   *  R = 1/2 beat (the Ariwa SDE-3000 configuration). */
  pingPongSyncToBpm: boolean;

  // ─── RE-201 delay mode ────────────────────────────────────────────────────
  // Selects the tape-head combination on the RE-201 engine (0-10):
  //   0=reverb only  1=H1  2=H2  3=H3  4=H1+H2  5=H1+H3  6=H2+H3
  //   7=H1+reverb   8=H1+H2+reverb  9=H2+H3+reverb (Tubby!)  10=all
  // Ignored when echoEngine is not 're201'. Default 7 (H1+reverb).
  re201DelayMode: number;

  // ─── Dub siren preset ────────────────────────────────────────────────────
  // Named voice for the dub siren (dubSiren move + Auto Dub):
  //   'rasta'     = classic low-sweep Jamaican rasta box (default, ~MIDI 36)
  //   'pirate'    = high FM sweep radio noise (~MIDI 72, fast sweep)
  //   'foghorn'   = deep resonant drone (~MIDI 28, slow)
  //   'alarm'     = two-tone alternating (60/67 semitones, fast)
  sirenPreset: 'rasta' | 'pirate' | 'foghorn' | 'alarm';

  // ─── SpaceEcho head mode (RE-201 mode selector) ──────────────────────────
  // The RE-201 has 12 mode positions selecting which tape heads are active
  // and whether the spring reverb is mixed in. Only applies when echoEngine
  // is 'spaceEcho'. Ignored (no-op) for re201/anotherDelay/reTapeEcho.
  //
  // Head map (per SpaceEchoEffect.setMode):
  //   1=H1,  2=H2,  3=H3,  4=H2+H3
  //   5=H1+reverb,  6=H2+reverb,  7=H3+reverb
  //   8=H1+H2+reverb,  9=H2+H3+reverb,  10=H1+H3+reverb
  //   11=all heads+reverb,  12=reverb only
  echoMode: number;  // 1-12, default 4 (H2+H3 — the classic dub multi-tap)

  // ─── SpaceEcho in-feedback filters ───────────────────────────────────────
  // HPF in the feedback path prevents low-end buildup: each repeat passes
  // through a highpass, so bass rumble can't accumulate pass-over-pass.
  // The RE-201's tape-head gap naturally acts as a HPF around 200-400 Hz.
  //
  // LPF in the feedback path progressively darkens each repeat: simulates
  // tape-head wear and head-to-tape distance — the further a repeat travels,
  // the more HF is lost. Classic "warm distant echo" character.
  //
  // Both filters ramp smoothly (50 ms) so automating them during playback
  // (e.g. sweeping feedbackLpfHz down on a breakdown) is click-free.
  echoFeedbackHpfHz: number;  // 20-2000 Hz, default 250
  echoFeedbackLpfHz: number;  // 500-20000 Hz, default 4000

  // ─── Optional plate-stage insert (2026-04-21) ──────────────────────────
  // When non-'off', a plate reverb is inserted as a POST-processing stage
  // at the very end of the bus chain (after the M/S width matrix, before
  // the return gain). The spring + echo still run their normal path —
  // the plate only adds an additional colored tail on top. Useful for
  // layering a long Mad Professor cathedral OR a metallic Dattorro plate
  // over the shorter Aelapse spring + tape echo character.
  //
  // 'off'          = no plate stage (current behavior, bus unchanged)
  // 'madprofessor' = MVerb + pre-HPF + post-LPF (long dark PCM-70 voicing)
  // 'dattorro'     = Jon Dattorro 1997 plate (metallic, "infinite" tail)
  plateStage: 'off' | 'madprofessor' | 'dattorro';
  // Wet amount for the plate stage (0-1). 0 = bypassed (even when
  // plateStage !== 'off'); 1 = fully wet. Default 0.35 — audible colored
  // tail without overwhelming the bus.
  plateStageMix: number;

  // ─── Return EQ — sweepable parametric on the return path (2026-04-23) ──
  // 4-band WASM parametric EQ inserted between midScoop and LPF on the
  // return path. Only band 2 (peaking) is exposed as the primary dub knob;
  // bands 1/3/4 are flat by default (advanced users tweak via MCP).
  // The classic Tubby technique: sweep a resonant peak across the echo/
  // spring return to make it "sing." Always 100% wet (series insert).
  returnEqEnabled: boolean;
  returnEqFreq: number;   // band 2 center freq, 200-5000 Hz
  returnEqGain: number;   // band 2 gain, -18 to +18 dB (0 = flat/bypass)
  returnEqQ: number;      // band 2 Q, 0.5-8 (higher = narrower/more resonant)
  // Advanced: bands 1/3/4 for MCP/power users. Flat (0 dB gain) by default.
  returnEqB1Freq: number;
  returnEqB1Gain: number;
  returnEqB1Q: number;
  returnEqB3Freq: number;
  returnEqB3Gain: number;
  returnEqB3Q: number;
  returnEqB4Freq: number;
  returnEqB4Gain: number;
  returnEqB4Q: number;
  // ─── Fil4 HP / LP on the return EQ (2026-04-27) ──────────────────────────
  returnEqHpEnabled: boolean;
  returnEqHpFreq: number;    // Hz
  returnEqHpQ: number;
  returnEqLpEnabled: boolean;
  returnEqLpFreq: number;    // Hz
  returnEqLpQ: number;

  // ─── Sweep mode — comb filter vs true phaser (2026-04-23) ─────────────
  // 'comb' = current liquid-sweep short-delay flanger (default)
  // 'phaser' = CalfPhaser WASM all-pass cascade (authentic Mutron Bi-Phase)
  sweepMode: 'comb' | 'phaser';
  phaserRate: number;      // LFO rate Hz (0.01-10)
  phaserDepth: number;     // LFO depth (0-1)
  phaserStages: number;    // all-pass stages (2-12)
  phaserFeedback: number;  // feedback (-0.95 to 0.95)

  // ─── Post-echo tape saturation (2026-04-23) ───────────────────────────
  // Second tape sat AFTER echo output, BEFORE spring. First echo repeat
  // overdrives hard, subsequent repeats lighter (they're quieter).
  // Creates "degrading repeats" character. Independent of pre-echo tapeSat.
  postEchoSatEnabled: boolean;
  postEchoSatDrive: number;  // 0-1 drive amount

  // ─── Ring modulator (2026-04-23) ──────────────────────────────────────
  // Parallel send into RingModEffect WASM. Carrier multiplied with input.
  ringModEnabled: boolean;
  ringModFreq: number;      // carrier frequency Hz (20-2000)
  ringModWaveform: number;  // 0=sine, 1=square, 2=triangle, 3=saw
  ringModMix: number;       // 0-1 wet/dry on the ring mod output
  ringModAmount: number;    // 0-1 how much ring mod signal in the bus

  // ─── Lo-fi / voltage starve (2026-04-23) ──────────────────────────────
  // Bitta WASM bitcrusher for "near dead battery" / dictaphone effects.
  lofiEnabled: boolean;
  lofiBits: number;         // 1-16 bit depth (16 = full quality / off)

  // ─── External feedback loop (2026-04-23) ──────────────────────────────
  // Messian Dread: "Don't use delay feedback internally — loop back through
  // a mixer channel." Routes echo/spring return back to echo input through
  // a gain + parametric EQ. Adds mixer coloration to each repeat — the
  // "mixing desk as sound source" technique.
  extFeedbackGain: number;  // 0-0.85 (capped below unity to prevent runaway)
  extFeedbackEqFreq: number;  // 200-5000 Hz center of peaking EQ on feedback path
  extFeedbackEqGain: number;  // -18 to +18 dB
  extFeedbackEqQ: number;     // 0.5-8

  // ─── Club simulation via convolution (2026-04-23) ─────────────────────
  // ConvolverNode on the master output with algorithmically generated IRs.
  // Simulates listening in a real venue — "how does this mix translate to
  // a sound system dance?" (Interruptor).
  clubSimEnabled: boolean;
  clubSimPreset: 'smallClub' | 'soundSystem' | 'studioMonitor';
  clubSimMix: number;  // 0-1 dry/wet blend

  // ─── Effect chain order (2026-04-23) ──────────────────────────────────
  // "Combine effects in unusual order" — Interruptor. The two core effects
  // (echo + spring) can be reordered for dramatically different textures:
  // - 'echoSpring': echo → spring (default, Tubby/Scientist)
  //   Echoes get spring reverb → each repeat is progressively more washy
  // - 'springEcho': spring → echo (Perry — liquid chaos)
  //   Reverb tail gets echoed → "a room repeated", each repeat is a room
  // - 'parallel': both receive dry input, mix at output
  //   Independent echo + spring textures blended together
  chainOrder: 'echoSpring' | 'springEcho' | 'parallel';

  // ─── Auto EQ (2026-04-27) ────────────────────────────────────────────────
  /** 0–1 blend of computed auto-EQ curve toward flat. 0=flat, 1=full curve. Default 0.85. */
  autoEqStrength: number;
  /** Last genre label used by auto-EQ — set by DubBus when analysis fires. */
  autoEqLastGenre: string;
}

export const DEFAULT_DUB_BUS: DubBusSettings = {
  enabled: false,
  // Defaults tuned so dub moves are CLEARLY audible alongside the dry mix.
  // Subtle settings produced "I hear mostly the music" — the dub tail was
  // ~8 dB below the dry. These values put the tail within 3 dB of dry,
  // which is where King Tubby / Scientist records actually sit.
  // Gig-fix (2026-04-18): dropped returnGain 1.0 → 0.55. At 1.0 the dub
  // tail hit the master bus at parity with deck output — sirens + echo
  // throws were ~+6 dB hotter than the music. 0.55 sits it ~-5 dB under
  // the dry mix, which is where real dub records actually mix (the tail
  // supports, never dominates). User can push it back up via the Dub
  // Bus panel return knob if they want.
  returnGain: 0.85,
  // HPF default is 40 Hz — effectively off. Dub Bus is used across drumpad,
  // tracker, and DJ views, but only the DJ view benefits from rolling bass
  // off the send (deck kick + echo = mud). Drumpad + tracker mix per
  // channel/pad, so the kick is already placed; HPF at 180 Hz stripped the
  // low end of a bassy tom or synth bass before the echo could do anything
  // with it. DJ users who want the dub-trick HPF raise it via the Dub Bus
  // panel slider (20-600 Hz range).
  hpfCutoff: 40,
  springWet: 0.55,       // was 0.4 — more audible spring tank character
  echoIntensity: 0.62,   // was 0.55 — 4-5 repeats before decay
  echoWet: 0.5,          // 0.7 was too dominant — dark feedback LPF smeared the whole return.
                         // 0.5 keeps echo audible as accent without drowning clarity.
  echoRateMs: 300,
  echoEngine: 'spaceEcho',
  sidechainAmount: 0.15,
  sidechainSource: 'bus',
  sidechainChannelIndex: 0,
  deckTapAmount: 0.75,   // gig-fix: was 1.0 — tap is ALREADY hitting a
                         // bus with echo+spring+feedback; full deck into
                         // it stacks on top of the dry mix and overloads
                         // the return. 0.75 = -2.5 dB lands cleanly.
  throwBeats: 0.5,
  sirenFeedback: 0.85,
  filterDropHz: 220,
  // BPM-sync defaults: both off. User opts in via the Dub Bus panel for
  // locked-to-the-groove behavior. Defaulting sync on caused confusion in
  // first-time UX where the tracker transport BPM (e.g. 120) didn't match
  // the DJ deck's BPM (e.g. 140) — echoes felt "off" until the user
  // realized they had to pick a sync division explicitly.
  echoSyncDivision: 'off',
  throwQuantize: 'off',

  // Coloring defaults — mild Tubby shelf out of the box so the bus has
  // some inherent dub character, mid scoop off (engaged per preset),
  // neutral stereo width. User picks a CHARACTER to load the full voicing.
  //
  // Bass shelf at 80 Hz (deep sub), not 200 Hz (which was boxy low-mid mud).
  // Real dub weight comes from sub fundamentals — 200 Hz just clouds the mids.
  // Q 0.9 keeps the shelf tight so it doesn't bleed into 300-400 Hz.
  bassShelfGainDb:  2,
  bassShelfFreqHz:  80,
  bassShelfQ:       0.9,
  midScoopGainDb:   0,
  midScoopFreqHz:   700,
  midScoopQ:        1.4,
  stereoWidth:      1.0,
  characterPreset:  'custom',

  glueBypass:       false,
  re201DelayMode:   7,     // H1+reverb — stock RE-201 default
  sirenPreset:      'rasta' as const,
  hpfStepped:       false,
  hpfResonanceDb:   0,
  pingPongLMs:          337,   // ~3/8 note at 120 BPM
  pingPongRMs:          450,   // ~1/2 note at 120 BPM
  pingPongFeedback:     0.45,
  pingPongWet:          0.65,
  pingPongSyncToBpm:    false,
  sweepAmount:      0,
  sweepRateHz:      0.15,
  sweepDepthMs:     4,
  sweepFeedback:    0.72,
  tapeSatMode:      'single',
  echoMode:         4,        // H2+H3 — classic dub two-tap timing
  echoFeedbackHpfHz: 350,   // was 250 — more low-end cleanup each repeat pass
  echoFeedbackLpfHz: 4000,
  plateStage:       'off',
  plateStageMix:    0.35,

  // Return EQ — active with air shelf by default. Tape sat + dark feedback LPF
  // absorb high frequencies; +2 dB shelf at 8 kHz restores presence without
  // brightness. Band 2 (sweepable peak) stays flat until the user engages it.
  returnEqEnabled:  true,
  returnEqFreq:     800,
  returnEqGain:     0,      // band 2 flat — the performance sweep knob
  returnEqQ:        2.0,
  returnEqB1Freq:   100,
  returnEqB1Gain:   0,
  returnEqB1Q:      0.7,
  returnEqB3Freq:   2500,   // low presence band
  returnEqB3Gain:   0,
  returnEqB3Q:      0.7,
  returnEqB4Freq:   8000,
  returnEqB4Gain:   2.5,   // air shelf: restores sparkle the tape/echo steals
  returnEqB4Q:      0.7,
  returnEqHpEnabled: false,
  returnEqHpFreq:    20,
  returnEqHpQ:       0.7,
  returnEqLpEnabled: false,
  returnEqLpFreq:    20000,
  returnEqLpQ:       0.7,

  // Sweep mode — comb by default (backwards compat).
  sweepMode:        'comb',
  phaserRate:       0.3,
  phaserDepth:      0.7,
  phaserStages:     6,
  phaserFeedback:   0.5,

  postEchoSatEnabled: false,
  postEchoSatDrive:   0.35,

  ringModEnabled:   false,
  ringModFreq:      440,
  ringModWaveform:  0,     // sine
  ringModMix:       0.5,
  ringModAmount:    0,

  lofiEnabled:      false,
  lofiBits:         16,    // full quality = effectively off

  extFeedbackGain:    0,      // off by default
  extFeedbackEqFreq:  1000,   // 1kHz center
  extFeedbackEqGain:  0,      // flat
  extFeedbackEqQ:     1.5,    // moderate bandwidth

  clubSimEnabled:     false,
  clubSimPreset:      'soundSystem',
  clubSimMix:         0.15,   // subtle — just adds room character

  chainOrder:         'echoSpring',

  autoEqStrength:   0.85,
  autoEqLastGenre:  '',
};

/** The 11 stepped positions of the Altec 9069B filter, per audiothing.net/
 *  pasttofuturereverbs.gumroad.com. Discrete positions the original unit
 *  clicked through — reproducing this is what gives the "Big Knob" sweep
 *  its characteristic rhythmic staccato. */
export const ALTEC_HPF_STEPS = [70, 100, 150, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000] as const;

/** Snap a frequency to the nearest Altec step (log-spaced). */
export function snapToAltecStep(hz: number): number {
  let nearest: number = ALTEC_HPF_STEPS[0];
  let best = Math.abs(Math.log(hz) - Math.log(nearest));
  for (const step of ALTEC_HPF_STEPS) {
    const d = Math.abs(Math.log(hz) - Math.log(step));
    if (d < best) { best = d; nearest = step; }
  }
  return nearest;
}

// ─── Engineer character presets ─────────────────────────────────────────────
// Each preset snapshots the coloring params + echo + spring for a signature
// dub engineer voicing. See research doc
// thoughts/shared/research/2026-04-20_dub-sound-coloring.md for the sourcing
// behind each value (console, reverb type, quoted rules).
//
// Triggered via setDubBus({ characterPreset: 'tubby' | ... }) — the mirror
// effect in the bus consumer merges the preset's fields over current
// settings. Only the fields each preset is *defining* are listed; other
// params (return gain, sidechain amount) stay at user setting.

export interface DubCharacterPreset {
  label: string;
  description: string;
  overrides: Partial<DubBusSettings>;
  // Non-settings params (spring params + character flags) are applied
  // directly to the bus by DubBus.applyCharacterPreset().
  springsLength?: number;
  springsDamp?: number;
  springsChaos?: number;
  springsScatter?: number;
  springsTone?: number;
  tapeSatDrive?: number;  // 0..1 — TapeSat WaveShaper curve drive
  /** Default channel send levels applied when this preset is selected.
   *  Keyed by inferred channel role. 'default' is the fallback for any
   *  channel whose name doesn't match a known role. Applied to ALL visible
   *  channels on preset load — gives the bus audio to process immediately. */
  defaultSendsByRole?: {
    percussion?: number;
    bass?: number;
    lead?: number;
    chord?: number;
    arpeggio?: number;
    pad?: number;
    default: number;
  };
  /** Per-channel PerChannelDubFx settings applied when this preset loads.
   *  Keyed by channel role. 'default' is the fallback. */
  perChannelFxByRole?: {
    percussion?: ChannelFxConfig;
    bass?: ChannelFxConfig;
    lead?: ChannelFxConfig;
    chord?: ChannelFxConfig;
    arpeggio?: ChannelFxConfig;
    pad?: ChannelFxConfig;
    skank?: ChannelFxConfig;
    default?: ChannelFxConfig;
  };
}

export interface ChannelFxConfig {
  filterMode: 'off' | 'hpf' | 'lpf';
  filterHz?: number;
  reverbSend: number;
  sweepAmount: number;
  sweepRateHz?: number;
  sweepDepthMs?: number;
  sweepFeedback?: number;
}

export const DUB_CHARACTER_PRESETS: Record<Exclude<DubBusSettings['characterPreset'], 'custom'>, DubCharacterPreset> = {
  tubby: {
    label: 'King Tubby',
    description: 'Dark, noisy, loose-spring. Stepped filter + tape-echo feedback. Narrow stereo. Light bus compression.',
    overrides: {
      returnGain:     0.75,  // heavy bus presence — Tubby is LOUD
      hpfCutoff:      65,   // was 100 — lower to let sub-bass breathe
      hpfStepped:     true,   // the "Big Knob" rhythmic staccato sweeps
      hpfResonanceDb: 2.5,    // Altec 9069B T-network resonant hump — the "voice" of the filter
      bassShelfGainDb: 9, bassShelfFreqHz: 60,  bassShelfQ: 0.9,  // was 85Hz — lower shelf = true sub depth
      midScoopGainDb:  0,
      echoIntensity:  0.65,   // more repeats — Tubby's signature multi-tap
      echoRateMs:     300,
      echoWet:        0.80,
      springWet:      0.50,   // reduced from 0.60 — prevents echo+spring stacking
      sidechainAmount: 0.3,
      stereoWidth:    0.45,  // narrow — 4-track console + loose spring
      sweepAmount:    0,      // no flanger; Tubby's "sweep" was filter, not comb
      tapeSatMode:   'single',
      echoFeedbackHpfHz: 180,  // was 250 — let more low-end survive echo repeats
      echoFeedbackLpfHz: 5500, // was 3000 — brighter echo tails, less "in a jar"
      re201DelayMode: 7,       // H1+H2+H3 (three-tap) — was mode 9 (H2+H3+reverb) which caused
                               // an init beep from the RE-201's internal spring settling.
                               // Aelapse provides the spring separately; no need for double spring.
      echoEngine:    're201',     // Tubby's MCI → RE-201 signal chain
      chainOrder:    'springEcho', // spring FIRST: same fix as Perry — prevents
                                    // each RE-201 repeat from adding new spring tail
      // Tubby's return EQ — meant to be swept by hand during performance, not left on.
      // Keeping it enabled at a fixed frequency created a constant 700Hz "beep".
      // User can enable + sweep manually via DubBusPanel.
      returnEqEnabled: false,
      returnEqFreq:   700,
      returnEqGain:   3,
      returnEqQ:      1.5,
    },
    springsLength: 0.35, springsDamp: 0.35, springsChaos: 0.20, springsScatter: 0.60, springsTone: 0.65,
    tapeSatDrive:  0.55,
    // Tubby's style: everything through the bus, loud. Drums + bass dominate;
    // melodic lines get heavy echo throws; nothing stays dry.
    defaultSendsByRole: { percussion: 1.0, bass: 0.85, lead: 0.70, chord: 0.60, arpeggio: 0.60, pad: 0.50, default: 0.55 },
    // Percussion gets the signature liquid comb sweep. Bass stays completely
    // dry (no filter, no reverb — it competes with the bass shelf). Leads get
    // a gentle HPF to prevent mud buildup during echo throws.
    perChannelFxByRole: {
      percussion: { filterMode: 'hpf', filterHz: 150, reverbSend: 0.0, sweepAmount: 0.75, sweepRateHz: 0.08, sweepDepthMs: 4.0, sweepFeedback: 0.70 },
      bass:       { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.0 },
      lead:       { filterMode: 'hpf', filterHz: 200, reverbSend: 0.0, sweepAmount: 0.50, sweepRateHz: 0.15, sweepDepthMs: 5.0, sweepFeedback: 0.65 },
      chord:      { filterMode: 'hpf', filterHz: 120, reverbSend: 0.0, sweepAmount: 0.40, sweepRateHz: 0.10, sweepDepthMs: 3.0, sweepFeedback: 0.60 },
      skank:      { filterMode: 'hpf', filterHz: 120, reverbSend: 0.0, sweepAmount: 0.55, sweepRateHz: 0.12, sweepDepthMs: 4.0, sweepFeedback: 0.65 },
      arpeggio:   { filterMode: 'hpf', filterHz: 180, reverbSend: 0.0, sweepAmount: 0.35, sweepRateHz: 0.15, sweepDepthMs: 4.5, sweepFeedback: 0.62 },
      pad:        { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.0 },
      default:    { filterMode: 'hpf', filterHz: 150, reverbSend: 0.0, sweepAmount: 0.45, sweepRateHz: 0.12, sweepDepthMs: 3.5, sweepFeedback: 0.65 },
    },
  },
  scientist: {
    label: 'Scientist',
    description: 'Bright, dry, precise. Plate not spring. ZERO bus compression. Extreme mid-scoop on drops.',
    overrides: {
      returnGain:     0.65,
      hpfCutoff:       50,   // was 80 — more sub-bass room
      glueBypass:      true,   // research: "try mastering a song with compression" — he rejected ALL bus comp
      hpfStepped:      false,
      bassShelfGainDb: 1,     // drier low end vs Tubby
      midScoopGainDb: -10, midScoopFreqHz: 700, midScoopQ: 1.6,  // deeper signature scoop
      echoIntensity:  0.35,   // drier — Scientist's hallmark precision
      echoRateMs:     280,
      echoWet:        0.55,
      springWet:      0.40,   // plate decays faster than spring; less wet
      sidechainAmount: 0.7,   // more pumping to compensate for no bus comp
      stereoWidth:    1.4,
      sweepAmount:    0,
      tapeSatMode:   'single',
      echoFeedbackHpfHz: 300,   // research spec: tighter HPF — Scientist's precise, dry repeats
      echoFeedbackLpfHz: 5000,  // research spec: brighter tail — plate, not spring
      echoEngine:    'spaceEcho',  // Scientist used clean digital delays
    },
    springsLength: 0.55, springsDamp: 0.25, springsChaos: 0.40, springsScatter: 0.40, springsTone: 0.70,
    tapeSatDrive:  0.20,
    // Scientist: selective — melodics get the most echo, bass controlled,
    // drums moderate. The mid-scoop drop only bites when leads are routed in.
    defaultSendsByRole: { percussion: 0.70, bass: 0.60, lead: 0.80, chord: 0.50, arpeggio: 0.55, pad: 0.40, default: 0.45 },
    // No comb sweep (antithetical to precision). "Dry" means minimal direct
    // spring sends — Scientist's reverb should come from the echo decay, not
    // constant spring saturation. Leads get a touch of plate air; everything
    // else stays analytical and clean.
    perChannelFxByRole: {
      percussion: { filterMode: 'hpf', filterHz: 200, reverbSend: 0.0,  sweepAmount: 0.0 },
      bass:       { filterMode: 'lpf', filterHz: 800, reverbSend: 0.0,  sweepAmount: 0.0 },
      lead:       { filterMode: 'hpf', filterHz: 250, reverbSend: 0.25, sweepAmount: 0.0 },
      chord:      { filterMode: 'off', filterHz: 200, reverbSend: 0.0,  sweepAmount: 0.0 },
      skank:      { filterMode: 'hpf', filterHz: 250, reverbSend: 0.10, sweepAmount: 0.0 },
      arpeggio:   { filterMode: 'hpf', filterHz: 220, reverbSend: 0.20, sweepAmount: 0.0 },
      pad:        { filterMode: 'off', filterHz: 200, reverbSend: 0.15, sweepAmount: 0.0 },
      default:    { filterMode: 'hpf', filterHz: 180, reverbSend: 0.0,  sweepAmount: 0.0 },
    },
  },
  perry: {
    label: 'Lee "Scratch" Perry',
    description: 'Stacked tape saturation. Near-mono. Kickable spring with high chaos. Dark shelf, subtractive air. Phaser-like comb sweep on parallel send.',
    overrides: {
      returnGain:     0.90,  // crushed, dominant bus
      hpfCutoff:       40,
      hpfStepped:      false,
      bassShelfGainDb: 2, bassShelfFreqHz: 80, bassShelfQ: 0.5,
      midScoopGainDb: -4, midScoopFreqHz: 800,
      echoIntensity:  0.55,   // was 0.72 — high feedback with springEcho = rolling forever
      echoRateMs:     380,
      echoSyncDivision: '1/4T', // research: Perry used triplet-feel echoes against the riddim
      echoWet:        0.80,
      springWet:      0.38,   // was 0.55 — spring before echo was accumulating per repeat
      sidechainAmount: 0.4,
      stereoWidth:    0.25,  // near-mono — Perry's defining texture
      // Perry had actual phasers (Mutron Bi-Phase, Eventide, MXR Phase 90)
      // on guitars and vocals. True phaser mode with all-pass cascade.
      sweepAmount:    0.50,
      sweepMode:      'phaser',
      phaserRate:     0.15,   // slow, Space Echo wow territory
      phaserDepth:    0.8,
      phaserStages:   8,      // Mutron Bi-Phase is 6-stage; 8 for extra depth
      phaserFeedback: 0.65,
      tapeSatMode:    'stack', // 3 parallel tape paths ≈ 4-track bouncing
      echoFeedbackHpfHz: 150,   // was 200 — more bass survives each repeat
      echoFeedbackLpfHz: 3200,  // was 2000 (extremely dark) — still tape-warm but not muffled
      // Research: "Space Echo output patched back into a second TEAC input →
      // semi-manual feedback loop." The extFeedback loop recreates this —
      // return audio re-enters the input chain through a peaking EQ, creating
      // the self-feeding chaos that defined Perry's Black Ark sound.
      extFeedbackGain:   0.06,  // re-enabled at safe level — Black Ark self-feeding character
      extFeedbackEqFreq: 400,   // boost at 400 Hz — the tape-saturation warmth zone
      extFeedbackEqGain: 3,     // gentle 3 dB lift per pass — accumulates over repeats
      extFeedbackEqQ:    1.2,
      echoEngine:    'anotherDelay', // Perry's runaway wow-flutter madness
      chainOrder:    'springEcho',   // spring FIRST: reverb cloud feeds the echo,
                                      // so repeats decay cleanly instead of adding
                                      // new reverb tail to each repeat
    },
    springsLength: 0.65, springsDamp: 0.20, springsChaos: 0.85, springsScatter: 0.85, springsTone: 0.45,
    tapeSatDrive:  0.70,   // per-path drive; stack provides total character
    // Perry: maximum chaos — everything bleeds. He literally had nothing dry.
    // The self-feeding ext-feedback loop needs all channels routed through.
    defaultSendsByRole: { percussion: 1.0, bass: 0.95, lead: 0.90, chord: 0.85, arpeggio: 0.85, pad: 0.80, default: 0.85 },
    // No filters — Perry's philosophy was "everything through, nothing dry."
    // reverbSend is 0 — Perry's reverb comes from the echo→spring chain (chainOrder: springEcho),
    // not from direct per-channel spring taps. Constant direct sends created a rolling reverb bed.
    // Phaser sweep is present but moderate — too high across all channels stacks into a wash.
    perChannelFxByRole: {
      percussion: { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.40, sweepRateHz: 0.12, sweepDepthMs: 6.0, sweepFeedback: 0.65 },
      bass:       { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.35, sweepRateHz: 0.10, sweepDepthMs: 5.5, sweepFeedback: 0.62 },
      lead:       { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.45, sweepRateHz: 0.15, sweepDepthMs: 6.0, sweepFeedback: 0.68 },
      chord:      { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.40, sweepRateHz: 0.12, sweepDepthMs: 6.0, sweepFeedback: 0.65 },
      skank:      { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.42, sweepRateHz: 0.13, sweepDepthMs: 6.0, sweepFeedback: 0.66 },
      arpeggio:   { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.40, sweepRateHz: 0.14, sweepDepthMs: 5.5, sweepFeedback: 0.65 },
      pad:        { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.30, sweepRateHz: 0.08, sweepDepthMs: 5.0, sweepFeedback: 0.60 },
      default:    { filterMode: 'off', filterHz: 80,  reverbSend: 0.0, sweepAmount: 0.38, sweepRateHz: 0.12, sweepDepthMs: 5.5, sweepFeedback: 0.64 },
    },
  },
  gatedFlanger: {
    label: 'Gated Flanger',
    description: 'Gated-reverb + heavy liquid-sweep combo. Snappy reverb tail chopped short, aggressive flanger on returns. The "80s dub" voicing that sits between classic and modern.',
    overrides: {
      returnGain:     0.80,
      hpfCutoff:      60,
      hpfStepped:     false,
      bassShelfGainDb: 2, bassShelfFreqHz: 90,
      midScoopGainDb:  0,
      echoIntensity:  0.55,
      echoRateMs:     250,
      echoWet:        0.7,
      springWet:      0.35,   // gated — short
      sidechainAmount: 0.5,
      stereoWidth:    1.3,
      sweepAmount:    0.65,   // heavy flanger on returns
      sweepRateHz:    0.4,
      sweepDepthMs:   7,
      sweepFeedback:  0.80,
      tapeSatMode:   'single',
      echoEngine:    'reTapeEcho',  // BBD character for 80s dub
    },
    springsLength: 0.25, springsDamp: 0.65, springsChaos: 0.15, springsScatter: 0.30, springsTone: 0.68,
    tapeSatDrive:  0.35,
    // Gated Flanger: aggressive but controlled. Heavy on percussion for the
    // gated-reverb snap; pads get the flanger treatment.
    defaultSendsByRole: { percussion: 0.85, bass: 0.55, lead: 0.60, chord: 0.65, arpeggio: 0.55, pad: 0.75, default: 0.55 },
    // Jammy-style minimalism: extremely selective routing, tight HPFs.
    // Only lead and pad get any reverb. Bass gets LPF to stay clean.
    perChannelFxByRole: {
      percussion: { filterMode: 'hpf', filterHz: 80,  reverbSend: 0.0,  sweepAmount: 0.0 },
      bass:       { filterMode: 'lpf', filterHz: 600, reverbSend: 0.15, sweepAmount: 0.0 },
      lead:       { filterMode: 'hpf', filterHz: 120, reverbSend: 0.40, sweepAmount: 0.0 },
      chord:      { filterMode: 'off', filterHz: 200, reverbSend: 0.0,  sweepAmount: 0.0 },
      skank:      { filterMode: 'off', filterHz: 200, reverbSend: 0.0,  sweepAmount: 0.0 },
      arpeggio:   { filterMode: 'off', filterHz: 200, reverbSend: 0.0,  sweepAmount: 0.0 },
      pad:        { filterMode: 'off', filterHz: 200, reverbSend: 0.30, sweepAmount: 0.0 },
      default:    { filterMode: 'hpf', filterHz: 100, reverbSend: 0.0,  sweepAmount: 0.0 },
    },
  },
  madProfessor: {
    label: 'Mad Professor',
    description: 'Hi-fi clarity. Low shelf + high shelf air. Wide ping-pong stereo. Lush long springs.',
    overrides: {
      returnGain:     0.70,
      hpfCutoff:       35,
      hpfStepped:      false,
      bassShelfGainDb: 5, bassShelfFreqHz: 70, bassShelfQ: 0.7,  // deeper rumble lift
      midScoopGainDb:  0,
      echoIntensity:  0.38,   // cleaner, fewer repeats
      echoRateMs:     360,
      echoWet:        0.55,
      springWet:      0.68,   // lusher long springs
      sidechainAmount: 0.5,
      stereoWidth:    1.9,    // ultra-wide Ariwa ping-pong
      sweepAmount:    0,
      tapeSatMode:   'single',
      echoFeedbackHpfHz: 400,   // research spec: cleaner HPF — Mad Prof hi-fi clarity
      echoFeedbackLpfHz: 8000,  // research spec: bright, articulate repeats — Lexicon PCM-70 character
      pingPongLMs:          337,    // research: Ariwa SDE-3000 ran 3/8 note left
      pingPongRMs:          450,    // research: Ariwa SDE-3000 ran 1/2 note right
      pingPongFeedback:     0.50,
      pingPongWet:          0.70,
      pingPongSyncToBpm:    true,   // auto-follows song BPM — always metrically correct
      echoEngine:    're201',       // Ariwa studio's RE-201 for lush tape + spring
    },
    springsLength: 0.55, springsDamp: 0.28, springsChaos: 0.10, springsScatter: 0.55, springsTone: 0.72,
    tapeSatDrive:  0.12,   // pristine
    // Mad Professor: balanced and lush. Pads and leads get the most reverb
    // (ghostReverb/madProfPingPong); drums are present but not dominant.
    defaultSendsByRole: { percussion: 0.65, bass: 0.60, lead: 0.70, chord: 0.70, arpeggio: 0.65, pad: 0.80, default: 0.60 },
    // No comb sweep (width comes from ping-pong, not flanger). Pads + bass get
    // the highest direct spring reverb send — "sub bass in reverb" is the
    // definitive Mad Prof texture. Leads swim in lush plate decay.
    perChannelFxByRole: {
      percussion: { filterMode: 'hpf', filterHz: 80,  reverbSend: 0.0,  sweepAmount: 0.0 },
      bass:       { filterMode: 'off', filterHz: 80,  reverbSend: 0.80, sweepAmount: 0.0 },
      lead:       { filterMode: 'hpf', filterHz: 150, reverbSend: 0.75, sweepAmount: 0.0 },
      chord:      { filterMode: 'hpf', filterHz: 120, reverbSend: 0.65, sweepAmount: 0.0 },
      skank:      { filterMode: 'hpf', filterHz: 130, reverbSend: 0.55, sweepAmount: 0.0 },
      arpeggio:   { filterMode: 'hpf', filterHz: 140, reverbSend: 0.60, sweepAmount: 0.0 },
      pad:        { filterMode: 'off', filterHz: 80,  reverbSend: 0.90, sweepAmount: 0.0 },
      default:    { filterMode: 'hpf', filterHz: 100, reverbSend: 0.50, sweepAmount: 0.0 },
    },
  },
};

// ─── Phase 1: dub lane + event types ──────────────────────────────────────
// Per-pattern automation: dub moves performed live (or written offline in
// the lane editor) are serialised as DubEvents and replayed by DubLanePlayer
// on each tracker tick. See:
//   thoughts/shared/plans/2026-04-19-tracker-dub-studio-phase-1-plan.md

/** Quantize modes — shared between Echo Throw's snap-to-grid behavior and
 *  future moves. 'off' fires immediately; everything else snaps to the next
 *  corresponding beat subdivision boundary relative to transport.currentBeat. */
export type QuantizeMode = 'off' | '1/16' | '1/8' | 'offbeat' | 'bar';

/** A single recorded dub move. Lives on the pattern's dubLane.events[].
 *  Stored sorted by `row` (row-mode lanes) or `timeSec` (time-mode lanes)
 *  so DubLanePlayer can advance a cursor in O(1)/tick. */
export interface DubEvent {
  /** Stable uuid — survives edits so the lane editor can reference events. */
  id: string;
  /** Move registry key — 'echoThrow' today; 'dubStab', 'channelMute', … in later phases. */
  moveId: string;
  /** Target channel (0-based). For row-mode lanes: tracker channel. For time-mode
   *  lanes (raw SID / SC68): SID voice 0–2, or undefined for global moves. */
  channelId?: number;
  /** Quantized row within pattern (float — fractional for sub-row placement).
   *  Used by row-mode lanes. Ignored (kept as 0) for time-mode lanes. */
  row: number;
  /** Song-time position in seconds from song start. Only set on events in
   *  time-mode lanes (raw SID, SC68, etc. — formats with no structured pattern).
   *  When present, `row` is ignored and `DubLanePlayer.onTimeTick` schedules
   *  this event instead of the row-based cursor. */
  timeSec?: number;
  /** For hold-style moves: filled on release. Undefined = trigger/one-shot.
   *  Row-mode: fractional rows. */
  durationRows?: number;
  /** Hold duration in seconds — time-mode lanes. */
  durationSec?: number;
  /** Move-specific params — e.g. echoThrow: { throwBeats, feedbackBoost }. */
  params: Record<string, number>;
  /** Kept so the lane editor can re-quantize later without losing user intent. */
  sourceQuantize?: QuantizeMode;
}

/** Per-pattern dub lane. `enabled: false` mute/solos the whole lane so the
 *  user can audition the naked song (and still perform moves live on top).
 *
 *  Two kinds:
 *    - 'row' (default, back-compat): events are row-indexed, replayed by the
 *      tracker tick loop. All editable formats use this.
 *    - 'time': events are seconds-indexed from song start, replayed by a
 *      rAF driver. Used for raw SIDs, SC68/SNDH, and other formats with no
 *      structured pattern data — the user can still perform dub moves on
 *      top of register-level emulation and have them recorded/edited. */
export interface DubLane {
  enabled: boolean;
  events: DubEvent[];
  /** Lane mode. Absent or 'row' = row-indexed (tracker formats). */
  kind?: 'row' | 'time';
  /** For time-mode lanes only: song duration in seconds if known (e.g. SID
   *  metadata length). Used by the timeline UI to scale the axis. Lanes can
   *  still hold events past this duration — it's purely a display hint. */
  durationSec?: number;
}
