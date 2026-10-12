---
date: 2026-10-12
topic: Scratch null test - DEViLBOX's scratch layer against the Up Rough demo's render, stage by stage
tags: [scratch, dj, null-test, demo-port, oracle]
status: final
---

# Scratch null test

Owner 2026-10-12: "make the demo and devilbox scratch 1:1". This doc covers the method, the oracle,
a residual table per stage, and answers to the owner's questions. The port ledger is
`thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md`. While rows there are open, nothing here
is a claim of parity: only the **routine path** (the two 32-bar features, three_deck and scratch_dj)
runs the code measured here. The overlay, juggle response, transitions, pads, MCP and tracker samples
still play on the voice ring (`ScratchRecordVoice`), which has no null test (phase PG-J).

## Method

- **Oracle.** The demo's own render on the A/B fixture: the drops track span and `plan.json` from
  `scratchParityRenderAB.test.ts`. The demo side is `tools/scratch-fixtures/render_demo_three_deck.py`,
  a line-for-line copy of `three_deck.render`'s Deck C over the track. The session-scratchpad
  `oracle.py` (a copy of that script) dumps each stage: per-event strokes, the dry bus, deck_c_eq,
  each scratch_channel stage, the tail, the level, the duck and the mix.
- **DEViLBOX.** `renderRoutine` in the A/B harness drives the product path: `DJScratchDJ.tick` ->
  `ScratchExecutor` -> `fireDjFx` -> `ScratchVoicePool` -> the Deck C worklet. It runs offline at
  22,050 Hz (`SCRATCH_AB_LAYERS=1 SCRATCH_AB_RATE=22050`) with the programme meter off. It writes the bus
  output as float32 (`*.bus.f32`; a 16-bit WAV floors at -90 dB).
- **Metric.** Residual = 20 log10(rms(demo - DEViLBOX) / rms(demo)), with no gain fitted unless the
  table says so.
- **Threshold.** -120 dB per stage against float64 Python. A worklet output is float32, so a bus
  stage's floor is about -150 dB.
- **Run.** Same seed (27), same events (167), same rate.

## Stage table

| Stage | Residual before | Residual after | Commit | Test |
|---|---|---|---|---|
| Record PCM (pack WAV -> 22,050 Hz mono -> S950 -> norm), 51 records | not nulled (OfflineAudioContext resampler, hand biquads, Math.round, float32) | worst -305.9 dB | b3685ea73 | scratchNullsTheDemo (via strokes) |
| Cue data (vowel anchor, safe range) | 10 of 51 records differed (stale metadata) | 0 differ (regenerated from the demo's `load_bank`) | b3685ea73 | scratchCatalogue |
| Read rate per sample (sim record_vel), 9 gestures | keyframes: 0-2 cents mean, 17-119 cents worst; scribble 1112 cents mean (half length) | max 1.2e-11 cents | b3685ea73 | scratchNullsTheDemo |
| Each stroke (`render_gesture`: physics, Catmull-Rom read, surface, fader, velocity tone, FX), 167 events | n/a (no stroke-level equivalent on the ring) | -240 to -307 dB; needles -152 dB (float32 `needleDrop`) | b3685ea73 | scratchNullsTheDemo |
| Dry bus (strokes summed at sample onsets incl. the demo's human timing) | 0.0 dB (uncorrelated) | -152.3 dB | 61ae1abcf | scratchNullsTheDemo + A/B harness |
| deck_c_eq | n/a (no stage) | -152.0 dB | 61ae1abcf | same |
| scratch_channel hp / presence / drive / tape echo / plate+dark room / 4-pole lp | ring bus: other chain (room .3 delay .16 drive .10, no eq, no tail) | -152.2 / -152.2 / -151.9 / -151.9 dB | 61ae1abcf | same |
| Tail (+ 0.22 dark room) = the layer before the level | 0.0 dB | -151.9 dB (one fitted gain = the demo's 0.75/peak) | 61ae1abcf | same |
| Level (0.60 x rms(beat)/rms(layer)) and duck (40 Hz, depth .25), over the routine's 32 bars | not ported (programme follower; no duck) | -70.9 dB, no gain fitted | 1ed8ce5d8 | scratchNullsTheDemo (level 1e-6, duck < -130 dB) |
| Final mix (0.72 x track + layer x duck), 16-bit WAV | -10.4 dB | -74.1 dB, gain 1.00002 | 1ed8ce5d8 | v3 pair on the Desktop |
| Live 48 kHz read of the 22,050 Hz bus | linear read: -1.5 dB at 5 kHz | -104.2 dB vs an ideal FFT upsample | 1ed8ce5d8 | measured (below) |

### Why the shaped layer stops at -71 dB, not -150 dB

The beat window starts at one downbeat, rounded in two domains: `trunc(trackFromSec x 22050)` on the
deck's track, and `int(down x 22050)` on the bus in the fixture. These can be one sample apart. The
40 Hz duck envelope starts from zero state at the window. With a one-sample shift the residual is
-72.8 dB, and with none it is -70.9 dB. The remainder comes from the window and the duck's start
state. It does not come from the chain. Closing it means the fixture writes the track sample index
DEViLBOX uses (plan.json). That is PG-F's to finish, together with X6/X7 (below).

### Why 48 kHz measured -61 dB against scipy

The live context runs at 48 kHz. The bus runs at 22,050 Hz and is read through a 64-tap Kaiser sinc
(beta 9, 512 phases). Against an **ideal** (FFT) upsample of the exact 22,050 Hz layer the live
output is **-104.2 dB**. scipy's `resample_poly(320, 147)` (Kaiser 5) is itself -60.8 dB from the
ideal: that is its passband ripple. The -61 dB first measured was scipy's error, not DEViLBOX's. By
band, against scipy: 0-4 kHz -61 dB, 4-8 kHz -62 dB, 8-10 kHz -22 dB (the two filters' transition
bands; the signal there is -80 dB). The 64-tap kernel did not move the scipy residual (it was -60.6
dB with 32 taps), which confirms the floor is scipy's. The demo's 22,050 Hz file in the owner's
player is also resampled, by the player.

## Owner questions

1. **Are the scratches pitched correctly?** The read rate per sample now equals the demo's: the worst
   error over 9 gestures is 1.2e-11 cents. The old ring path was 0-2 cents off on average, but 17-119
   cents at keyframe corners. The scribble ran at half length (115 ms against 231 ms), about 1112
   cents (nearly an octave) high on average. Measured with the demo's `render_gesture(collect_viz=True)`
   record_vel against `renderGesture().recordVel` and the old `gestureMotion` keyframes, same seed and
   velocity.
2. **Do the plate movements run at the right speed?** Peak rate, peak time and stroke length match the
   demo exactly. For example, tear_fwd peaks at 1.23 at 154 ms over 231 ms, and transformer8 peaks at
   2.29 at 317 ms over 461 ms. The old path matched peak and time for 8 of 9 gestures. The scribble
   was 115 ms long and peaked at 1.32 at 22 ms against the demo's 0.99 at 0 ms, with 1.19x the travel.
3. **Why does DEViLBOX sound duller?** Energy above 4 kHz:
   - demo dry 1.1 %, demo bus 0.5 % (centroids 817 / 951 Hz);
   - old DEViLBOX dry 0.6 %, bus 0.3 % (826 / 885 Hz);
   - the old dry layer had half the demo's top, so it lost it before the bus, in the record read.

   The cause was not isolated further, because that whole path was replaced. The candidates are the
   OfflineAudioContext resample of the record, the S950 port's filters, and the 48 kHz Hermite ring.

   Now the record, strokes and bus null at -150 dB or better. The live 48 kHz path keeps the same top:
   0.5 % above 4 kHz, centroid 946 against 951 Hz. Its linear interpolator had lost 1.5 dB at 5 kHz;
   it is now a band-limited read.
4. **Does the live path run at a different rate?** Yes, by design. The bus clock is 22,050 Hz, the
   demo's own rate, whatever the context's rate. Strokes are rendered at 22,050 Hz and the 48 kHz
   output reads the bus through the sinc above. Records are read from their WAV bytes the demo's way.
   They do not go through the browser's `decodeAudioData`, which would resample to the context rate.

### Coordinator items (a)-(c) (owner on a hip-hop playlist)

- **(a) Scratch and juggle duty against the demo's boombap rate.** Not measured in this run. Phase 0
  found that only the 32-bar features reach the demo routine. Every other window is the overlay
  planner on the ring. Duty should be measured after PG-J.
- **(b) Single moves rather than whole routines.** The same finding: routines reach the executor only
  for the PEAK or BATTLE 32-bar feature, at most once per set phase. The rest are overlay phrases.
  Repeat counts per phrase were not measured here.
- **(c) Muffled, too much low end.**
  - The routine path now carries V2 (the low pass under v 0.5), V3 (+0.15 x a 3 kHz high pass over v
    0.85), the O4 S950 grit (exact), and the Deck C EQ (high pass 200 Hz). The stroke null covers
    velocities 0.30, 0.42, 0.88 and 0.93.
  - The ring path keeps its own tone stages until PG-J.
  - P7 profiles (east_coast, west_coast, trap, memphis) are not ported here (PG-J/PG-E).

## Other findings

- **The tail (SCR-AB-HEARD).** The planned lengths were the same, but DEViLBOX's strokes stayed loud
  about 30 ms less than the demo's, and the cause was the chain, not the stroke length. The old ring
  bus used scratch_dj's settings (room .30, delay .16, no deck_c_eq, no 0.22 dark-room tail) where the
  demo's three-deck routine uses room .42, delay .28 and the tail. The ring also stopped each stroke
  at its end beat (+4 ms), with a 3 ms ramp. The demo instead sums whole strokes, so a tail rides under
  the next stroke. Both are replaced: on the routine path the tail now nulls at -152 dB. How much each
  of the two causes contributed was not separately measured.
- **Late records at 48 kHz.** A record read on first use (fetch + S950) landed after its stroke's start
  on 3 of 15 first uses. The fix is to read the routine's records when it is planned
  (`prepareRecords`).
- **The level follower.** The live level is still needed when a routine cannot be shaped (a module deck
  has no buffer). It had started an 8 s follower at zero, which spiked the first strokes. It is now the
  layer's mean square since its first stroke, smoothed over 1 s.

## Open (ledger rows this work touches, not closed here)

- **X6 level.** Owner decision: 0.60 x the RMS of the A+B juggle decks. Implemented: the routine
  deck's own audio over the routine's span, computed ahead from its buffer (exact for one deck).
  Missing: deck B summed in when both play; module decks (no buffer) fall back to the follower.
- **X7 duck.** The same beat source as X6. It is exact on the A/B fixture.
- **X8.** The final mix's peak cap 0.98 scales the music deck, not the scratch layer, so it is not
  ported.
- **Live timing of the shape.** The duck reaches the bus when the routine is planned. The level waits
  for an offline render of the 32-bar layer, which took about 1-3 s here (unmeasured in a browser).
  Until it lands, the level follows the programme. The harness waits for it.
- **The voice-ring paths** (overlay, juggle response, transitions, pads, MCP, tracker samples): PG-J.
