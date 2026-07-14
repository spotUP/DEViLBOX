---
date: 2026-07-15
topic: SunTronic Gate-2 byte-exact — port the uade CIA cycle scheduler to TS
tags: [suntronic, uade, cia, timing, gate-2, native-port, plan]
status: SUPERSEDED
---

> **SUPERSEDED 2026-07-15b — premise falsified. DO NOT IMPLEMENT.**
> Whole-song measurement (probe-fullsong-fires / probe-fire-eclock) proved the
> SunTronic clock is a **single constant 1024 samples/tick** (gliders 661/661,
> ballblaser 330/330 gaps = 1024, zero variance; CIA-A Timer-A never fires,
> tick_count=0). There is NO sub-fire CIA jitter and NO two-clock split. This plan
> ports a scheduler for a problem that does not exist. The real residual (130/316
> mismatches) is per-tick ARITHMETIC — vibrato depth/phase math + a small note-on
> row-timing offset — fixable entirely in `SunTronicPlayer.tick()` with no WASM
> change. See the corrected direction in
> `thoughts/shared/research/2026-07-15_uade-cia-scheduler.md` §9.

# Plan: byte-exact SunTronic via a cycle-accurate CIA clock in TS  [SUPERSEDED]

Research: `thoughts/shared/research/2026-07-15_uade-cia-scheduler.md`.
Decision (2026-07-15): user chose **port the CIA scheduler to TS as a live
accumulator, no committed schedule table**.

## Problem (domain terms)

`SunTronicPlayer.ts` is byte-exact for note/instrument content but leaves
14/632 golden mismatches on the per-fire `$20` (AUDxPER) period stream. Proven
by measurement (`probe-schedule-inject`, 2026-07-15): injecting UADE's *exact
integer subtick schedule* floors at 4/632 on gliders (accumulator floors at 3),
with residual cells being **off-by-one periods** — the signature of sub-fire
fractional sampling. The invariant violated: the native player samples each
voice's period on a **constant samples-per-tick grid** (`ciaTickSamples=881.5`),
but UADE fires the play-interrupt at **CIA E-clock cycle positions** that are
incommensurate with the ~80.4-cycle sample grid, so the true period write lands
at a fractional sample offset that drifts fire-to-fire. Integer subtick counts
cannot express that fraction.

## Abstraction level of the fix

Root lives at the **clock/timing layer**, not data/parameter/presentation. The
current constant-rate accumulator is one level too coarse. The fix replaces it
with a cycle-domain clock that reproduces where each CIA fire lands on the
sample grid — a real accumulator (colour-clock cycles / E-clock periods), NOT a
per-song table (a table would be the forbidden "hardcoded oracle schedule").

## Constraints

- WASM-free committed goldens/tests only (CI has no UADE-WASM). The C emit
  (Phase A) is a LOCAL oracle to derive/validate the TS math; its output is not
  committed and not run in CI.
- No hardcoded band-aid — express as a clock accumulator. No committed per-fire
  schedule table.
- Do NOT guess constants (CIA period, cycles/sample) — read them from the
  artifact / emulator via the Phase-A oracle.
- Every fix ships a fails-on-revert regression in test:ci.
- Do not commit the pre-existing dirty `public/uade/UADE.{js,wasm}`; a Phase-A
  WASM rebuild regenerates them locally only. C source changes to `uade-wasm/`
  are tracked and committed ONLY if they become part of the shipped oracle
  tooling (else kept local to the spike).

## Phase A — C oracle: emit exact per-fire cycle + CIA period (measurement)

Goal: read from the real emulator, per CIA-A Timer-A fire: (1) the absolute
`cycles` (colour-clock) timestamp, (2) the CIA period latch value SunTronic
actually programmed, (3) each voice's `$20` period at that instant. This is the
ground truth the TS accumulator must match; it also reveals whether a pure
CIA-period model suffices or an instruction-offset term is needed.

Steps:
1. In `uade-wasm/src/entry.c` `uade_wasm_on_cia_a_tick` (entry.c:618-677): when a
   diag flag is armed, append the current `cycles` (from `events.h`) and the CIA
   period (`ciaala`/`ciaata` reload latch from cia.c) to a capture ring, keyed by
   tick index. Add a WASM export `uade_wasm_get_cia_fire_log(ptr,max)`.
2. Rebuild WASM locally (`npm run` uade build target — confirm exact command;
   regenerates `public/uade/UADE.{js,wasm}`, LOCAL only, uncommitted).
3. New probe `tools/suntronic-re/probe-cia-fire-log.ts`: load gliders + ballblaser,
   render, dump per-fire (tickIndex, cycles, ciaPeriod, fractional sample =
   `cycles / (SOUNDTICKS_PAL/44100)`). Confirm:
   - the CIA period is constant per song and equals the module-programmed value
     (validates 881.5≈50Hz is really the E-clock period, read not guessed);
   - the fractional-sample offset per fire, and whether the instruction offset
     (period write happens N cycles into the handler) is constant or branches.

Automated verification (Phase A):
- probe prints a per-fire table for both songs; the CIA period matches the value
  read from the module's init code (cross-check against the disasm CIA write).
- fractional offsets are reproducible across render chunk sizes (render-independent,
  same property the golden already has).

Manual verification (Phase A):
- [ ] human confirms the emitted CIA period equals the module's programmed latch
  (not a fitted 881.5).

## Phase B — TS cycle clock in SunTronicPlayer

Goal: replace the constant `ciaTickSamples`/`rowPhaseSamples`/`subtickSchedule`
model with a cycle-domain clock.

Steps:
1. Add a cycle clock: track `cycles` (colour-clock, 3546895/frame), CIA period in
   E-clocks (period × DIV10=5 colour cycles). Fire when the accumulated cycles
   cross the CIA underflow; each fire's sample position = `cycles /
   (SOUNDTICKS_PAL/rate)`. Derive the period the golden records as the value at
   that fractional sample instant (matching how UADE's `update_audio` float
   accumulator lands samples, audio.c:594/689).
2. If Phase A shows a constant instruction-offset term, add it as a single named
   cycle constant (read from the oracle, documented), NOT a per-fire table.
3. Keep `subtickSchedule` as the diagnostic-only hook; the production path uses
   the cycle clock. Remove the `881.5` magic default in favour of the
   oracle-read CIA period.

Automated verification (Phase B):
- `probe-cia-sweep` / a new byte-diff harness: gliders 0, ballblaser 0 mismatches.
- type-check clean (`npm run type-check`).

## Phase C — ship & regression

Steps:
1. Remove `describe.skip` on the golden timeline test; wire it into `test:ci`
   (now byte-exact, WASM-free — reads the committed golden JSON).
2. Regression: the golden test itself is the fails-on-revert (revert the cycle
   clock → mismatches reappear). Confirm by temporarily reverting.
3. Update `SunTronicPlayer.ts` header comment + handoff; update memory
   (Gate-2 CLOSED if 0/0).

Automated verification (Phase C):
- `npm run test:ci` green with the un-skipped golden test.
- fails-on-revert confirmed.

## Risks & open items (resolve during Phase A, before B is finalised)

- **Instruction-offset variance**: if the `$20` write lands at a *branch-dependent*
  cycle offset within the handler, a pure CIA-period accumulator won't reach 0 and
  a cycle-exact 68k model would be needed (much larger). Phase A's fire-log
  quantifies this BEFORE committing to the Phase-B design — this is the gate. If
  variance is present, STOP and re-plan (do not guess).
- **Cross-format generality**: the cycle clock must generalise to the ~20 other
  formats. A live accumulator (vs table) is inherently general; confirm the model
  is parameterised by the module's CIA period, not song-specific.
- **ballblaser freqEnvSpeed** was unknown to the old integer probe; the cycle
  model sidesteps freqEnvSpeed (it samples periods directly, not via vib deltas).

## Success criteria

- gliders + ballblaser: 0/632 golden mismatches each.
- No committed schedule table; the clock is a parameterised accumulator.
- Golden test un-skipped and in test:ci, fails-on-revert.
- CIA period is read from the artifact/oracle, no fitted 881.5 magic number.
