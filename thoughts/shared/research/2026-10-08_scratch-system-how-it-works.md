---
date: 2026-10-08
topic: How DEViLBOX's scratch system works today, how the Up Rough Demo System's turntablist generator works, and what a DEViLBOX "scratch DJ" could take from it
tags: [scratch, turntablism, dj, auto-dj, research, up-rough-demo-system, samples]
status: final
---

# Scratch systems: DEViLBOX today vs the Up Rough turntablist generator

Audience: a music-theory / turntablism reviewer who cannot see the code. Everything below is
read from source; where something could not be confirmed it is marked "UNCONFIRMED" with where
I looked. Both projects belong to the same owner. Nothing was run; this is a code reading.

Terms used (brief):

- **Record / platter**: the vinyl being moved by hand. Its speed is the playback speed of the sample; negative speed is playing it backwards.
- **Crossfader / fader**: the mixer control that opens and closes the sound. A "cut" is closing it for a few milliseconds.
- **Baby scratch**: push-pull of the record with the fader open. **Stab / cut**: one short burst, usually forward, fader closed on the return. **Chirp**: baby scratch with the fader closed at each change of direction, giving a bird-like note. **Transformer**: the record plays forward while the fader is chopped rhythmically. **Flare**: one stroke of the record with the fader clicked shut one or more times (2-click, 3-click flare). **Orbit**: a flare on the forward stroke and again on the backward stroke. **Crab**: record plays on while the fingers tap the fader rapidly (8-finger crab: both hands). **Scribble / uzi**: a very fast, very small baby scratch. **Tear**: a stroke split in two by a brief rest. **Hydroplane**: a finger drags on the record while it moves, giving a fluttering speed. **Drag**: slow movement, pitch drops. **Tweak**: speed of a free-spinning record altered up and down like a melody. **Laser**: a hard hit that decays in pitch. **Beat juggling**: rebuilding a rhythm from two copies of one break on two decks.
- **Step**: one sixteenth note. At 92 BPM a step is about 163 ms and a beat about 652 ms. At 125 BPM a step is 120 ms and a beat 480 ms.

---

## Part 1 - DEViLBOX's scratch system as it is

### 1.1 Two separate systems share one set of patterns

1. **DJ deck scratch** (decks A, B, C). A deck holds either an audio file (audio mode) or a tracker module (tracker mode). Scratching moves the deck's playback speed and direction. Entry point: `DeckEngine` (per deck), with the pattern player `ScratchPlayback` owned by each deck.
2. **Tracker-view scratch** (the pattern editor, no DJ mode needed). A physical turntable model drives a ring buffer of the tracker's own output. Entry point: `TrackerScratchController` (one shared instance). The built-in patterns here are used for their FADER data only (see 1.7).

Both read the same list of 19 built-in patterns, `SCRATCH_PATTERNS`.

### 1.2 How a scratch moves the audio

**Ring-buffer design (both systems).** An AudioWorklet (`scratch-buffer.worklet.js`) continuously records the deck's (or tracker's) output into a ring buffer of **120 seconds**, stereo, one ring per deck (ids 0/1/2 = decks A/B/C, 3 = tracker). A second processor reads that ring at a **signed rate** (positive forward, negative backward) with 4-point cubic Hermite interpolation, a 5 ms one-pole rate smoother (`RATE_SMOOTH_SEC = 0.005`) and a 48-sample (about 1 ms) fade when the rate crosses zero. Gain on and off is a 3 ms linear ramp. Capture is frozen while a scratch plays so the ring is a fixed tape.

**DJ deck, pattern scratch (the built-in patterns).** Rate is applied to two paths depending on direction:

- Forward phase (velocity > 0): the REAL source plays live at that rate. Audio mode sets `audioPlayer.setPlaybackRate(v)`; tracker mode sets both the replayer's tempo multiplier and pitch multiplier to `v` (so tempo and pitch move together, like a record). Minimum forward rate 0.02.
- Backward phase (velocity < 0): the live source is muted (deck gain 0, source rate set to 0.001, i.e. held in place) and the ring buffer is read backwards from the write position (the "needle") at `|v|`. On returning forward the ring stops, capture is unfrozen, deck gain ramps back to 1 in 2 ms, and the source continues from the position where it was held.
- Dead zone: `|v| < 0.02` holds the current direction at rate 0.02.
- Velocity is clamped to [-4, +4] (`setScratchVelocity`). Two patterns ask for 5.0 (Laser, Phaser) and are therefore silently clamped to 4.0.
- Consequence for the musician: the song only advances during forward phases. A backward phase replays audio already heard, then the forward phase carries on from the held position. There is no cue point, no "home" spot on the record, and the scratch does not return to a start position. On pattern stop there is NO seek back: "let the music continue" (comment in `_endPatternScratch`).

**DJ deck, jog / touch scratch (a hand on the virtual platter).** Same two paths, but velocity comes from a physical platter model and the direction switch has a **20 ms cooldown** (`JOG_DIR_SWITCH_COOLDOWN_MS`) with a minimum rate of 0.15 while cooling down. Backward displacement is integrated (previous rate x elapsed time) and on the switch to forward the source is **seeked** to `backwardStart - displacement`. A forward push on a stopped deck starts it; release pauses it. On release the rate decays to the pitch-slider "rest" value over 200 ms (cubic ease-out), gains are hard-reset 50 ms later, and, if quantize is on and the other deck is playing with a beat grid, the deck is phase-aligned back to the beat grid 350 ms after the decay (`phaseAlign`, beat or bar mode).

**Slip mode.** If enabled on an audio deck, the position the track "would have" reached is tracked (`slipGhostPosition` + elapsed x rate) and snapped back to on release.

**Tracker-view scratch.** On entering scratch the live tracker output is muted instantly, the replayer is crawled (tempo and pitch multiplier 0.001), note processing is suppressed, native WASM players (libopenmpt, UADE, etc.) are paused, and ALL audio comes from the ring buffer at the rate computed by the platter physics. The pattern view follows the scratch (1.8). On exit: resync the scheduler to "now" first, restore tempo and pitch 1.0, restore the prior note-suppression value (not force false; see 1.9), restore full-output gain, resume the native engines, then a **150 ms** crossfade (ring buffer out, live tracker in).

**Platter physics (`TurntablePhysics`, pure maths).** Technics SL-1200-style two-body model: a motor platter servo-driven to 33 1/3 RPM (3.49 rad/s) and a record on a slipmat. Hand on record = near-rigid grip (coupling 80); hand released = the record re-couples over about 0.6 s (`RELEASE_RAMP_SEC`). Max rate 4.0. Slipmat coupling: kinetic 3.5, static 8.0, breakaway threshold 0.15 rad/s. Special manoeuvres: spinback (brake torque 0.30, reverse capped at 1.0x, motor gain x2.5), power cut (platter coasts, friction x0.075) and electronic brake. Inputs: 2-finger trackpad scroll (velocity control), 3-finger touch grab, MIDI jog touch + spin (relative CC 0-63 forward, 65-127 backward; touching = direct velocity, else a nudge impulse), and the DJ deck's vinyl view (`DeckVinylView`) which runs the same physics each animation frame and forwards the rate to the deck.

### 1.3 The 19 built-in patterns

A pattern = a looping list of **frames**: (position in the cycle, platter velocity, fader gain). Position is a fraction of the cycle. Velocity can be linearly interpolated between frames (`interpolateVelocity`). **Fader gain is a step function, never interpolated** (sharp cuts). `trueReverse: false` means negative velocity is mapped to `abs(velocity)`: the record never goes backwards, only varies in speed. Cycle length = `durationBeats` x 60000 / effective BPM. All 19 have `quantize: false`.

Velocity key: 1.0 = normal speed, 2.0 = octave up, 0.5 = octave down, negative = backward. "F" = fader (1 open, 0 closed). Times are fractions of the cycle.

| # | Name | Cycle (beats) | Motion and fader (exact frames) |
|---|------|------|------|
| 0 | Baby Scratch | 1 | trueReverse false (forward-only speed wobble). Velocity 0.2 -> 0.8 -> 2.4 (peak at 0.20) -> 0.8 -> 0.2 at 0.40, then again 0.8 -> 1.8 (peak at 0.60) -> 0.8 -> 0.2 at 0.80. F closed at 0, 0.40, 0.80; open from 0.04, 0.44 |
| 1 | Transformer | 1 | Constant velocity 1.0. Fader chopped by AudioParam: 4 chops per beat, open the first 40% of each chop, 3 ms ramps |
| 2 | Flare | 1 | Interpolated. Forward stroke 0 -> 2.2 (at 0.10) with two clicks (F closed 0.15-0.19 and 0.33-0.37, velocity falling 2.2 -> 1.5); backward stroke 0.50 stop, -1.0 at 0.65, -0.3 at 0.90, fader open throughout. Direction changes happen with fader OPEN |
| 3 | Hydroplane | 1 | trueReverse false, interpolated, fader always open. Velocity 1.0 / 0.15 / 1.1 / 0.15 / 1.0 / 0.2 / 1.0 / 0.25 at 0, .14, .26, .38, .50, .62, .74, .86 (alternating push and resistance, four dips per beat) |
| 4 | Crab | 1 | Constant velocity 1.0. Fader: 4 taps per beat, open 28% of each tap |
| 5 | Orbit | 1 | Interpolated. Forward: 0 -> 2.2 (at .12), one click F closed .20-.24, -> 0.5 at .42. Backward: 0 at .50, -1.2 at .62, one click F closed .70-.74, -> -0.3 at .92. Same click on both strokes |
| 6 | Chirp | 0.25 | Interpolated. F CLOSED at the direction changes (0 and 0.50), open between: velocity 0 -> 0.5 (.06) -> 2.0 (.25) -> 0.3 (.44, F closes) ; 0 (.50) -> -0.3 (.56) -> -1.2 (.75) -> -0.3 (.94, F closes) |
| 7 | Stab | 0.5 | Two frames, not interpolated: velocity 2.5 with F open for the first half; velocity -1.0 with F closed (silent rewind) for the second half |
| 8 | Scribble | 0.25 | trueReverse false, interpolated. Velocity alternates 1.5 / 0.3 every eighth of the cycle (four cycles of 1.5-0.3 inside a sixteenth). Fader open |
| 9 | Tear | 1 | Interpolated. 0 (F closed) -> 0.5 (.03, F opens) -> 2.0 (.12) -> 0 at .25 and .32 (the rest, audible) -> 2.0 (.45) -> 0.3 (.53, F closes) -> -0.3 (.58, F opens) -> -1.2 (.70) -> 0 (.90, F closes) |
| 10 | Uzi | 0.125 | trueReverse false, interpolated, velocity alternates 1.4 / 0.6 every eighth of the cycle. Fader open |
| 11 | Twiddle | 1 | Interpolated. Baby-like stroke with three fader clicks per stroke at uneven spacing (forward: closed .09-.12, .18-.21, .30-.33; backward: .59-.62, .68-.71, .80-.83). Peak velocities 2.2 forward, -1.2 backward |
| 12 | 8-Finger Crab | 1 | Constant velocity 1.0. Fader: 8 taps per beat, open 20% of each |
| 13 | 3-Click Flare | 1 | As Flare but three clicks on the forward stroke (closed .09-.12, .18-.21, .28-.31); backward stroke smooth, F open |
| 14 | Laser | 0.25 | Interpolated. Velocity 5.0 (clamped to 4) -> 2.5 (.20) -> 0.8 (.40) -> 0.2 (.60) -> -1.0 with F closed at .73 (silent rewind) |
| 15 | Phaser | 0.25 | As Laser but stops dead: 5.0 -> 2.0 (.17) -> 0 (.29, .46 held) -> -0.8 with F closed at .67. Faderless: silence comes from the record stopping |
| 16 | Tweak | 2 | trueReverse false, interpolated. Velocity 1.0 -> 1.5 -> 0.6 -> 1.3 -> 0.7 -> 1.6 -> 0.5 -> 1.4 at eighths of the cycle (a pitch melody by pushing and dragging). Fader open |
| 17 | Drag | 2 | trueReverse false, interpolated. 1.0 -> 0.7 (.20) -> 0.4 (.40) -> 0.2 (.60) -> 0.15 (.75) -> 0.8 (.90) |
| 18 | Vibrato | 0.25 | trueReverse false, interpolated. Velocity 1.25 / 0.75 alternating every quarter of the cycle (+/- 25% speed around normal, 4 swings per sixteenth, about 10 Hz at 150 BPM) |

Also available beside the patterns: the **fader LFO**, a steady open/close square at 1/4, 1/8, 1/16 or 1/32 note: open for the first half of the period (on the beat), ramp to closed at the middle, ramp open again before the next period; 3 ms ramps; scheduled 4 bars ahead and re-scheduled if BPM drifts by more than 2%.

How the fader is applied: frame-driven patterns write the deck's channel-gain AudioParam from the 10 ms timer (a step each tick). Transformer, Crab and 8-Finger Crab pre-schedule **128 chops** on the AudioParam (sample-accurate, not subject to timer jitter), re-scheduling 300 ms before they run out. The fader here is the deck's own channel gain, not the mixer crossfader.

### 1.4 Playback of a pattern (timing)

- `ScratchPlayback.play()` computes the cycle length from the deck's effective BPM (song BPM x tempo multiplier) at the moment of the call. It is not recomputed if BPM changes mid-pattern (only the fader LFO and the Transformer/Crab schedules re-read BPM when they re-schedule).
- A 10 ms `setInterval` tick advances the pattern clock by wall-clock time, finds the current frame, interpolates velocity if enabled, and calls `deck.setScratchVelocity(v)`.
- Phase alignment: instead of waiting for a beat (quantize is off for every pattern, "zero-latency response"), the pattern's clock is started at `replayer.getElapsedMs() % cycleLength`. This assumes beat 0 of the track is at t = 0 and the pattern is aligned to the song time, NOT to a detected beat grid or downbeat. In audio mode the code still reads the TRACKER replayer's elapsed time here (UNCONFIRMED whether that is non-zero for an audio deck; looked at `DJScratchEngine.ts:729-745`). For the Transformer/Crab family the chop grid is phased with `_getBeatOffsetSec`, which does use the audio player's position in audio mode.
- `quantize: '1/4' | '1/8'` is implemented (`msUntilNextBeat`, delay capped at 500 ms, skipped below 30 BPM) but unused.
- Stopping: `stopPattern()` resets the fader to 1 and decays the rate back to the pitch-slider value over **300 ms**. A one-shot ("tap") finishes its current cycle (`pendingStop`) then fires `onPatternEnd`.
- While a pattern or fader LFO runs, a small **reverb send** (convolver, 0.6 s impulse, 4 kHz, 25% wet, taken pre-fader so the tail rings through the cuts) is faded in over 50 ms and out over 500 ms.

### 1.5 How patterns are triggered

| Route | What it does |
|---|---|
| Deck UI (`DeckScratch.tsx`) | One button per pattern. Press = start; release = finish the current cycle then stop (tap and hold behave the same; `TAP_MS = 300` is read but both branches call the same function). Only one pattern per deck at a time. Plus fader LFO buttons |
| Computer keyboard | Only the first 10 patterns (Baby..Tear) plus stop and 4 LFO divisions are bound as commands, hold-to-play. In the ProTracker scheme: Ctrl+Alt+1..6 = Baby, Transformer, Flare, Hydroplane, Crab, Orbit; Ctrl+Alt+0 = stop; Ctrl+Alt+7/8/9 = LFO 1/4, 1/8, 1/16. The deck used is "whichever deck is playing, preference A > B > C" |
| MIDI pads (`useMIDIPadRouting`, `DEFAULT_SCRATCH_PADS`) | 16 scratch pads: Baby, Transform, Flare, Chirp / Crab, Orbit, Hydro, Tear / Uzi, 8-Crab, 3-Flare, Twiddle / Laser, Phaser, Drag / Stop. Pad press toggles (advanced patterns) or holds (original 10). Tweak, Vibrato and Scribble and Stab are mapped to commands but not on the default pad layout (UNCONFIRMED for Stab; `scratch_scribble`, `scratch_tear` exist in the router) |
| Tracker pattern effect `Xnn` (module playback in a deck) | High nibble 0 = scratch pattern: 1 Baby, 2 Transformer, 3 Flare, 4 Hydroplane, 5 Crab, 6 Orbit, 0 stop. High nibble 1 = fader LFO: 1 = 1/4, 2 = 1/8, 3 = 1/16, 4 = 1/32, 0 off. This lets a song author put scratches in a module |
| MIDI controller jog / touch | Hand-scratch through the platter physics (jog touch + spin) |
| Auto DJ | NONE. Searched `src/engine/dj/DJAutoDJ.ts` and `src/engine/dj/autodj/*.ts` for "scratch": zero hits |
| Dub Deck | NONE. No scratch coupling found in `src/engine/dub`, `src/components/dub`. (The dub bus has a direct tap for "vinyl clicks/scratches", `DubBus.ts:5398`, which is a routing path, not a scratch controller) |

### 1.6 Quantization, fader and crossfader handling

- Quantization to the beat grid: effectively none at pattern start (see 1.4). The only beat-grid quantization in the scratch path is the post-release `phaseAlign` after JOG scratching, if the global quantize mode is on and the other deck is playing with a beat grid.
- The "fader" in all patterns is the per-deck channel gain (AudioParam on `channelGain`), not the DJ crossfader. The mixer crossfader is a separate engine (`DJMixerEngine`); no scratch code reads or writes it. Every fader gesture therefore works with the crossfader in any position, but a real turntablist's crossfader curve (cut-in distance, hamster switch) is not modelled.
- Tracker view: the cut is applied to the replayer master gain; plus `setFaderGain(0..1)` for a continuous MIDI crossfader on the scratch ring's gain.

### 1.7 Tracker-view patterns are fader-only, and differ from the deck versions

`startFaderPattern / toggleFaderPattern` (keys `tracker_scratch_*`; Transformer, Crab, Flare, Chirp, Stab, 8-Finger Crab, Twiddle; hold keys for Crab, Transformer, Flare, fader-cut) apply ONLY the pattern's fader data to the master gain. The platter velocity of the pattern is not applied. Differences from the deck versions, confirmed in code:

- Transformer duty 50% (deck 40%), Crab 60% open (deck 28%), 8-Finger Crab 20% (same).
- Cycle length comes from `Tone.getTransport().bpm` with a fallback of 125, not the replayer's real BPM.
- Fader-cut keys and MIDI notes mute the output instantly (`tracker_fader_cut`; MIDI auto-releases after 50 ms).

### 1.8 Pattern display following the scratch

- Tracker view: `getScratchDisplayState()` returns row + fractional offset. Row offset accumulates `rate x dt / rowDuration` each frame, `rowDuration = 2.5 x speed / bpm` seconds, wrapped inside the pattern. The editor canvas draws from that while scratch is active.
- DJ deck pattern display (`DeckPatternDisplay`): during backward phases a visual offset is accumulated and subtracted from the pattern position. `getScratchState()` exposes current velocity and fader gain for the turntable spin, pattern scroll and fader indicator.

### 1.9 How scratch exit restores replayer state (the 2026-09-30 fix)

`TrackerScratchController` used to force `setSuppressNotes(false)` on exit. On songs a WASM engine plays (libopenmpt, UADE, ...) note suppression is ON by design and the replayer's row feeds the engine-position store the pattern view follows; forcing it off froze the view on the last row while the audio continued. Fix: save `_priorSuppressNotes` on entry, restore it on exit, and `resyncSchedulerToNow()` clears display rows queued on the x0.001 timeline. Guard tests: `scratchRestoresSuppressNotes.test.ts` (suppression restored as it was, both true and false), `scratchResyncDisplay.test.ts`. General rule recorded: anything that temporarily changes replayer state saves and restores, never writes a "normal" constant.

### 1.10 Tests that exist

`scratchPatterns.test.ts` (19 patterns, canonical order, unique names, frames monotonic and in range, fader gain 0..1, trueReverse needs beat-synced duration), `scratchActions.test.ts` (start / velocity / stop store+engine delegation, error swallowing), `scratchBackwardFromNeedle.test.ts` (backward scratch reads from the last captured audio; a stopped deck does not record silence over the needle; tracker ring 3 and deck ring 0 are separate tapes), plus the two engine tests above. There is NO test that a pattern sounds right, and none that drives a pattern end to end through a deck.

### 1.11 Limits and known gaps (as read)

1. Patterns are fixed loops. No randomness, no humanisation, no dynamics (velocity of strokes never varies between repeats), no phrase structure.
2. No sample/record concept in the DJ scratch: it scratches whatever the deck is playing, forward-drifting through the track. No cue point or "home" spot, no vowel/transient awareness, no way to scratch a chosen word or hit.
3. Start phase relies on elapsed time modulo cycle, not on the beat grid/downbeats that Auto DJ now computes (`DJTrackAnalysis`).
4. Stab and Laser use a "silent rewind" that is just F = 0 while the velocity is negative; there is no re-cue to the stab's start, so a repeated stab drifts through the track instead of repeating the same slice.
5. Laser and Phaser ask for 5.0 and are clamped to 4.0.
6. Fader is per-deck channel gain only; no crossfader curve or cut-in model.
7. Tracker-view patterns are fader-only and use different duty cycles and a different BPM source from the deck versions.
8. `Xnn` effect knows only 6 patterns. Keyboard knows 10. Pads know 15 plus Stop. Not one place defines the set.
9. Nothing from Auto DJ or the Dub Deck triggers or coordinates with scratching.

---

## Part 2 - The Up Rough Demo System's turntablist generator

Project: `/Users/spot/Code/Up_Rough_Demo_System` (an Amiga demo and music tool). Orientation read: `CLAUDE.md`, `RULES.md` index (49 rules, not read in full), the 2026-07-30 wiring audit and the 2026-07-17 turntablist plan. The generator the owner means is a family of Python modules in `tools/`, all offline (NumPy, 22050 Hz mono, renders audio to a WAV or into a beat; not real time):

| Module | Role |
|---|---|
| `scratch.py` (1393 lines) | The gesture engine: 22 named gestures, the "DJ brain" that decides WHERE to scratch in a beat, bank loading, macro language |
| `turntable.py` (463) | SL-1200 two-body physics + the crossfader model |
| `scratch_routine.py` (395) | 7 named word-cue routines + default, and the "scratch channel" mixing chain |
| `scratch_dj.py` (359) | The "world-class" 32-bar routine generator with a story arc (the advanced one) |
| `scratch_bank.py` (398) | Imports and analyses the classic sample crate; metadata |
| `beat_juggle.py` (833) | Two-deck beat juggling (rebuilds a break from cue points) |
| `three_deck.py` (804) | Decks A+B juggle, deck C scratches, with a two-hands budget |
| `device_*` | Fixed-point versions for the Amiga hardware chain (byte-parity with the preview) |

### 2.1 Inputs

- A **sample record**: one of the synthesised sources (7: `vocal_ah`, `vocal_fresh`, `vocal_yeah`, `robot`, `horn`, `snare`, `noise`, run through vintage sampler grit) or one of the **51 real records** in `scratch-originals/` (Part 4).
- Style (hip-hop style, mapped to a scratch profile), section name (intro, verse, hook, call, response, breakdown, outro, instrumental, showcase, break, dj_break, bridge, A/B/A2), number of bars, BPM, seed, optional density overrides, optional set of allowed sources, optional gesture-variety limit, optional named routine (`routine="auto"`).
- For `scratch_dj`: a style palette (old_school, boombap, electro, battle, lofi), BPM (default 92), seed, and cue sources.
- All randomness is a deterministic integer LFSR seeded from (seed, bar, section name), so the same inputs always give the same performance.

### 2.2 The motion model (how a gesture becomes sound)

A gesture is a **hand path** plus a **fader window list**. The hand path is a list of (time fraction, target record angle in source samples, grip 0..1) with base stroke displacement A = 1500 samples scaled by velocity. A virtual hand (spring + damper, per performer profile) pulls a light record that is coupled to a motor-driven platter through a slipmat with static + dynamic friction + stick-slip. The platter keeps turning while the record is held, reversed or pushed, so turnarounds and releases get a physically plausible acceleration. Audio = the sample read at the record's position (cubic interpolation, clamped inside a "safe region" so the head never runs off the sound) multiplied by the fader gain. Surface noise is read at the record position, so it stops and reverses with the record.

Hardware profiles (all numbers in `turntable.py`): 5 decks (classic SL-1200, tight direct drive, worn club, weak motor, modern high torque), 6 slipmats, 6 record weights, 4 cartridges, 6 performers (tight_battle, loose_old_school, heavy_hand, light_touch, electro_grid, lofi_drag; stiffness 35-110, damping 7-12).

Fader: each window is (start, end) fractions of the gesture in which the fader is open; each edge gets a click-safe ramp of 0.3-3 ms (sharper when velocity is high: ramp ms = 1 + 2 x (1 - velocity)); a "battle" curve (exponent 12, 3% cut-in); optional hamster (reversed direction) and a per-gesture timing offset (chirp and double-chirp are -2 ms so the cut leads the reversal). Velocity also shapes tone: below 0.50 a low-pass at 2500 + 6000 x v Hz, above 0.85 a 3 kHz high-pass added at 15%; level = 0.70 + 0.50 x v; stroke energy = 0.55 + 0.70 x v.

### 2.3 The technique vocabulary (22 gestures + 2 "throws")

Duration is in sixteenth-note steps (scales with tempo). Fader windows are open-regions as fractions of the gesture.

| Gesture | Steps | Hand motion | Fader |
|---|---|---|---|
| baby | 2 | 0 -> +A -> 0 -> -A -> 0 | open throughout |
| baby_slow | 3 | same, 0.6 A | open |
| forward_stab | 1 | 0 -> +1.3 A (at .42) -> 0 | open 0-.42, closed for the return |
| backward_stab | 1 | 0 -> +1.2 A (at .40) -> -0.2 A | closed on the setup, open .45-1.0 (the reverse pull is heard) |
| chirp | 2 | 0 -> +1.2 A -> -1.2 A | open .06-.44 and .56-.94 (closed at both turnarounds), timing offset -2 ms |
| chirp_double | 2 | zig-zag of 4 reversals | four open windows .03-.22, .28-.47, .53-.72, .78-.97 |
| transformer4 / transformer8 | 2 / 4 | record plays forward and ACCELERATES (distance profile 0, .32, 1.35 x natural) so every cut catches a different pitch | 4 or 8 equal cuts, each open for half |
| tear_fwd / tear_rev | 2 | uneven-speed stroke: .9 A, 1.0 A, 1.7 A, 2.0 A (the speed changes within the stroke) | open |
| flare1 | 2 | one stroke 0 -> 1.6 A | one closure: open 0-.45 and .55-1.0 |
| flare2 | 2 | one stroke 0 -> 1.8 A | two closures: open 0-.3, .37-.63, .7-1.0 |
| orbit | 3 | +1.4 A then -1.4 A | four windows: 0-.22, .28-.47, .53-.72, .78-1.0 (a flare on each stroke) |
| scribble | 2 | five quick +/-0.4 A reversals | open |
| drag | 4 | slow 0 -> 0.7 A | open |
| cut | 1 | 0 -> 1.5 A -> 0 | open 0-.42 |
| crab | 2 | plays forward (accelerating) | 5 uneven taps: edges .12-.19, .34-.40, .58-.63, .80-.85 plus 0-.12... (pairs from the edge list 0, .12, .19, .34, .40, .58, .63, .80, .85, 1.0) |
| hydroplane | 3 | forward at 0.7 x natural, grip .6 (flutter) | 12 fast cuts |
| echo | 2 | forward stab, tail fed to a delay (mix .35, 160 ms) | open 0-.4 |
| brake / spinup | 4 | deck action: exponential stop (strength 3.0) / start | n/a |
| drop | 4 | clean throw: sample plays forward at natural speed, fader open, at least 0.5 s, so the WORD is heard before it is scratched | open |
| drop_phrase | 16 (a full bar) | same, long enough for a whole spoken phrase | open |

Additional deck events in `scratch_dj`: `needle_drop` (opens the performance) and `needle_lift` (closes it). Other named fader patterns in `turntable.cut_pattern`: click, double_click, triple_click, transform, flare1, flare2, crab. A text **macro language** also exists (`ANCHOR n`, `FADER_OPEN`, `FADER_CLOSE`, `MOVE_FWD speed ticks`, `MOVE_REV speed ticks`, `CUT count ticks`, tick = a sixteenth).

Gesture busyness is measured, not hand-assigned: activity = number of fader windows + number of hand-stroke reversals; gestures are ranked calm to busy from their own definitions (`gesture_activity`, `vocabulary`).

### 2.4 How it decides what to scratch and where (the "DJ brain")

There are three layers, from small to large.

**A. Placement inside a beat (`plan_phrase`, used by hip-hop styles).**
- Style -> scratch profile (e.g. golden_era and jazz_rap -> boombap; east_coast; old_school; west_coast/g_funk = sparse drags; electro/crunk/industrial -> transformer-heavy; trap/drill -> few stabs; memphis; lofi). Each profile lists its gestures, preferred sources, effect chain, deck/hand profile and a "scratchiness" scale (old_school .6, boombap .8, east_coast .9, west_coast .45, electro 1.1, lofi .35, trap .3, memphis .6, battle 1.4).
- **Density states** (phrases per bar): none 0, very_low .09, low .18, medium .4, high .7, showcase 1.4. Section defaults: verse very_low (leave the rapper room), hook low, intro/call/response/outro/A/B medium, break/bridge high, instrumental/showcase/dj_break showcase. The style's scale shifts the state up or down by round((scale - 0.8) x 2.5) steps.
- **Where in the song:** almost all activity lands on **phrase-end bars** (bars 3, 7, 15, and the last bar of the section). Expected scratches in a bar = rate x 3.0 on phrase-end bars, rate x 0.35 elsewhere (showcase: x2.2 and x3.0). The count is the integer part plus a probability for the fraction; capped at **4 per bar**. Most bars stay silent on purpose ("the space makes the hits deliberate").
- **Where in the bar:** candidate 16th steps in priority order [15, 15, 8, 7, 6, 0] (the end of the bar first, then after-snare steps 8/7/6, then the downbeat). Role by step: >= 15 "turnaround", 6/7/8 "answer", else "accent".
- **Which gesture:** from the style's gesture list ranked calm -> busy; section energy picks the band (energies: intro .6, verse .2, hook .6, call .9, response .7, breakdown .4, outro .85, A .7, B .8, A2 .85, instrumental/showcase/dj_break 1.0, break .9, bridge .9; phrase-end bars +0.15); role nudges busier (turnaround +1, answer +0.5); a band of about 3 neighbouring gestures; the same gesture is not repeated twice running while an alternative exists. A "gesture variety" cap thins the vocabulary to evenly spaced entries.
- **Velocity** per hit = 0.55 + 0.40 x random + 0.10 x section energy (max 1.0).
- **Source rotation:** one record dominates a section (phrase repetition) and rotates across sections: index = (seed/4 + sum of the section name's character codes) mod pool size.
- **Human timing:** each gesture is offset by a random -10 to +15 ms from the grid.
- **Validation and repair:** reject "scratches every bar", "more than 4 per bar", "same gesture every time"; repair keeps only the first of an over-busy bar and thins alternate bars to open space.
- **Routines in a beat:** `routine="auto"` takes the section's closing 1-2 bars for a named routine (section -> routine: intro/outro -> intro_drag, verse/A -> phrase_end, hook/call/B/A2 -> hook_call_response, response/bridge -> snare_answer, breakdown -> phrase_reconstruction, showcase -> chirp_flare_showcase; electro style -> electro_transformer; battle style -> chirp_flare_showcase). The DJ brain's own gestures step aside for those bars.

**B. Named routines (`scratch_routine.py`, from a "Scratch Routine Manual").** Each is a list of (bar, 16th step, word cue, gesture, velocity, optional delay tail). The phrase stays recognisable: the platter supplies pitch/direction, the fader supplies the cuts. Cues are words of a phrase (ROCK / FUNKY / BEAT / IF / YOU / REALLY / PHRASE), anchored on the vowel.

| Routine | Bars | Events (step: word gesture velocity) |
|---|---|---|
| phrase_end | 1 | 14 ROCK forward_stab .9; 15 FUNKY baby .8; 16 BEAT chirp .85 + delay |
| hook_call_response | 2 | bar0: 11 ROCK forward_stab .9, 15 FUNKY baby .8; bar1: 7 BEAT chirp .85, 14 BEAT transformer8 .9 + delay |
| electro_transformer | 2 | 1 BEAT transformer4 .8, 9 transformer8 .85; bar1: 1 transformer8 .9, 9 hydroplane .9, 14 backward_stab .95 + delay |
| chirp_flare_showcase | 2 | bar0: 1 ROCK chirp .9, 5 FUNKY chirp_double .9, 9 BEAT flare1 .9, 13 BEAT orbit .95; bar1: 1 ROCK flare2 .9, 8 FUNKY chirp .9, 13 BEAT orbit .95 + delay |
| intro_drag | 2 | 1 PHRASE drag .7 + delay |
| snare_answer | 2 | bar0 step 6 ROCK forward_stab .85; bar1 step 14 BEAT baby .8 |
| phrase_reconstruction | 2 | the words in order, each a short forward_stab: IF 1, YOU 6, REALLY 11 (bar0); ROCK 1, FUNKY 6, BEAT 12 (bar1) |
| default | 2 | 7 ROCK stab .9, 15 FUNKY baby .8; bar1: 7 BEAT chirp .85, 14 BEAT transformer8 .9 + delay |

Validation: reject the same gesture on the same word more than 3 times, or more than 6 events in one bar.

**C. The 32-bar "world-class" routine (`scratch_dj.build_routine`).** A story arc, not a loop:

| Section | Bars | Energy | Max level | Cue role | What happens |
|---|---|---|---|---|---|
| intro | 0-3 | .50 | 1 | HOME | needle drop at bar 0; sparse: drag (bar 1), baby (bar 2), forward_stab (bar 3) |
| theme | 4-7 | .70 | 1 | HOME | the hook, A-A-B-A: hook A = baby @2 + forward_stab @10; hook B = forward_stab @2, backward_stab @8, chirp @14 |
| variation | 8-11 | .72 | 2 | HOME | same A-A-B-A with 40% of notes swapped for chirps |
| call_response | 12-15 | .75 | 2 | HOME / ACCENT | even bars: a level-1 call @6; odd bars: a level-2 answer @14 on the ACCENT sample |
| showcase | 16-19 | .85 | 3 | SECONDARY | difficulty climbs over the 4 bars: two gestures per bar @2, @10, levels 1..4 |
| breathing | 20-23 | .40 | 1 | HOME | drag, SILENCE, forward_stab, SILENCE (bars 21 and 23 empty) |
| climax | 24-29 | 1.00 | 4 | SECONDARY | up to 4 hits per bar @2, 6, 10, 14, each with probability = density; 25% (style fx) become FX cues; velocity .9-1.0 |
| resolution | 30-31 | .60 | 1 | HOME | return to hook A, then a forward_stab @6; needle lift at bar 31 step 15 |

Difficulty levels: L1 baby, baby_slow, forward_stab, backward_stab, drag; L2 chirp, chirp_double, transformer4, transformer8; L3 flare1, flare2, tear_fwd; L4 orbit, crab, scribble, hydroplane. Style palettes (max level, density, bias): old_school (2, .5, baby/stab/drag, 0 FX), boombap (3, .6, stab/baby/chirp, .1), electro (4, .75, transformer8/flare1/chirp, .5), battle (4, 1.0, no bias, .25), lofi (2, .35, drag/baby_slow, .05). Gesture choice: pool at the section's level capped by the style; 50% of the time restricted to the style's bias list. The last bar of every section ends on a rotating "varied ending" from [baby, transformer8, backward_stab, forward_stab] (except intro and breathing). Each hit gets a random human timing offset of -8 to +10 ms. Validation (rejects an un-musical routine): fewer than 2 silent bars, HOME under 40% of events, more than 20 bars of hardest-technique-only, no needle drop, no needle lift.

Cue vocabulary: HOME (the "home" theme sample, default `AH_STANDARD`), SECONDARY (`FRESH_STANDARD`), ACCENT (`YEAH_STANDARD`), FX (`LASER_FX`). With a whole crate, each role draws from a family of categories (Part 4). A "statement and chop" mode throws a whole spoken phrase clean (HOME = `drop_phrase`, a full bar) and then scratches ONE word slice of it (ACCENT, FX), because chopping the whole phrase destroys the words.

**D. Three decks (`three_deck.py`): scratch over a beat-juggle.** Decks A and B rebuild the rhythm from cue points; deck C speaks. A two-hands budget (default 6): the scratch level allowed = max(0, min(4, budget - juggle level)); when juggling is hard, scratching is limited. 9-section 32-bar arc (establish, build, half_bar, reorder, scratch_feat, juggle_feat, combined, final_burst, resolution) with juggle/scratch levels per section, a per-section energy [.45 .60 .68 .75 .85 .80 .95 1.0 .55], and focus that alternates (juggle leads, scratch answers, both, home). Scratch gestures by level: L1 chirp, forward_stab, cut; L2 chirp_double, transformer4, tear_fwd; L3 tear_fwd, transformer8, scribble; L4 flare2, orbit, crab (flare1 deliberately removed: it always speaks as two chunks, "du-du", and the owner picked it out by ear). Rest probability by role: feature .06, theme .18, answer .20, intro .30, scaled by (1.3 - 0.6 x energy). A phrase is a 2-bar unit; at its start a different word is "thrown" clean (drop) then scratched; the scratch fills the bar back to back with occasional rests. `beat_juggle.py` patterns: original, double_kick, kick_stutter, snare_repeat, reorder, half_bar, machine_gun, snare_roll; roles REPEAT, EXTEND, STUTTER, REORDER, ACCENT, FILL, BREAKDOWN, RETURN; a reset planner refuses a rewind that cannot finish in time (max rewind speed 3.0x). I read the structure of `beat_juggle.py` only, not every routine.

### 2.5 Timing and sync to music

Everything is on a sixteenth-note grid derived from BPM (`step = rate x 60 / (bpm x 4)`); gestures last a whole number of steps (1-4, or 16 for the phrase throw), so they scale with tempo. Sync is by construction: the generator renders the scratch INTO a beat that it also renders, on the same grid. It does not listen to or analyse an existing recording. Bar structure assumes 16 steps per bar. Human feel is added afterwards (-10 to +15 ms for beat overlays, -8 to +10 ms for `scratch_dj`). There is no live tempo following and no swing handling in these modules (UNCONFIRMED for swing: not found in the scratch modules).

### 2.6 Sample / record handling

Each record is a dict: signal, **anchor** (the vowel body, the loudest voiced frame; for non-voiced sources the envelope peak), **safe region** (where the sound lives, 6% of peak threshold), and for bank records `safe_forward`, `safe_reverse` (the part of the sound that survives forward / backward scratching), `word_slices` (word boundaries by spectral-flux onsets), a classification (clean source vs "pre-scratched" routine), recommended gestures, roles and styles. Resampling from 44.1 kHz to 22.05 kHz is band-limited (an early index-picking decimator aliased the crate and was replaced; the owner described it as "too dark and muddled"). The vintage-sampler grit (SP-1200 / S950 emulation) is applied to synthesised sources.

### 2.7 Output

Float mono at 22050 Hz, then through the **scratch channel**: high-pass 160 Hz, +22% presence band 1.5-3 kHz, tanh saturation (drive 0.09), a synced tape delay (0.20 s, feedback .32, mix .14), a dark plate/room reverb (mix .28; the 32-bar version runs wetter: room .3, delay .16, drive .10), 4-pole low-pass 5 kHz, 75% headroom. Written as an 8-bit-quantised WAV for the Amiga and mixed into hip-hop beats at gain 0.55 (styles flagged use_scratch) or 0.42. The `device_*` modules re-render the same events through a fixed-point chain (the Amiga sample voice) to stay byte-identical with the hardware. The Studio (maker UI) exposes `scratch`, `three_deck`, `beat_juggle` as engines with parameter schemas (60-parameter "Scratch Overlay" group in hip-hop).

---

## Part 3 - Comparison, reuse and questions

### 3.1 Technique by technique

"Deck" = the DEViLBOX deck pattern. "Gen" = Up Rough gesture. Both are fixed shapes; Gen's shapes are physically simulated, Deck's are velocity keyframes.

| Technique | DEViLBOX | Up Rough | Difference that matters musically |
|---|---|---|---|
| Baby | Yes (forward-only speed wobble, 2 dips per beat, fader cut at each dip) | baby, baby_slow (true reversal, fader open) | Deck never reverses; Gen goes backwards and returns to the same spot |
| Forward stab / cut | "Stab" (half beat, fader closed during the rewind phase, no re-cue) | forward_stab, cut (1 step, return silent) | Gen repeats the same slice; Deck drifts |
| Backward stab | No | backward_stab | -- |
| Chirp | Yes (quarter-beat, fader closed at turns) | chirp (2 steps, -2 ms cut lead), chirp_double | Gen has cut-lead timing |
| Transformer | Yes (constant speed, 4 chops/beat, 40% open) | transformer4, transformer8 (record accelerates so each cut is a new pitch) | Gen avoids a flat beep |
| Flare (1-click) | Flare (2-click forward + smooth back) | flare1 (one stroke, one closure) | Different click counts: Deck's "Flare" is a 2-click |
| 2-click flare | Flare | flare2 | -- |
| 3-click flare | 3-Click Flare | No | -- |
| Orbit | Yes (1 click each stroke) | orbit | Similar |
| Crab | Yes (4 taps/beat, 28% open, constant speed) | crab (5 uneven taps, accelerating) | Gen taps are uneven like fingers |
| 8-finger crab | Yes (8 taps/beat) | No | -- |
| Hydroplane | Yes (speed dips x4/beat, fader open) | hydroplane (0.7x glide + 12 fast cuts) | Gen cuts the fader as well |
| Tear | Yes | tear_fwd, tear_rev | Deck tear has a true stop; Gen is uneven speed |
| Scribble / uzi | Scribble, Uzi (forward-only) | scribble (true +/- reversals) | Deck cannot go backward here |
| Twiddle | Yes (3 clicks per stroke) | No | -- |
| Drag | Yes (2 beats) | drag (4 steps) | -- |
| Laser / Phaser | Yes | No | -- |
| Tweak / vibrato | Yes | No | -- |
| Echo scratch | No (but a fader LFO and a reverb send) | echo (stab into delay) | -- |
| Brake / spinup / spinback / power cut | Tracker view only (physics spinback, power cut, electronic brake) | brake, spinup (deck actions); needle_drop, needle_lift | -- |
| Clean "throw" of a word before scratching | No | drop, drop_phrase | Key musical device in Gen |
| Beat juggle | No (plan exists: `thoughts/shared/plans/2026-10-08-auto-dj-beat-juggling-plan.md`, not read) | Yes, two decks | -- |
| Fader LFO (steady chop) | Yes, 4 divisions | cut_pattern "transform" | -- |
| Macro language | No | Yes | -- |
| Sample choice / word slices | No | Yes (51 records, categories, slices) | The central gap |
| Phrase structure, density, call and response, rests | No | Yes | The central gap |
| Humanisation (timing, velocity) | No | -10 to +15 ms, velocity 0.55-1.0 | -- |
| Hand physics (platter + slipmat + hand) | Yes, in real time, for hand scratching only (`TurntablePhysics`) | Yes, offline, for every gesture | DEViLBOX's physics is real-time and interactive; Gen's drives scripted gestures |
| Real-time, live decks | Yes | No (offline render) | The core porting issue |

### 3.2 What the DEViLBOX scratch DJ could reuse from the demo system (by module)

1. `scratch.py: GESTURES` (hand path + fader windows + steps) -> a richer pattern format. DEViLBOX patterns already carry velocity keyframes and fader keyframes; Gen adds explicit fader OPEN windows, cut-lead offset and "record returns to anchor", i.e. a stroke defined in record position rather than speed.
2. `scratch.py: gesture_activity / vocabulary / pick_gesture` -> calm-to-busy ranking from the data, an energy-driven pick with no immediate repeat. Directly portable; DEViLBOX's 19 patterns can be ranked the same way (count fader closures + direction reversals).
3. `scratch.py: plan_phrase, DENSITY_RATE, SECTION_DENSITY, _STEPS, _PHRASE_END_BARS, validate_phrase, repair_phrase` -> the placement brain. In DEViLBOX the "section" would come from Auto DJ's `DJTrackAnalysis` sections (intro, build, drop, breakdown, outro) and downbeats instead of the hip-hop section names.
4. `scratch_dj.py: ARC, build_routine, STYLE_PALETTE, GESTURE_LEVELS, validate` -> a 32-bar story arc for a showcase mode; difficulty levels give a natural "skill" dial.
5. `scratch_routine.py: ROUTINES` -> eight tiny named phrases, usable as call-and-response building blocks.
6. `scratch_bank.py` + `scratch_bank_metadata.json` -> record catalogue: category, recommended gestures/roles/styles, anchors, safe forward/reverse ranges, word slices. This is the data a scratch DJ needs to choose a record and a safe place to scratch (Part 4).
7. `three_deck.py: scratch_permission, ARC_3DECK, REST_PROB_BY_ROLE` -> the two-hands budget, and alternating focus; maps onto "scratch only when the transition leaves a hand free".
8. `scratch_routine.scratch_channel` -> the scratch bus EQ and ambience chain (HP 160, presence, saturation, delay, reverb, LP 5 kHz) as a per-deck send; DEViLBOX already has a pre-fader reverb send and a 3-band deck EQ.
9. `turntable.fader_from_pattern` ramps (0.3-3 ms, velocity-dependent) and the battle curve; DEViLBOX uses fixed 3 ms ramps.
10. `scratch.parse_macro` -> a text pattern language, if the reviewer wants user-editable phrases.

What does NOT port directly: Python float offline rendering (needs a real-time scheduler on the existing worklet: DEViLBOX already has the ring-buffer reader with signed rate, so a "record" source needs a sample-scratch voice or a deck loaded with the sample); the simulated platter inside a gesture (DEViLBOX's worklet already smooths the rate, so a gesture would drive `setScratchVelocity` at 10 ms resolution, or write the position directly).

### 3.3 Open questions for the reviewer (musical decisions)

1. **Technique choice per musical context.** In the demo system technique follows section energy and style. For a DJ mix what decides it: the outgoing track's genre, tempo, or the transition type (long blend, cut, echo-out)? Which techniques are never appropriate at which tempi (e.g. 8-finger crab above 140 BPM)?
2. **Phrase structure.** Demo: 1-2 bar phrases, hit on phrase-end bars (3, 7, 15), rest elsewhere, A-A-B-A hook, call and response (odd bars answer), a varied last gesture. Is that the right grammar for a mix set, or should phrases align to 4/8/16-bar blocks of the incoming track, and should the DJ "answer" vocals in the track?
3. **Density.** Demo density states run from 0.09 to 1.4 phrases per bar, max 4 hits per bar. Judge what density is right when a scratch sits ON TOP of two playing tracks, and when to be silent (e.g. under a vocal).
4. **Where scratches sit against the beat.** Demo candidate 16th steps in order 15, 8, 7, 6, 0, with random -10..+15 ms. Should a stab land on the beat, just before it, or on the "and"? What is the right push/pull per technique (chirp leading by 2 ms is assumed)?
5. **Source material.** In a DJ set the "record" could be (a) a sample from the crate (words/hits), (b) a word or hit taken from the playing track (a vocal stab from the track), or (c) the playing track itself (what DEViLBOX does now). Which is musically right in which situation, and how should the scratch DJ pick the anchor (vowel, transient)? Is a cue spot (return to the same slice for every stab) required for the effect to read as a stab?
6. **Interaction with Auto DJ transitions.** Auto DJ already plans filter builds, echo-outs, reverb-outs, delay throws, drum-intro mixes, cut transitions. Where does a scratch belong: during a long blend (on the outgoing deck, as the track leaves), as the transition itself (a transformer cut-in), or only in a breakdown/outro window? Which Auto DJ move should it never overlap (an echo-out already smears the same material)?
7. **Interaction with the Dub Deck.** The Dub Deck throws echo/reverb moves on channels. Should a scratch be a dub-send source (so the cuts ring out as echoes), or should the Dub Deck be muted while a scratch plays?
8. **Hands budget.** Demo: scratch level allowed = budget - juggle level (budget 6). When the Auto DJ is also doing EQ moves, a crossfade and a filter, what is the equivalent budget and priority order?
9. **Skill and style dial.** Demo levels 1-4 by style palette (old_school max 2, battle max 4). Which levels and gestures do you consider idiomatic for each genre a DJ set might include (hip-hop, house, drum and bass, techno)?
10. **Endings and re-entry.** Demo ends phrases with a rotating gesture and closes with needle_lift. How should a scratch end so the track re-enters on the grid (DEViLBOX decays to rest over 300 ms; JOG release phase-aligns after 350 ms)?

---

## Part 4 - Scratch samples

### 4.1 Where they are

- **Up Rough Demo System:** `/Users/spot/Code/Up_Rough_Demo_System/scratch-originals/` (the "crate"). Tracked in git (imported 2026-07-16 `ef13d83c5`, later commits: "ship the record crate" `d3427b610`, "play the phrase whole, scratch its last word" `3df031b92`, "drop aaaaah.wav from the crate" `ecc1e9d41`). Contents: **51 .wav files**, `manifest.json` (earlier, numbered list with durations) and `scratch_bank_metadata.json` (analysis for 50 records; `aaaaah.wav` was dropped from the crate and is not in it). Worktree copies exist under `.claude/worktrees/*/scratch-originals` (duplicates, not counted).
- **Total size:** 12,633,484 bytes of audio (about 12.05 MiB; the directory is 12.2 MB with the JSON files).
- **Format:** all stereo 44.1 kHz; 50 are 24-bit PCM, 1 is 16-bit (`if-you-really-like-to-rock-the-funky-beat.wav`).
- Searched for further scratch audio in `Data/`, `assets/`, `music/`, `web/`, `third_party/` by file name (`*scratch*`), and by content grep of `tools/`: no other scratch sample set found. The synthesised sources (`vocal_ah`, `vocal_fresh`, `vocal_yeah`, `robot`, `horn`, `snare`, `noise`) are generated in code at run time and are not files.

### 4.2 Source and licence notes

- No licence, credit or provenance file exists in `scratch-originals/` or in the repo docs for these files (searched `.md`/`.txt`/`.json` under the repo, excluding third-party code). UNCONFIRMED: the original source of the recordings.
- The only provenance trail: DEViLBOX's own sample-pack entry says the same recordings are "Scratch Originals", author "Phase", "chopped from ScratchOriginals_Phase.wav" (`src/constants/samplePacks.ts:489-510`). The 16-bit phrase file `if-you-really-like-to-rock-the-funky-beat.wav` is not in that pack; its origin is unknown (it reads as a sampled phrase from a record; UNCONFIRMED). The words are commercial hip-hop sample staples ("fresh", "ahh", "yeah", "check this out"), so whether they can be redistributed or shipped publicly should be checked by the owner before copying into a public repository: DEViLBOX is a PUBLIC repo that deploys `public/` to the web.

### 4.3 The 51 files

"Category" and "recommended gestures" are from `scratch_bank_metadata.json`. "Words" = number of word slices detected. Files marked "(pre-scratched)" are recordings of finished scratches, intended as FX / pre-rendered scratches, not clean sources. "DEViLBOX file" = the byte-identical file already in DEViLBOX (md5 match).

| File (Up Rough: scratch-originals/) | Canonical name | Category | Format | Length (s) | Size (bytes) | Words | Recommended gestures | DEViLBOX file (public/data/samples/packs/scratch-originals/) |
|---|---|---|---|---|---|---|---|---|
| 1.wav | ONE | COUNT | 2ch 24-bit 44100 Hz | 0.435 | 115,118 | 0 | forward_stab, transformer8 | scratch_024.wav |
| 2.wav | TWO | COUNT | 2ch 24-bit 44100 Hz | 0.722 | 191,036 | 0 | forward_stab, transformer8 | scratch_025.wav |
| 3-2-1.wav | THREE_TWO_ONE | COUNT | 2ch 24-bit 44100 Hz | 1.816 | 480,650 | 3 | forward_stab, transformer8 | scratch_010.wav |
| 3.wav | THREE | COUNT | 2ch 24-bit 44100 Hz | 0.697 | 184,544 | 0 | forward_stab, transformer8 | scratch_026.wav |
| a-yeah.wav | A_YEAH | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 0.922 | 244,106 | 0 | baby, forward_stab, chirp, drag | scratch_050.wav |
| aaaaah.wav | (not in metadata) | - | 2ch 24-bit 44100 Hz | 0.671 | 177,560 | 0 | - | scratch_020.wav |
| aaaaah_alt3.wav | AH_ALT_3 | AH_VOWEL | 2ch 24-bit 44100 Hz | 0.892 | 236,072 | 0 | baby, chirp, flare1, orbit, tear_fwd, scribble, drag, transformer8 | scratch_042.wav |
| aaaaah_alt_2.wav | AH_ALT_2 | AH_VOWEL | 2ch 24-bit 44100 Hz | 0.892 | 236,066 | 0 | baby, chirp, flare1, orbit, tear_fwd, scribble, drag, transformer8 | scratch_052.wav |
| aaaah-fresh-that-was-fresh.wav | AH_FRESH_FULL_PHRASE | FRESH | 2ch 24-bit 44100 Hz | 2.207 | 584,036 | 0 | forward_stab, chirp, transformer8, flare1 | scratch_044.wav |
| aaaah.wav | AH_STANDARD | AH_VOWEL | 2ch 24-bit 44100 Hz | 0.937 | 247,886 | 0 | baby, chirp, flare1, orbit, tear_fwd, scribble, drag, transformer8 | scratch_001.wav |
| aaaah_alt.wav | AH_ALT | AH_VOWEL | 2ch 24-bit 44100 Hz | 0.760 | 201,248 | 0 | baby, chirp, flare1, orbit, tear_fwd, scribble, drag, transformer8 | scratch_009.wav |
| aaah-yeah.wav | LONG_AH_YEAH | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 0.877 | 232,016 | 0 | baby, forward_stab, chirp, drag | scratch_037.wav |
| allright_stop.wav | ALRIGHT_STOP | DJ_COMMAND | 2ch 24-bit 44100 Hz | 0.923 | 244,382 | 2 | forward_stab, cut | scratch_007.wav |
| ayeah.wav | AH_YEAH | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 0.736 | 194,840 | 0 | baby, forward_stab, chirp, drag | scratch_031.wav |
| boy.wav | BOY | SHORT_EXCLAMATION | 2ch 24-bit 44100 Hz | 0.450 | 119,024 | 0 | forward_stab, chirp | scratch_033.wav |
| check-this-out.wav | CHECK_THIS_OUT | DJ_COMMAND | 2ch 24-bit 44100 Hz | 0.809 | 213,992 | 3 | forward_stab, cut | scratch_030.wav |
| do-it-again.wav | DO_IT_AGAIN | DJ_COMMAND | 2ch 24-bit 44100 Hz | 0.789 | 208,838 | 3 | forward_stab, cut | scratch_034.wav |
| ey-yo.wav | EY_YO | INTRO_ANNOUNCEMENT | 2ch 24-bit 44100 Hz | 0.603 | 159,650 | 2 | drag, forward_stab | scratch_015.wav |
| fresh-yeah.wav | FRESH_YEAH | FRESH | 2ch 24-bit 44100 Hz | 1.277 | 338,012 | 0 | forward_stab, chirp, transformer8, flare1 | scratch_011.wav |
| fresh.wav | FRESH_STANDARD | FRESH | 2ch 24-bit 44100 Hz | 0.968 | 256,118 | 0 | forward_stab, chirp, transformer8, flare1 | scratch_003.wav |
| fresh_alt.wav | FRESH_ALT | FRESH | 2ch 24-bit 44100 Hz | 0.628 | 166,100 | 0 | forward_stab, chirp, transformer8, flare1 | scratch_043.wav |
| fresh_alt_4.wav | FRESH_ALT_4 | FRESH | 2ch 24-bit 44100 Hz | 0.931 | 246,422 | 0 | forward_stab, chirp, transformer8, flare1 | scratch_035.wav |
| he-cut-the-music-so.much-class.wav | HE_CUT_THE_MUSIC | LONG_SPECIALTY_PHRASE | 2ch 24-bit 44100 Hz | 2.285 | 604,700 | 6 | drag | scratch_036.wav |
| here-we-go-again.wav | HERE_WE_GO_AGAIN | DJ_COMMAND | 2ch 24-bit 44100 Hz | 0.899 | 237,842 | 4 | forward_stab, cut | scratch_017.wav |
| hey-hey.wav | HEY_HEY | SHORT_EXCLAMATION | 2ch 24-bit 44100 Hz | 1.011 | 267,518 | 0 | forward_stab, chirp | scratch_038.wav |
| hey.wav | HEY | SHORT_EXCLAMATION | 2ch 24-bit 44100 Hz | 0.647 | 171,266 | 0 | forward_stab, chirp | scratch_046.wav |
| hip-hop.wav | HIP_HOP | HIP_HOP_TAG | 2ch 24-bit 44100 Hz | 0.408 | 108,098 | 0 | forward_stab, chirp | scratch_019.wav |
| hit.wav | GENERIC_HIT | FX | 2ch 24-bit 44100 Hz | 0.298 | 78,878 | 0 | chirp, forward_stab, transformer8, drag | scratch_032.wav |
| if-you-really-like-to-rock-the-funky-beat.wav | IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT | LONG_SPECIALTY_PHRASE | 2ch 16-bit 44100 Hz | 2.443 | 430,968 | 9 | drag | NOT PRESENT |
| ladies-and-gentlemen.wav | LADIES_AND_GENTLEMEN | INTRO_ANNOUNCEMENT | 2ch 24-bit 44100 Hz | 1.277 | 338,060 | 3 | drag, forward_stab | scratch_029.wav |
| laser.wav | LASER_FX | FX | 2ch 24-bit 44100 Hz | 0.865 | 229,040 | 0 | chirp, forward_stab, transformer8, drag | scratch_008.wav |
| noooow.wav | NOW_LONG | LONG_VOWEL_OR_HYPE | 2ch 24-bit 44100 Hz | 0.978 | 258,854 | 0 | drag, transformer8, baby, chirp | scratch_022.wav |
| ooh.wav | OOH_LONG | LONG_VOWEL_OR_HYPE | 2ch 24-bit 44100 Hz | 0.496 | 131,264 | 0 | drag, transformer8, baby, chirp | scratch_012.wav |
| say-what.wav | SAY_WHAT | DJ_COMMAND | 2ch 24-bit 44100 Hz | 0.539 | 142,700 | 2 | forward_stab, cut | scratch_018.wav |
| scratch_005.wav | SCRATCH_005 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 0.961 | 254,282 | 0 | - | scratch_005.wav |
| scratch_006.wav | SCRATCH_006 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 0.571 | 151,148 | 0 | - | scratch_006.wav |
| scratch_013.wav | SCRATCH_013 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 0.621 | 164,420 | 0 | - | scratch_013.wav |
| scratch_027.wav | SCRATCH_027 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 1.143 | 302,486 | 0 | - | scratch_027.wav |
| scratch_028.wav | SCRATCH_028 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 0.632 | 167,312 | 0 | - | scratch_028.wav |
| scratch_039.wav | SCRATCH_039 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 0.754 | 199,532 | 0 | - | scratch_039.wav |
| scratch_048.wav | SCRATCH_048 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 2.000 | 529,250 | 0 | - | scratch_048.wav |
| scratch_051.wav | SCRATCH_051 | PRE_RENDERED_SCRATCH (pre-scratched) | 2ch 24-bit 44100 Hz | 0.279 | 73,796 | 0 | - | scratch_051.wav |
| stop-that.wav | STOP_THAT | DJ_COMMAND | 2ch 24-bit 44100 Hz | 0.809 | 213,998 | 2 | forward_stab, cut | scratch_021.wav |
| the-l-i-k-s.wav | THE_LIKS | HIP_HOP_TAG | 2ch 24-bit 44100 Hz | 2.713 | 717,866 | 0 | forward_stab, chirp | scratch_016.wav |
| uh-hah.wav | UH_HAH | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 0.562 | 148,622 | 0 | baby, forward_stab, chirp, drag | scratch_045.wav |
| uh.wav | UH_SHORT | SHORT_EXCLAMATION | 2ch 24-bit 44100 Hz | 0.252 | 66,800 | 0 | forward_stab, chirp | scratch_004.wav |
| welcome-to-the-next-level.wav | WELCOME_TO_THE_NEXT_LEVEL | INTRO_ANNOUNCEMENT | 2ch 24-bit 44100 Hz | 1.950 | 516,068 | 5 | drag, forward_stab | scratch_014.wav |
| whooo.wav | WHOO_LONG | LONG_VOWEL_OR_HYPE | 2ch 24-bit 44100 Hz | 0.414 | 109,556 | 0 | drag, transformer8, baby, chirp | scratch_047.wav |
| yeah-boy.wav | YEAH_BOY | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 1.741 | 460,688 | 0 | baby, forward_stab, chirp, drag | scratch_041.wav |
| yeah.wav | YEAH_STANDARD | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 0.510 | 134,936 | 0 | baby, forward_stab, chirp, drag | scratch_002.wav |
| yeah_alt.wav | YEAH_ALT | YEAH_RESPONSE | 2ch 24-bit 44100 Hz | 0.551 | 145,820 | 0 | baby, forward_stab, chirp, drag | scratch_023.wav |
| **Total: 51 files** | | | | | **12,633,484** | | | |

### 4.4 Which techniques use which sample

In `scratch_dj`, the four roles resolve to these defaults, or to pools by category when a crate is given:

| Role | Default sample | Pool (categories) | Used by (examples) |
|---|---|---|---|
| HOME (the theme) | `aaaah.wav` (AH_STANDARD) | AH_VOWEL, LONG_VOWEL_OR_HYPE: aaaah, aaaah_alt, aaaaah_alt3, aaaaah_alt_2, aaaaah, noooow, ooh, whooo | intro drag/baby/stab, theme A-A-B-A hook, variation, call, breathing, resolution |
| SECONDARY | `fresh.wav` (FRESH_STANDARD) | FRESH, DJ_COMMAND: fresh, fresh_alt, fresh_alt_4, fresh-yeah, aaaah-fresh-that-was-fresh, allright_stop, check-this-out, do-it-again, here-we-go-again, say-what, stop-that | showcase, climax |
| ACCENT | `yeah.wav` (YEAH_STANDARD) | YEAH_RESPONSE, SHORT_EXCLAMATION, HIP_HOP_TAG: yeah, yeah_alt, a-yeah, ayeah, aaah-yeah, yeah-boy, uh-hah, boy, hey, hey-hey, uh, hip-hop, the-l-i-k-s | the call-and-response answer, occasional barks |
| FX | `laser.wav` (LASER_FX) | FX, COUNT, INTRO_ANNOUNCEMENT, PRE_RENDERED_SCRATCH, LONG_SPECIALTY_PHRASE: laser, hit, 1, 2, 3, 3-2-1, ladies-and-gentlemen, welcome-to-the-next-level, ey-yo, he-cut-the-music-so-much-class, scratch_005..051, if-you-really-like-to-rock-the-funky-beat | climax FX substitution (25% in battle style) |

Category -> recommended gestures (from `scratch_bank.CATEGORY_RECS`): AH_VOWEL: baby, chirp, flare1, orbit, tear_fwd, scribble, drag, transformer8. FRESH: forward_stab, chirp, transformer8, flare1. YEAH_RESPONSE: baby, forward_stab, chirp, drag. SHORT_EXCLAMATION and HIP_HOP_TAG: forward_stab, chirp. LONG_VOWEL_OR_HYPE: drag, transformer8, baby, chirp. DJ_COMMAND: forward_stab, cut. COUNT: forward_stab, transformer8. INTRO_ANNOUNCEMENT and LONG_SPECIALTY_PHRASE: drag (plus forward_stab for announcements). FX: chirp, forward_stab, transformer8, drag. Roles per category: COUNT intro/count/reconstruction; AH hook/showcase/phrase_end; FRESH hook/phrase_end/reconstruction; YEAH answer/hook/phrase_end; LONG_VOWEL intro/breakdown/showcase; DJ_COMMAND intro/transition/phrase_end.

Routines use whichever crate records are checked, mapped onto the slots ROCK / FUNKY / BEAT / IF / YOU / REALLY / PHRASE in order. The three-deck and "statement and chop" modes use a single phrase record (typically `if-you-really-like-to-rock-the-funky-beat.wav` with 9 word slices): the whole phrase is thrown clean (HOME) and the LAST word is chopped (ACCENT and FX).

### 4.5 DEViLBOX's current scratch-sample situation

- **DEViLBOX already has the crate**, under numbered names. 50 of the 51 Up Rough files are byte-identical (md5) to files in `/Users/spot/Code/DEViLBOX/public/data/samples/packs/scratch-originals/` (`scratch_001.wav` = `aaaah.wav` etc.; mapping in the table above). Missing from DEViLBOX: `if-you-really-like-to-rock-the-funky-beat.wav` only. DEViLBOX has 6 extra files that are not in Up Rough: `scratch_040` (0.446 s), `scratch_049` (0.452 s), `scratch_053` (4.093 s), `scratch_054` (0.412 s), `scratch_055` (0.059 s), `scratch_056` (4.952 s). The DEViLBOX pack directory is 56 .wav files, 14,958,424 bytes audio, all stereo 24-bit 44.1 kHz, plus a 3,463-byte `manifest.json` (names and durations only).
- **What is missing is not audio but meaning:** DEViLBOX knows these only as "Scratch 001..056" with category `fx`. It has no names, no categories, no anchors, no safe ranges, no word slices. That metadata is `scratch_bank_metadata.json` (50 records) in Up Rough.
- **Where DEViLBOX uses them today:** (a) the sample browser pack `SCRATCH_ORIGINALS_PACK` (`samplePacks.ts:489-520`; builds `scratch_001`..`scratch_053` except 052 ("removed click artifact", but `scratch_052.wav` is a real 0.89 s `aaaaah_alt_2.wav`, so it is hidden from the browser by that filter); 054-056 are not referenced); (b) the drum-pad kit `SCRATCH_ORIGINALS_KIT` mapping `scratch_001`..`scratch_016` to pads (`defaultKitLoader.ts:88-121`). They play as one-shots on pads. The scratch engine does not use any sample.
- **Where new ones would live and how the scratch engine would load them:** the existing home is `public/data/samples/packs/scratch-originals/` (served at `/data/samples/packs/scratch-originals/...`). A catalogue file there (e.g. the Up Rough metadata, with `filename` pointing at the existing numbered files) would avoid duplicating 12 MB. Loading path candidates already in the code (not wired): fetch the URL, decode, and hand the ArrayBuffer to `DeckEngine.loadAudioFile(buffer, filename)` (audio mode), after which the existing deck ring buffer and `setScratchVelocity` scratch it; or a dedicated sample-scratch voice that reads the sample at a signed rate through the existing `scratch-buffer.worklet.js` reader (the reader takes any stereo ring; a record's anchor and safe range would be the missing start-position and clamp). Which of the two is chosen is a design decision for the next step; I did not test either.
- **Copy plan if the owner wants named files:** the copy is a separate step. Only one audio file is genuinely new (`if-you-really-like-to-rock-the-funky-beat.wav`, 430,968 bytes) plus the metadata JSON (and the licence question in 4.2).

---

## Inputs for the implementation plan

For the author of the full plan for "awesome scratching DJs". Facts below are from the code as read; "UNCONFIRMED" marks what I did not verify.

### 5.1 Integration points a plan must name

| Concern | Where it is today | Note for the plan |
|---|---|---|
| Deck rate and position API | `src/engine/dj/DeckEngine.ts`: `startScratch()` 949, `setScratchVelocity(v)` 984 (signed, clamped to [-4, 4]), `stopScratch(decayMs)` 1128, `playPattern(name)` 1427, `stopPattern()` 1466, `getEffectiveBPM()`, `getChannelGainParam()` (the per-deck fader, an AudioParam), `getScratchState()` 1618. Audio mode: `audioPlayer.setPlaybackRate / seek / getPosition / resume / isCurrentlyPlaying` (`DeckAudioPlayer.ts`). Tracker mode: `replayer.setTempoMultiplier / setPitchMultiplier / getElapsedMs / getSongPos / getPattPos` | The only motion input is a signed RATE. There is no "move the record to position P over time T" call; position emerges from the rate. A gesture defined as record position (Up Rough style) must be turned into a rate curve, or a new position-driven call added |
| Ring-buffer reader | `src/engine/dj/DeckScratchBuffer.ts` (`startScratch(rate, 'middle' | 'write')`, `setScratchRate`, `snapScratchRate`, `stopScratch`, `freezeCapture`) + `public/worklets/scratch-buffer.worklet.js` | Reads any stereo ring at a signed rate with Hermite interpolation. A sample "record" would need to be written into a ring, or a second reader added |
| Scratch controller (tracker view) | `src/engine/TrackerScratchController.ts` (`getTrackerScratchController()`), `src/engine/turntable/TurntablePhysics.ts` | Hand-physics model with real-time inputs; `startFaderPattern` etc. apply fader only |
| Pattern data and player | `src/engine/dj/DJScratchEngine.ts` (`SCRATCH_PATTERNS`, `ScratchPlayback`, `getPatternByName`) | The format a scratch DJ would extend or replace |
| One action path today (partial) | DJ FX registry: `src/engine/drumpad/DjFxActions.ts` (`DJ_FX_ACTIONS`, `fireDjFx(id, {source})`, `releaseDjFx`, `DjFxSource = 'pad' | 'keyboard' | 'midi' | 'mcp' | 'autodj' | 'tour'`, fire log + counts). Scratch is NOT in this registry: it has its own id type `ScratchActionId` (`src/types/drumpad.ts:43`), keyboard commands (`src/engine/keyboard/commands/djScratch.ts`), pad routing (`src/hooks/drumpad/useMIDIPadRouting.ts`) and the deck button (`DeckScratch.tsx`) | A plan should decide whether scratch moves become `DjFxActionId`s (so Auto DJ's executor can fire them with `source: 'autodj'`, exactly as `EFFECT_ACTIONS` does in `transitionExecutor.ts:85`) or the registry is generalised |
| Crossfader actions | `src/engine/dj/DJActions.ts`: `setCrossfader(position 0..1)` 459, `setCrossfaderCurve(curve)` 475, which call `getDJEngine().mixer.setCrossfader / setCurve` and update `useDJStore` | Scratch patterns use the deck channel gain, not these. A technique that needs a real crossfader (cut-in distance, hamster) must go through these functions, and through the shared action path |
| Auto DJ analysis (all under `src/engine/dj/autodj/`) | `types.ts`: `DJTrackAnalysis` 334, `BeatGrid` 22 (bpm, firstBeat, beats with `isDownbeat` and strength), `DownbeatGrid` 47 (bars, meter), `GridLandmarks` 62, `DJSection` 191 / `SectionKind` 181, `DJPhrase` 203 (start, end, startBar, lengthBars, sectionIndex), `DJCuePoints` 213 (firstDrums, firstBass, firstVocal, firstHook, firstDrop, firstBreak, bestMixIn, bestMixOut, outroStart...), `ActivityTimeline` 230, `ArrangementEvent` 241, tracker-specific `TrackerMixAnalysis` 310. Files: `beatGrid.ts` (`buildBeatGrids`, `barIndexAt` 196), `structure.ts` (`detectPhraseLength`, `labelSections`, `buildPhrases`), `cuePoints.ts` (`deriveCuePoints`, `scoreMixIn / scoreMixOut`), `trackerMixAnalysis.ts` | This is the beat/phrase/cue knowledge DEViLBOX's scratch patterns do not use today (they phase from elapsed time). It is what the scratch DJ's placement brain (Part 2.4A) would read |
| Auto DJ planning and execution | `transitionPlanner.ts` (picks one of 19 `TransitionStyle`s: longBlend, shortBlend, bassSwap, EQSwap, filterBuild, filterRelease, echoOut, reverbOut, delayThrow, loopExit, breakdownMix, dropMix, drumIntroMix, vocalSwap, percussionSwap, hardCut, tempoBridge, doubleTimeJump, halfTimeJump), `DJTransitionPlan` (`types.ts:711`: decks, start/end beat, durationBars, crossfadePlan, eqPlan, filterPlan, bassPlan, gainPlan...), `transitionExecutor.ts` (`executeTransition` 127, `planCurves` 104, `applyTarget` 69), `sessionController.ts` (`DJSessionController`, preload 60 s), `performanceContext.ts`, `sessionMemory.ts` (recent FX variety), `transitionQuality.ts`, `decisionLog.ts`, `telemetry.ts`. Plans: `thoughts/shared/plans/2026-10-08-auto-dj-world-class-plan.md`, `-progress.md`, `2026-10-08-auto-dj-beat-juggling-plan.md` | A scratch DJ is a new kind of move inside a `DJTransitionPlan` and/or a standalone performance layer on the session controller. Note the git working tree currently holds uncommitted work in `src/engine/dj/` (DeckEngine, DJActions, DJAutoDJ, useDJStore) |
| Dub Deck channel roles | `src/lib/dub/musicalChannelProfile.ts` (`MusicalChannelProfile`: instrument family, musical function, rhythmic role, register, evidence), `src/lib/dub/dubTargetProfile.ts`, `src/lib/dub/moveIntentions.ts`, `src/stores/useChannelTypeStore.ts`, `src/lib/tracker/channelNames.ts`; the dub bus `src/engine/dub/DubBus.ts`; strip UI `src/components/dub/DubDeckStrip.tsx`; the 19-persona list (`AutoDubPersonas.ts`) | For tracker-mode decks these give per-channel roles (kick, snare, hat, lead, vocal-like, pad). A scratch DJ working on a tracker song could pick a "record" from a channel or its instrument. No scratch hooks exist in the dub code (UNCONFIRMED beyond grep for "scratch") |
| MIDI and keyboard routes | `src/hooks/useGlobalKeyboardHandler.ts` (command registry lines 721-736, 772-785), `public/keyboard-schemes/*.json`, `src/midi/DJControllerMapper.ts` (`executeTrackerScratchAction`, jog), `djControllerPresets.ts`, `djKnobBanks.ts`, `djScenarioPresets.ts`, `src/midi/performance/parameterRouter.ts`, `src/hooks/drumpad/useMIDIPadRouting.ts` | Any new scratch-DJ control must land in all of these through the shared action, not by copying code |
| Store | `src/stores/useDJStore.ts` (`activePatternName`, `scratchVelocity`, `scratchFaderGain`, `faderLFOActive`, `setDeckPattern`) | UI state; the sources of truth for what is playing |
| UI | `src/components/dj/DeckScratch.tsx` (pattern buttons), `DeckVinylView.tsx`, `DeckPatternDisplay.tsx`, `DeckFXPads.tsx` | New controls go here |
| Sample catalogue | `src/constants/samplePacks.ts:489-520`, `src/lib/drumpad/defaultKitLoader.ts:88-121` | Part 4 |

### 5.2 Constraints a plan must respect (owner's rules, from `CLAUDE.md` and `~/.claude/CLAUDE.md`)

- **One action path shared by buttons, keyboard, MIDI and automation.** The DJ FX registry is the existing model (`fireDjFx(..., {source})`); scratch currently has three parallel copies (command functions, pad id map, UI handlers, `Xnn` effect table). The plan must collapse these rather than add a fourth. "Single source of truth": data in stores/services, components are presentation only.
- **DOM UI with design-system components** (`src/components/ui/Button`, `Modal`, `controls/Knob`, `Toggle`, `CustomSelect`), Tailwind token classes only (e.g. `bg-dark-bg`, `text-text-primary`, `border-dark-border`, `bg-accent-primary`), no raw colours, no new Pixi; Knob/control `useRef` pattern for continuous controls and `paramKey` for MIDI-drivable values; full English labels (no "Trans", "8Crb" style abbreviations; the current `shortName`s break this rule); no emojis.
- **Regression tests in `test:ci`**: every bug fix has a test that fails before and passes after; tests outside the CI glob do not count; one reachability test per feature through the product's top-level entry point with a call-count or sentinel that proves the new code RAN, plus tests for behaviour at the place it lives (pure functions for the placement brain, the pattern/gesture data, the catalogue loader). `src/__tests__/ci/` is excluded from the vitest config (`vite.config.ts:82`, noted in project memory), so put CI tests elsewhere.
- **Reachability is the definition of done** (`~/.claude/REACHABILITY_PROTOCOL.md`, not re-read here): a feature is done when a test drives the real entry point, proves the new code ran, and asserts the spec's numbers; every declared knob must move the output or carry a written exemption; a plan is executed and verified 100%, and is reported as "N of M" until then. Show the full checklist with IDs before executing.
- **Verification on the real engine:** debug through the DEViLBOX MCP and a real Chrome (not Playwright); type-check with `npm run type-check` (`tsc -b --force`); VITEST_MAX_WORKERS=2, one test command at a time, no full-suite runs by hand; always stop playback after an MCP test; never open a second browser tab; do not save files under `src/` while the owner's tab is open without care (Vite full-reloads the tab).
- **Reuse before inventing:** search for and extend the existing pattern format, `TurntablePhysics`, `ScratchPlayback`, the Auto DJ planner/executor and `DjFxActions` before adding parallel mechanisms. Fix root causes in the right layer (engine bug in the engine).
- **Every state a scratch changes is saved and restored** (see 1.9): the rate, the gain, the capture freeze and the note suppression. The 2026-09-30 bug is the precedent.
- **Persisted state needs versioned keys and a migration** if the plan adds any (`src/lib/persistence/migrations/`).
- **Deploy:** push to `main` auto-deploys to `devilbox.uprough.net`; batch pushes (the pre-push gate is about 125 s). A public repo: check licensing of the samples before shipping them (4.2).

### 5.3 What the Up Rough generator offers to port

| Asset | Where | Format / data | Port target |
|---|---|---|---|
| Gesture vocabulary (22) | `tools/scratch.py: GESTURES` | Python dicts: `hand` = [(t_frac, angle_in_samples, grip)], `fader` = name or list of open windows (start, end), `off` ms, `glide`/`grip`/`cuts` for steady-platter gestures, `fx`; steps table `_GESTURE_STEPS` | A TypeScript gesture table; DEViLBOX `ScratchPattern.frames` can express the same shapes once fader open-windows and cut offset are added |
| Named fader patterns | `tools/turntable.py: cut_pattern` | lists of (start, end) windows | Reuse in `ScratchPlayback` scheduling |
| Placement brain | `tools/scratch.py: plan_phrase, DENSITY_RATE, SECTION_DENSITY, _STEPS, vocabulary, gesture_activity, pick_gesture, pick_source, validate_phrase, repair_phrase` | pure functions of (style, section, bar, seed) returning [(step, gesture, velocity, role)] | The scratch DJ's decision core. Pure and deterministic (integer LFSR `x ^= x<<13; x ^= x>>17; x ^= x<<5` masked to 31 bits), so it ports exactly and is unit-testable against Python output |
| 32-bar arc and difficulty ladder | `tools/scratch_dj.py: ARC, GESTURE_LEVELS, STYLE_PALETTE, build_routine, validate` | tuples and dicts; events (bar, step, cue_role, gesture, velocity) | A "showcase" mode |
| Routines | `tools/scratch_routine.py: ROUTINES` | dicts of events | Call-and-response building blocks |
| Three-deck budget and arc | `tools/three_deck.py: scratch_permission, ARC_3DECK, ARC_ENERGY, REST_PROB_BY_ROLE, build_scratch_events` | pure functions | Hands budget when Auto DJ is busy |
| Record catalogue | `scratch-originals/scratch_bank_metadata.json` (50 records) | JSON keyed by canonical name: filename, category, recommended gestures / roles / styles, duration_ms, centroid, voiced_amount, noise_amount, transient_count, onset_rate, pitch_flip_rate, anchor_attack / anchor_vowel / anchor_tail (in samples at the 22.05 kHz analysis rate, NOT the file's 44.1 kHz: `load_bank` defaults to RATE = 22050, and for ONE.wav 435 ms the safe end 8459 = 384 ms only fits at 22.05 kHz), safe, safe_forward, safe_reverse ranges, word_slices, source_is_clean / pre-scratched | Copy as JSON, convert sample indices to seconds, map `filename` to DEViLBOX's numbered files |
| Samples | `scratch-originals/*.wav` (51, 12,633,484 bytes) | stereo 44.1 kHz 24-bit (one 16-bit) | Already in DEViLBOX except one file (4.5) |
| Scratch bus chain | `scratch_routine.scratch_channel` | HP 160 Hz, +0.22 band 1.5-3 kHz, tanh drive .09, tape delay .20 s fb .32 mix .14, reverb room .28, LP 5 kHz 4-pole, 75% headroom | A deck-side or dedicated scratch send |
| Physics profiles | `tools/turntable.py` DECKS, SLIPMATS, RECORDS, CARTRIDGES, PERFORMERS | dicts | Presets for DEViLBOX's `TurntablePhysics` (different model: DEViLBOX has one record + motor; Up Rough has a hand spring-damper and a light record) |
| Macro language | `tools/scratch.py: parse_macro` | text lines | Optional |
| Documents | `thoughts/shared/research/2026-07-30_scratch-family-wiring-audit.md`, `plans/softsynth/hip-hop-scratch-placement-manual.md`, `scratches-crossfader-physics.md`, `plans/manuals/` | prose manuals the code cites by section number (s.N) | Read by the reviewer for the intent behind the numbers |

Porting caution: the generator is offline Python at 22.05 kHz mono and renders a whole routine ahead of time on a sixteenth-note grid; DEViLBOX must schedule live against decks whose tempo, key lock and position can change. The arithmetic ports; the timeline must be re-expressed against the beat grid, downbeats and phrases that Auto DJ already computes.

## Appendix - file and line references

DEViLBOX (`/Users/spot/Code/DEViLBOX`)

- `src/engine/dj/DJScratchEngine.ts`: types 29-50; patterns 66-604 (Baby 66, Transformer 95, Flare 120, Hydroplane 152, Crab 177, Orbit 199, Chirp 234, Stab 261, Scribble 280, Tear 311, Uzi 348, Twiddle 381, 8-Finger Crab 423, 3-Click Flare 446, Laser 480, Phaser 506, Tweak 534, Drag 562, Vibrato 589); registry 607-627; `ScratchPlayback` 662; `play` 717; phase alignment 729-745; tick 764-856; `stopPattern` 858; fader LFO 916-1018; Transformer / Crab / 8-Finger Crab fader schedules 1027 / 1066 / 1105; lookahead constant 651.
- `src/engine/dj/DeckEngine.ts`: jog cooldown 157; `startScratch` 949; `setScratchVelocity` 984-1123 (pattern branch 992-1050); `stopScratch` 1128; `_switchToBackward` 1231; `_accumulateBackwardDisplacement` 1290; `_switchToForward` 1306; `_decayToRest` 1369; `playPattern` 1427; `stopPattern` 1466; `_endPatternScratch` 1479; reverb send 283-300 and 1551-1569; `getScratchState` 1618; `_handleScratchEffect` (Xnn) 1630; slip 1940-1976.
- `src/engine/dj/DeckScratchBuffer.ts` (ring-buffer wrapper; `startScratch` 177, `setScratchRate` 195, `stopScratch` 214); `public/worklets/scratch-buffer.worklet.js` (`BUFFER_SECONDS = 120` line 20, `RATE_SMOOTH_SEC = 0.005` line 28, `ZERO_FADE_SAMPLES = 48` line 38).
- `src/engine/TrackerScratchController.ts`: constants 40-65; `enterScratchMode` 550; `engageScratchAudio` 629; `exitScratchMode` 661 (crossfade 150 ms); physics loop 730; MIDI jog 386-435; spinback / power cut / brake 436-518; fader cut 807; fader patterns 855-1052; display state 141.
- `src/engine/turntable/TurntablePhysics.ts`: constants 34-125; `triggerSpinback` 299.
- `src/engine/dj/DJActions.ts`: scratch 558-591; patterns 930-980.
- `src/engine/keyboard/commands/djScratch.ts` (all), `trackerScratch.ts` (all); `src/hooks/useGlobalKeyboardHandler.ts:721-736, 772-785`; `public/keyboard-schemes/protracker.json:89-98`; `src/hooks/drumpad/useMIDIPadRouting.ts:40-60`; `src/constants/djPadModeDefaults.ts:135-155`; `src/midi/DJControllerMapper.ts:760-870`; `src/components/dj/DeckScratch.tsx`; `src/components/dj/DeckVinylView.tsx:57-125, 340-352`; `src/components/dj/DeckPatternDisplay.tsx`; `src/components/tracker/PatternEditorCanvas.tsx:520-530, 651-666`.
- Tests: `src/engine/dj/__tests__/scratchPatterns.test.ts`, `scratchActions.test.ts`, `scratchBackwardFromNeedle.test.ts`; `src/engine/__tests__/scratchRestoresSuppressNotes.test.ts`, `scratchResyncDisplay.test.ts`.
- Memory note: `/Users/spot/.claude/projects/-Users-spot-Code-DEViLBOX/memory/project_scratch_restores_state.md`.
- Samples: `src/constants/samplePacks.ts:489-520`; `src/lib/drumpad/defaultKitLoader.ts:88-121`; `public/data/samples/packs/scratch-originals/`.
- Auto DJ (context): `src/engine/dj/autodj/transitionPlanner.ts` (FX plan kinds), `thoughts/shared/plans/2026-10-08-auto-dj-world-class-plan.md`, `2026-10-08-auto-dj-beat-juggling-plan.md`.

Up Rough Demo System (`/Users/spot/Code/Up_Rough_Demo_System`)

- `tools/scratch.py`: sources 81; `GESTURES` 131-190; `_GESTURE_STEPS` 193; `VEL` 209; `render_gesture` 234; `PROFILES` 353; `STYLE_TO_PROFILE` 394; `DENSITY_RATE` 409; `SECTION_DENSITY` 419; `_SECTION_ENERGY` 428; `_STEPS` 434; `gesture_activity` 606; `vocabulary` 634; `pick_gesture` 658; `plan_phrase` 685; `pick_source` 739; `SECTION_ROUTINE` 766; `render_scratch_section` 809; `validate_phrase` 883; `repair_phrase` 897; `parse_macro` 915; `render_macro` 957.
- `tools/turntable.py`: profiles 35-85; `simulate` 102; `render_from_motion` 190; fader 250-318; `cut_pattern` 320; `deck_motion` 344; `needle_drop` 384.
- `tools/scratch_routine.py`: `load_wav_cues` 110; `scratch_channel` 211; `ROUTINES` 239; `render_routine` 292; `validate_routine` 342.
- `tools/scratch_dj.py`: `GESTURE_LEVELS` 45; `STYLE_PALETTE` 56; `ARC` 91; `build_routine` 103; `cues_from_bank` 168; `cue_pools_from_bank` 192; `cues_with_word_emphasis` 206; `render` 264; `validate` 304.
- `tools/scratch_bank.py`: `CATEGORY_RECS` 41; `FILENAME_MAP` 62; `load_bank` 315.
- `tools/three_deck.py`: `SCRATCH_GESTURE_BY_LEVEL` 51; `scratch_permission` 75; `ARC_3DECK` 86-98; `build_scratch_events` 247; `REST_PROB_BY_ROLE` 608. `tools/beat_juggle.py`: patterns 300-371; `plan_resets` 380. `tools/device_scratch_bus.py` (fixed-point scratch bus). `tools/hiphop.py:1963, 2385-2396` (scratch overlay inside a beat).
- Docs: `thoughts/shared/research/2026-07-30_scratch-family-wiring-audit.md`; `thoughts/shared/plans/2026-07-17-turntablist-scratch-session-demo.md`; `thoughts/shared/plans/softsynth/hip-hop-scratch-placement-manual.md` and `scratches-crossfader-physics.md` (the "manuals" the code cites by section number; not read in full).
- Samples: `scratch-originals/` (51 wav, `manifest.json`, `scratch_bank_metadata.json`).
