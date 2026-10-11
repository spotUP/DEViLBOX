---
date: 2026-10-11
topic: Scratch baseline (SCR-P0) - what the scratch system is before the scratch DJ work, measured from the code and two probes
tags: [dj, scratch, baseline, research, probe]
status: final
---

# Scratch baseline (Gate A, SCR-P0.1 / P0.2 / P0.5 / P0.6)

Ledger: `thoughts/shared/plans/2026-10-11-scratch-dj-progress.md` Phase P0. Owner plan Gate A (`2026-10-08-dj-view-scratch-plan.md` section 92): verify manual scratch, patterns, platter, crossfader, stop, release, phase alignment, tracker scratch, audio scratch; completion = existing scratch regression tests pass.
Lock test: `src/engine/dj/__tests__/scratchBaseline.test.ts` (19 patterns in order, 25 action ids, release timing). Every number below is read from the code at commit `9ef33db07` unless a probe is named.

## 1. Manual (jog) scratch

- Entry: `DJActions.startScratch(deckId)` `src/engine/dj/DJActions.ts:564` -> `DeckEngine.startScratch()` `src/engine/dj/DeckEngine.ts:1112`; `DJActions.setScratchVelocity(deckId, v)` :575 -> `DeckEngine.setScratchVelocity(v)` :1147 (clamped to [-4, 4]); `DJActions.stopScratch(deckId, decayMs = 200)` :587 -> `DeckEngine.stopScratch(decayMs = 200)` :1291.
- `startScratch` snapshots `_wasPlayingAtScratchStart` (:1122) and resets `scratchDirection = 1`, the jog direction-switch cooldown (`JOG_DIR_SWITCH_COOLDOWN_MS = 20`, :165) and the slip ghost position (audio mode only, :1137-1141).
- Velocity: pattern scratches use a +-0.02 dead zone (:1174); jog input switches direction through `_switchToBackward` / `_switchToForward` (:1397 ff.), backward phases read the ring (`DeckScratchBuffer.startScratch(rate, 'write')`, forward phases drive the source at `|v|`; a stopped backward phase pauses the source after a 10 ms timer (:1451-1464) and parks the rate at 0.02 (:1413-1416).
- Platter: `src/components/dj/DeckTurntable.tsx` pointer down = `startScratch` + velocity 0 (:191-192); vertical drag -> `v = clamp(dy * 0.15, -4, 4)` (:201-204); release = momentum decay (cubic ease-out over `MOMENTUM_DECAY_MS`, velocity clamped away from zero at +-0.1, :155-162) then `stopScratch(deckId, 0)` (:170). The vinyl views (`DeckVinylView.tsx:103-118`, `DeckVinyl3DView.tsx:320-327`, `DeckCssTurntable.tsx:147`) release with `stopScratch(deckId, 50)`; `DeckPatternDisplay.tsx:145-180` drags the pattern display the same way (`stopScratch(deckId, 0)`).

## 2. Stop, release, phase alignment (`DeckEngine.stopScratch`, :1291-1391)

| Step | When | What |
|---|---|---|
| deck was stopped at scratch start | at once | ring gain to 0, source paused, rate reset to `restMultiplier`, deck gain 1, no decay (:1304-1337) |
| backward at release | at once | `_switchToForward(1)` (:1352) |
| decay | 0 .. 200 ms (`decayMs` default 200) | `_decayToRest(decayMs)` rAF ramp of pitch/tempo (or audio rate) to `restMultiplier` (:1355, :1547) |
| hard reset | `decayMs + 50` ms | ring gain 0, deck gain 1, rate forced to `restMultiplier` (:1345-1370) |
| phase align | `decayMs + 350` ms | if quantize is on, the OTHER deck plays with a beat grid and this deck has one: `phaseAlign(this, other, bar or beat)` (:1376-1390) |

Timers are tracked in `_stopScratchTimeouts` and cleared on dispose (:2362). `DJActions` resets store `scratchActive` and `scratchVelocity` before the engine call (:588-589). The master reset path (`DJActions.ts:774`) calls `stopScratch(d, 50)`.

## 3. The 19 patterns (`src/engine/dj/DJScratchEngine.ts`)

`SCRATCH_PATTERNS` :607 in canonical order (index = keyboard command / `Xnn` low nibble): Baby Scratch, Transformer, Flare, Hydroplane, Crab, Orbit, Chirp, Stab, Scribble, Tear, Uzi, Twiddle, 8-Finger Crab, 3-Click Flare, Laser, Phaser, Tweak, Drag, Vibrato. `ScratchPattern` :38: `durationBeats | durationMs`, `loop`, `quantize` ('1/4' | '1/8' | false; implemented :699 ff. with a 500 ms cap, unused by every pattern), `interpolateVelocity`, `trueReverse`, `frames[] {timeFraction | timeMs, velocity, faderGain}`.

`ScratchPlayback` (same file): pattern clock `setInterval(.., 10)` (:761), phase from `replayer.getElapsedMs() % cycle`, fader = the deck channel gain, Transformer / Crab chop duty 0.40 / 0.28 / 0.20 (:826-828). Stop: `DeckEngine.stopPattern()` :1629 -> `_decayToRest(300)` (:1652). Reverb send while a pattern or fader LFO runs: convolver IR 0.6 s / 4 kHz, 25 % wet (`DeckEngine.ts:122-124`).

## 4. Action paths (three, parallel)

- `ScratchActionId` `src/types/drumpad.ts:43`: 19 `scratch_*` + `scratch_stop` + `fader_lfo_off|1_4|1_8|1_16|1_32` = 25.
- Keyboard: `src/engine/keyboard/commands/djScratch.ts` (`triggerPattern` :35 toggles, `startPattern` :76 / stop :107 hold; deck = the playing deck, A > B > C).
- Pads: `src/hooks/drumpad/useMIDIPadRouting.ts:49-58` maps every `scratch_*` id to the keyboard command.
- Deck UI: `src/components/dj/DeckScratch.tsx` (`TAP_MS = 300` :49; press -> `playDeckPattern` :73; release < TAP_MS finishes the cycle, else stops :93).
- `DJActions.playDeckPattern` :977, `stopDeckPattern` :990, `finishDeckPatternCycle`, `startDeckFaderLFO` :1008, `stopDeckFaderLFO` :1017.
- Tracker effect `Xnn`: `DeckEngine._handleScratchEffect` :1793 (high nibble 0: 1-6 = Baby..Orbit, 0 stop; high nibble 1: fader LFO 1/4, 1/8, 1/16, 1/32, 0 off).
- The DJ FX registry (`src/engine/drumpad/DjFxActions.ts`) has no scratch action; Auto DJ fires no scratch (plan "What exists today").

## 5. Crossfader

`DJActions.setCrossfader(position)` :459 clamps to [0, 1], sets `DJMixerEngine.setCrossfader` and writes the store directly (no rAF batching, :463-470). No scratch code reads or writes it; every pattern "fader" is the per-deck channel gain (`DeckEngine.getChannelGainParam()` :1579).

## 6. Tracker scratch

`src/engine/TrackerScratchController.ts` (ring id `TRACKER_SCRATCH_BUFFER_ID = 3`, `DeckScratchBuffer.ts:25`): trackpad / grab / MIDI jog through `TurntablePhysics` (`src/engine/turntable/TurntablePhysics.ts`: `MAX_RATE = 4.0` :59, `HAND_COUPLING = 80` :64, slipmat couplings 3.5 / 8.0 :75-80, breakaway 0.15 rad/s :84, motor P gain 8 :56). Tuning: `IDLE_TIMEOUT_MS = 300`, `GRAB_TOUCH_COUNT = 3`, `SCROLL_IDLE_THRESHOLD = 1`, `SCROLL_SIGNIFICANT_THRESHOLD = 2`, `SCROLL_RELEASE_MS = 150`, `PLAYBACK_START_GRACE_MS = 800` (:38-62). Fader-only patterns `startFaderPattern` :855 / `stopFaderPattern` :885 / `setFaderCut` :807 / `setFaderGain` :827; spinback :436, power cut :453, electronic brake :472. Not in this plan (research 1.7: a separate unification item).

## 7. Audio scratch (audio-mode deck)

`DeckAudioPlayer.setPlaybackRate` clamps 0..4x (`src/engine/dj/DeckAudioPlayer.ts:313`); position tracking uses rate-change checkpoints for scratch (:39, :370). Forward phases of a jog or pattern scratch drive this rate; backward phases read the ring, like module mode.

## 8. The ring (`public/worklets/scratch-buffer.worklet.js`)

`BUFFER_SECONDS = 120` (:20), `RATE_SMOOTH_SEC = 0.005` (:28), `ZERO_FADE_SAMPLES = 48` (:35); module-level rings per `bufferId` (decks 0/1/2, tracker 3). Capture messages `freeze`, `unfreeze`, `sourceRunning`, `reset` (:95-110); playback messages `start {startPos, rate}`, `setRate`, `startFromWrite {rate, anchor}`, `stop` (replies `stopped {framesBack}`), `snapRate` (:210-278). Reader: per-sample rate smoothing, zero-crossing fade, `readPosF += rate` THEN 4-point cubic Hermite at `floor(readPosF)` (:330-357). There is no "load a static record" and no "start at position P" message for a record voice yet (P2).

## 9. SCR-P0.2 - the lock run

`VITEST_MAX_WORKERS=1 npx vitest run` on commit `9ef33db07`, 2026-10-11: 5 files, 61 tests, all green.

| Suite | Tests |
|---|---|
| `src/engine/dj/__tests__/scratchPatterns.test.ts` | 15 |
| `src/engine/dj/__tests__/scratchActions.test.ts` | 16 |
| `src/engine/dj/__tests__/scratchBackwardFromNeedle.test.ts` | 3 |
| `src/engine/keyboard/commands/__tests__/djScratch.test.ts` | 25 |
| `src/engine/__tests__/scratchRestoresSuppressNotes.test.ts` | 2 (52.8 s, drives a real deck) |

## 10. SCR-P0.5 - anchor sample rate probe

`npx tsx --tsconfig tsconfig.app.json tools/scratch-catalogue-probe.ts`, 2026-10-11. File durations are read from each WAV's `data` chunk (all 50 pack files: 44,100 Hz, stereo, 24-bit). Result: **the metadata is in samples at 22,050 Hz.** `safe[1]` fits the file in 50 of 50 at either rate, but at 22,050 Hz the tails sit at a median 0.964 of the record (0.88-0.99) while at 44,100 Hz every tail sits at about half the record (median 0.482) - which no analyser would produce. `duration_ms` in the metadata equals the file duration for all 50 (no drift > 1 ms). Loader constant for P2.1: `SCRATCH_METADATA_RATE = 22050`.

| record | file | file ms | meta ms | safe[1] | /22050 ms | tail@22050 | /44100 ms | tail@44100 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| ONE | scratch_024.wav | 434.9 | 434.9 | 8459 | 383.6 | 0.88 | 191.8 | 0.44 |
| TWO | scratch_025.wav | 721.8 | 721.8 | 14353 | 650.9 | 0.90 | 325.5 | 0.45 |
| THREE_TWO_ONE | scratch_010.wav | 1816.3 | 1816.3 | 38761 | 1757.9 | 0.97 | 878.9 | 0.48 |
| THREE | scratch_026.wav | 697.3 | 697.3 | 14876 | 674.6 | 0.97 | 337.3 | 0.48 |
| A_YEAH | scratch_050.wav | 922.4 | 922.4 | 20059 | 909.7 | 0.99 | 454.9 | 0.49 |
| AH_ALT_3 | scratch_042.wav | 892.0 | 892.0 | 19400 | 879.8 | 0.99 | 439.9 | 0.49 |
| AH_ALT_2 | scratch_052.wav | 892.0 | 892.0 | 19399 | 879.8 | 0.99 | 439.9 | 0.49 |
| AH_FRESH_FULL_PHRASE | scratch_044.wav | 2207.1 | 2207.1 | 48353 | 2192.9 | 0.99 | 1096.4 | 0.50 |
| AH_STANDARD | scratch_001.wav | 936.7 | 936.6 | 19558 | 887.0 | 0.95 | 443.5 | 0.47 |
| AH_ALT | scratch_009.wav | 760.4 | 760.4 | 16383 | 743.0 | 0.98 | 371.5 | 0.49 |
| LONG_AH_YEAH | scratch_037.wav | 876.7 | 876.7 | 18845 | 854.6 | 0.97 | 427.3 | 0.49 |
| ALRIGHT_STOP | scratch_007.wav | 923.4 | 923.4 | 15371 | 697.1 | 0.75 | 348.5 | 0.38 |
| AH_YEAH | scratch_031.wav | 736.2 | 736.2 | 15996 | 725.4 | 0.99 | 362.7 | 0.49 |
| BOY | scratch_033.wav | 449.7 | 449.7 | 8792 | 398.7 | 0.89 | 199.4 | 0.44 |
| CHECK_THIS_OUT | scratch_030.wav | 808.6 | 808.6 | 17024 | 772.1 | 0.95 | 386.0 | 0.48 |
| DO_IT_AGAIN | scratch_034.wav | 789.1 | 789.1 | 16393 | 743.4 | 0.94 | 371.7 | 0.47 |
| EY_YO | scratch_015.wav | 603.2 | 603.2 | 12891 | 584.6 | 0.97 | 292.3 | 0.48 |
| FRESH_YEAH | scratch_011.wav | 1277.3 | 1277.3 | 26356 | 1195.3 | 0.94 | 597.6 | 0.47 |
| FRESH_STANDARD | scratch_003.wav | 967.8 | 967.8 | 19177 | 869.7 | 0.90 | 434.9 | 0.45 |
| FRESH_ALT | scratch_043.wav | 627.6 | 627.6 | 12671 | 574.6 | 0.92 | 287.3 | 0.46 |
| FRESH_ALT_4 | scratch_035.wav | 931.1 | 931.1 | 16103 | 730.3 | 0.78 | 365.1 | 0.39 |
| HE_CUT_THE_MUSIC | scratch_036.wav | 2285.2 | 2285.2 | 50218 | 2277.5 | 1.00 | 1138.7 | 0.50 |
| HERE_WE_GO_AGAIN | scratch_017.wav | 898.7 | 898.7 | 19038 | 863.4 | 0.96 | 431.7 | 0.48 |
| HEY_HEY | scratch_038.wav | 1010.9 | 1010.8 | 21764 | 987.0 | 0.98 | 493.5 | 0.49 |
| HEY | scratch_046.wav | 647.1 | 647.1 | 12905 | 585.3 | 0.90 | 292.6 | 0.45 |
| HIP_HOP | scratch_019.wav | 408.4 | 408.3 | 8674 | 393.4 | 0.96 | 196.7 | 0.48 |
| GENERIC_HIT | scratch_032.wav | 297.9 | 297.9 | 6336 | 287.3 | 0.96 | 143.7 | 0.48 |
| IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT | scratch_057.wav | 2442.9 | 2442.9 | 53832 | 2441.4 | 1.00 | 1220.7 | 0.50 |
| LADIES_AND_GENTLEMEN | scratch_029.wav | 1277.5 | 1277.5 | 25836 | 1171.7 | 0.92 | 585.9 | 0.46 |
| LASER_FX | scratch_008.wav | 865.4 | 865.4 | 18837 | 854.3 | 0.99 | 427.1 | 0.49 |
| NOW_LONG | scratch_022.wav | 978.1 | 978.1 | 20097 | 911.4 | 0.93 | 455.7 | 0.47 |
| OOH_LONG | scratch_012.wav | 495.9 | 495.9 | 10480 | 475.3 | 0.96 | 237.6 | 0.48 |
| SAY_WHAT | scratch_018.wav | 539.1 | 539.1 | 11576 | 525.0 | 0.97 | 262.5 | 0.49 |
| SCRATCH_005 | scratch_005.wav | 960.8 | 960.8 | 18249 | 827.6 | 0.86 | 413.8 | 0.43 |
| SCRATCH_006 | scratch_006.wav | 571.1 | 571.1 | 12305 | 558.0 | 0.98 | 279.0 | 0.49 |
| SCRATCH_013 | scratch_013.wav | 621.2 | 621.2 | 11827 | 536.4 | 0.86 | 268.2 | 0.43 |
| SCRATCH_027 | scratch_027.wav | 1143.0 | 1143.0 | 21947 | 995.3 | 0.87 | 497.7 | 0.44 |
| SCRATCH_028 | scratch_028.wav | 632.2 | 632.2 | 13684 | 620.6 | 0.98 | 310.3 | 0.49 |
| SCRATCH_039 | scratch_039.wav | 753.9 | 753.9 | 16174 | 733.5 | 0.97 | 366.8 | 0.49 |
| SCRATCH_048 | scratch_048.wav | 2000.0 | 2000.0 | 43743 | 1983.8 | 0.99 | 991.9 | 0.50 |
| SCRATCH_051 | scratch_051.wav | 278.7 | 278.7 | 5815 | 263.7 | 0.95 | 131.9 | 0.47 |
| STOP_THAT | scratch_021.wav | 808.6 | 808.6 | 17297 | 784.4 | 0.97 | 392.2 | 0.49 |
| THE_LIKS | scratch_016.wav | 2712.9 | 2712.8 | 59587 | 2702.4 | 1.00 | 1351.2 | 0.50 |
| UH_HAH | scratch_045.wav | 561.5 | 561.5 | 12107 | 549.1 | 0.98 | 274.5 | 0.49 |
| UH_SHORT | scratch_004.wav | 252.3 | 252.3 | 4281 | 194.1 | 0.77 | 97.1 | 0.38 |
| WELCOME_TO_THE_NEXT_LEVEL | scratch_014.wav | 1950.2 | 1950.2 | 36388 | 1650.2 | 0.85 | 825.1 | 0.42 |
| WHOO_LONG | scratch_047.wav | 413.9 | 413.9 | 8156 | 369.9 | 0.89 | 184.9 | 0.45 |
| YEAH_BOY | scratch_041.wav | 1740.9 | 1740.9 | 37663 | 1708.1 | 0.98 | 854.0 | 0.49 |
| YEAH_STANDARD | scratch_002.wav | 509.8 | 509.8 | 7582 | 343.9 | 0.67 | 171.9 | 0.34 |
| YEAH_ALT | scratch_023.wav | 550.9 | 550.9 | 11902 | 539.8 | 0.98 | 269.9 | 0.49 |

records: 50
22050 Hz: safe[1] fits the file in 50 of 50; median tail fraction 0.964
44100 Hz: safe[1] fits the file in 50 of 50; median tail fraction 0.482
file duration vs metadata duration_ms differ by > 1 ms: 0

Byte identity (PROVENANCE.md command) against `/Users/spot/Code/Up_Rough_Demo_System/scratch-originals`: 50 of 50 `[OK]`.

## 11. SCR-P0.6 - ring / record voice feasibility probe

`src/engine/dj/__tests__/scratchRingReadsStaticRecord.test.ts` renders the real worklet in an `OfflineAudioContext` (48 kHz, `installRealWebAudio` + `resolveWorkletsFromPublic`): a 24,000-frame deterministic record (220 Hz + 1,375 Hz partials + seeded noise + DC) is written into ring id 4 through the capture processor, capture is frozen at 0.6 s and the playback processor gets `start {startPos: 0, rate: 1}`.

| Measure | Value |
|---|---|
| playback onset after the start message | 0 frames (message applied in the next quantum) |
| idle output before the start | peak 0 (nothing leaks while a ring is loaded but not playing) |
| output[k] vs record[k + 0] | rms 4.87e-2, max 1.43e-1 (one-sample offset) |
| output[k] vs record[k + 1] | rms 0, max 0 (bit-exact) |
| output[k] vs record[k + 2] | rms 4.87e-2 |
| L vs R | identical |

**Decision D4 stands: the existing Hermite reader plays a static record unchanged at rate 1; no second reader.** One property to carry into P2.1's `startAt(positionFrames, rate)`: the reader pre-increments (`readPosF += rate` before the read), so the first sample out is `startPos + 1`; a record voice that must start exactly on an anchor posts `startPos = anchorFrames - 1` (at rate 1) or accepts a one-frame (21 us) lead. At fractional positions the Hermite kernel interpolates as it does for every deck scratch today.

## Open items carried to later phases

- `SCRATCH_METADATA_RATE = 22050` (P2.1); `startPos + 1` lead (P2.1 / P3).
- 7 pack files without a record (020, 040, 049, 053, 054, 055, 056): FX pack only (owner decision 3); `scratch_052` stays out of the browser (`SCRATCH_SKIPPED`).
