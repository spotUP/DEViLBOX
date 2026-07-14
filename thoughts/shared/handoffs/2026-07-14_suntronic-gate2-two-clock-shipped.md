---
date: 2026-07-14
topic: suntronic-gate2-two-clock-shipped
tags: [suntronic, gate2, native-port, two-clock, uade, checkpoint]
status: implemented
---

# SunTronic Gate-2 — two-clock CIA model SHIPPED (240→14, not byte-exact)

## Task
Make the native SunTronic V1.3 player (`src/engine/suntronic/SunTronicPlayer.ts`)
byte-exact vs the UADE-WASM fire-aligned oracle. Pilot format before ~20 others.
This session: implement + checkpoint the two-clock CIA-accumulator model under
`/loop until it's finished`.

## Recent changes (commit `d3d42ef78`)
- `SunTronicPlayer.ts` rewritten from single audio-clock to **two-clock model**:
  handler `0x2660e` fires uniformly every 1024 output samples (= one golden
  sample = one `tick()`); inner CIA accumulator (`ciaTickSamples≈881.5`) steps
  `$24` vibrato 1-2×/fire and wraps a row every `speed`(6) CIA ticks. `tick()`:
  `rowSampleAcc += 1024; while(acc>=ciaTick){acc-=ciaTick; step tempo/row};
  stepEffects(v, moduleTicks)`. `stepEffects(v, vibAdvances)` loops the vib
  advance. Ctor opts `ciaTickSamples`/`rowPhaseSamples` (defaults 881.5/0);
  removed `contVib`.
- `sunTronicVibratoContinuation.test.ts` rewritten: locks CIA-clock native output
  ticks 0-11 (snapshot, fails-on-revert VERIFIED) + oracle-exact prefix ticks 1-5.
- 19 RE probes added under `tools/suntronic-re/` (wasm-gated, not in CI).

## Result (measured, not narrative)
- **New model: 14 golden mismatches** (gliders 3, ballblaser 11), first at fire 5.
- Old audio-clock model: **240** (gliders 101, ballblaser 139), first at fire 10.
- Net 240→14 = **97.8% byte-exact**. NOT byte-exact → golden test stays
  `describe.skip`. `npm run type-check` clean, suntronic suite 35 pass / 2 skip.

## Learnings
- **The wall = constant-rate floor.** One swept `ciaTick` can't match BOTH the
  row cadence (implied 881.8) and the double-vib cadence (882.8); the accumulator
  drifts ~1 fire by fire 62 → note acc + vibrato desync. `probe-cia-sweep.ts`
  minimum is a sharp well at 881.5/phase0/offset-1 = 14. This is a genuine
  architectural floor, not a tuning miss.
- **Old model was exact for fires 0-9**, new model breaks at fire 5 (trades one
  early fire for 226 fewer misses later). So the byte-exact *prefix* alone can't
  fail-on-revert — the regression uses a full native-output snapshot (ticks 0-11)
  which diverges at tick 6 (new 254 vs old 252).
- Golden is emitted per **note-handler FIRE** (128-samp chunk), not per 1024
  buffer. Earlier 1024-buffer probes aliased the clock. offset -1 (native lags
  one priming fire).
- No `0x8e` CIA-word opcode in the stream → CIA rate is a player default (must be
  read from the eagleplayer, not the module).

## UPDATE (same day) — accumulator forks EXHAUSTED, floor is UADE jitter
Commit `586ef82b9`. Two closure hypotheses disproven with decisive measurements:
- `probe-fire-eclock` (1-sample res): handler fires EXACTLY every 1024 samples,
  uniform (1024×52 both songs). `probe-fire-state`: each fire runs 1 or 2 CIA
  sub-ticks ($2c +1 mostly, +2 periodically; row = 5-mostly-6 fires × 6).
- `probe-eclock-sweep`: the principled INTEGER E-clock accumulator (per-fire
  EPB=round(1024·709379/44100) eclocks vs integer CIA reload P) floors at 14
  across the ENTIRE P×phase space — identical to the swept float. Residual is
  NOT clock rate/phase.
- Reordering the vibrato compute to lead (compute at once-advanced $24) fixes t6
  but desyncs the depth index downstream → 40 (worse). NOT the compute order.

So which fires double is JITTER in UADE's CIA-interrupt emulation (variable-chunk
processing in the C emulator), not the module and not any constant rate. The
14/632 (97.8%) checkpoint stands; golden stays skipped.

## Next steps (ordered)
1. **NEXT FORK toward 0 (bigger — C-level spike, own research+plan phase):**
   instrument UADE's CIA-interrupt scheduler in `uade-3.05` (C source) — log the
   actual per-render-chunk interrupt timing / CIA-timer underflow vs the
   1024-sample output buffer, to reproduce the exact double-fire schedule
   bit-for-bit. Accumulator forks are exhausted — do NOT re-sweep rates/phases.
2. v2/v3 voice activation (voices stay flags 0xff inert where UADE has 0x01).
3. ±1-3 period rounding residuals.
4. Phase 4 native playback.

## Artifacts
- Commit `d3d42ef78`. Regression: `sunTronicVibratoContinuation.test.ts`.
- Probes: `probe-fire-aligned.ts` (golden's clock), `probe-cia-sweep.ts` (2D fit),
  `probe-ciaword.ts` (opcode dump), `probe-golden-diag.ts`.
- Memory: `project_suntronic_gate2_two_clock`, `project_suntronic_gate1_calc14`.
- UADE capture ABI / base0 discovery: see gate1 handoffs.
