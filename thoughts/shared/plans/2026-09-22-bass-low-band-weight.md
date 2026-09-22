---
date: 2026-09-22
topic: Dub bus BASS control — low-band weight stage and pre-insert trim
tags: [dub, master-insert, bass, saturation, programme-level]
status: implemented
---

# BASS control: heavy, monotonic, no choke

## Problem, in the domain's terms

The BASS control must make the low end heavier across its whole travel, at a
fixed output ceiling, on tracker programme. Three invariants were violated:

1. **Voicing below the programme.** The shelf corner sat at 60–80 Hz. AHX and
   most tracker bass lives at 80–200 Hz, and small speakers reproduce nothing
   below ~80 Hz. Measured on the live insert: +0.5 dB broadband for +18 dB of
   shelf at 60 Hz. Moved live to 150 Hz — user: "it feels heavier".
2. **Weight from gain alone.** Every dB of heaviness was a dB of level, which
   ran into `masterSafetyClip` (0.9) and the master limiter at the top of the
   control. User: "at 90% it sounds heavier than at 100%". Dub weight is
   harmonics as much as level — a saturated low band reads as heavy on any
   speaker without needing the level.
3. **Trim measured after the boost.** `shelfTrimForProgramme` reads
   `AudioDataBus`, which meters the master *after* the insert. Each slider step
   measured its own boost, so the trim ratcheted up faster than the shelf.

## Levels the fix could live at

- Parameter (raise the corner default): necessary, not sufficient — fixes 1
  only.
- Presentation (slider range/curve): a band-aid; the choke is in the graph.
- **Algorithm / graph (chosen):** add a parallel low-band weight stage, and
  measure the trim's reference before the insert. This is where invariants 2
  and 3 actually live.
- Infra (neural bass amp on the low band): the same structure with a costlier
  saturator. The waveshaper stage is built so the saturator node can be swapped
  for a `GuitarMLEngine` bass model later without re-plumbing. Not in this
  plan — CPU on the master, always-on, is a separate decision.

## Design

### A. Corner voicing
- `DEFAULT_DUB_BUS.bassShelfFreqHz` 80 → 150.
- Tubby preset `bassShelfFreqHz` 60 → 90 (the research doc's own figure,
  `2026-04-20_dub-sound-coloring.md` §B; the preset contradicted it).
- BUS-tab slider title reads the live corner (already does).

### B. Low-band weight stage (parallel, inside the master insert)

```
masterHpf ─┬─ masterBassShelf ─────────────────────────┐
           └─ lowBandLp (LP, Q 0.707, fc = shelf Hz) ──┤
                → lowBandDrive (gain)                   ├─ masterBassPunch → clip → …
                → lowBandSat (WaveShaper, tape curve)   │
                → lowBandComp (DynamicsCompressor)      │
                → lowBandGain ──────────────────────────┘
```

- 2nd-order Butterworth LP, not LR4: summed in parallel with the dry path a
  2nd-order LP is 90° at fc (|1+j| = +3 dB, no notch); LR4 is 180° and cancels.
- Saturator: `makeTapeSatCurve(1.0)` fixed; drive is the input gain so the
  curve is never regenerated on a slider move.
- Compressor: threshold -24 dB, ratio 4, attack 10 ms, release 150 ms, knee 6.
  Evens the bass so sustain reads as weight.
- Mapping, pure, in `src/lib/dub/lowBandWeight.ts`:
  `lowBandWeightFor(bassShelfGainDb)` → `{ drive, gain }`,
  `t = clamp(db, 0, 12) / 12`, `drive = 1 + 5t`, `gain = 0.5t`.
  Zero at or below 0 dB; monotonic; bounded (band peak ≤ 0.5 after the
  normalised curve).
- Applied from `_applyMasterInsertTone`; `gain` is 0 when the insert is not
  active (neutralise path).

### C. Pre-insert programme reference
- `registerMasterInsertPoint(source, dest)` taps `source` with an
  AnalyserNode (fftSize 2048, smoothing 0.4).
- `readProgrammeFromAnalyser(analyser)` (pure over the two buffers) gives
  `{ peak, rms, lowShare }`; `lowShareFromSpectrum` lives in
  `src/lib/dub/programmeLevel.ts` next to `shelfTrimDb`.
- `_applyMasterInsertTone` passes that reading to `shelfTrimDb` instead of
  `shelfTrimForProgramme()`. Falls back to the post-insert reading when the
  tap has not been registered.

### D. Probes
- `insertProbe.masterLowBandGain`, `masterLowBandDrive`.
- `masterInsertLevels.lowBand` tap after `lowBandGain`.

## Checklist

- [x] LB-1 Corner defaults: DEFAULT 150, tubby 90; DEFAULT Q 0.9 → 0.7 (shelf overshoot at 150 Hz landed on the low mids — "everything gets muddled") (`src/types/dub.ts`).
- [x] LB-2 `src/lib/dub/lowBandWeight.ts` + tests (zero ≤ 0, monotonic, bounded).
- [x] LB-3 Low-band nodes built and wired in `DubBus` constructor, parallel to
      the shelf, summed at `masterBassPunch`.
- [x] LB-4 `_applyMasterInsertTone` drives drive/gain from `bassShelfGainDb`
      and the LP corner from `bassShelfFreqHz`; neutralise path zeroes gain.
- [x] LB-5 Pre-insert analyser in `registerMasterInsertPoint`; disposed in
      `dispose()`.
- [x] LB-6 `lowShareFromSpectrum` + `readProgrammeFromAnalyser`, tests.
- [x] LB-7 Trim uses the pre-insert reading (fallback: post-insert).
- [x] LB-8 Probes: `masterLowBandGain`, `masterLowBandDrive`, `lowBand` level.
- [x] LB-9 Source-shape test: band wired parallel, summed before punch,
      `_applyMasterInsertTone` calls `lowBandWeightFor`.
- [x] LB-10 `npm run type-check`; dub + lib/dub suites.
- [ ] LB-11 Live: BASS 0 → 12 on amanda.ahx, `masterInsertLevels.lowBand`
      rises monotonically, `insertOut` does not fall at the top.
- [ ] LB-12 User listening verdict at `http://localhost:5174`.

## Automated verification
- `npx vitest run src/lib/dub src/engine/dub`
- `npm run type-check`

## Manual verification
- Reload, amanda.ahx, bus on, auto off, BASS 0 → 12: heavier the whole way,
  no drop or squash at the top.
