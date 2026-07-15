---
date: 2026-07-15
topic: suntronic-gate2-cia-spike-fallback
tags: [suntronic, gate2, uade, cia, vblank, native-player, byte-exact, fallback]
status: final
---

# SunTronic Gate-2 — CIA/vblank fire-offset spike: DECISIVE, fallback reached

## Outcome (one line)
Measured the real fire clocks with a temporary UADE-WASM instrumentation spike.
It is a genuine **two independent-clock** system whose **relative phase is per-song
and set by unread module state (eagleplayer init cycles)** — NOT derivable from the
score. No shared-constant closed-form accumulator reaches 0/0. Per the plan's
fallback, **stop and keep the shipped 1/632**; do not bake a per-song table. Spike
fully reverted.

## What the spike measured (Phase A — executed, then reverted)
Temporary hooks (entry.c fire-log ring + `uade_wasm_on_sample`/`on_vsync`, audio.c
`write_left_right` sample counter, cia.c `CIA_vsync_handler` hook, 3 build.sh exports)
recorded the cumulative emitted-sample offset at every player interrupt fire, tagged
CIA-A (src=0) vs vblank/vsync (src=1). Two probes (`probe-fire-offsets`,
`probe-golden-offsets`) rendered gliders.src + ballblaser.src and dumped:

- **CIA-A fires: ZERO.** SunTronic's note handler is NOT driven by the CIA-A Timer A
  overflow hook. The `uade_wasm_on_cia_a_tick` path never fires for these modules.
- **vblank/EFFECTS clock is a clean float period.** Deltas alternate 880/881 →
  P_v ≈ 880.57 samples (= 44100 / 50.08 Hz). Uniform. **Shared across both songs.**
  This is the clock that advances vibrato/period ($20/$24).
- **Note-handler clock (golden rows) is independent.** Row-to-row sample deltas are
  880,1276,884,883,985,1024,1113,1292,… — NOT multiples of P_v (non-integer ratio, so
  note fires are not a subset of vblank fires). Linear fit → **T_a ≈ 1024.8 shared**
  across both songs, but with large per-row residual (rms ≈ 160, max ≈ 371 samples):
  genuine musical-rhythm jitter, not quantization.
- **Per-song relative phase.** First vblank offset: gliders φ_v = 355, ballblaser
  φ_v = 881. That phase difference is what places the vibrato "double" step at a
  different note-row per song (gliders doubles at rows 0,7,13,19…; ballblaser at
  5,12,18…). φ_v is set by how many cycles the eagleplayer's init consumes before the
  first vblank — module-dependent, **not readable from the score**.

## Why 0/0 is not reachable by a closed-form (Phase B — decisive, negative)
- Injecting the oracle-measured per-row vblank-fire count as `subtickSchedule`:
  best 9 (gliders) / 17 (ballblaser) mismatches. The measured schedule is noisy at
  the double positions (note-fire vs vblank-fire ordering within a row) and the count
  model is subtly wrong.
- Pure two-fixed-period Bresenham (T_a=1024, P_v swept 878–883, phase swept 0–1):
  **no phase zeros either song** (best 7 / 11). The note clock's real per-row jitter
  means a fixed T_a cannot reproduce the exact vblank-per-row counts.
- Every principled shared-constant schedule is **worse than the shipped heuristic's
  1/632.** The shipped `round(doubleK*6.25)` (ciaTick 882.759) is, empirically, the
  best deterministic single-clock approximation.

Reaching 0/0 requires reproducing UADE's cycle-accurate event interleave — the note
clock (CIA/Paula-driven, ~1024.8 with real jitter) AND the vblank EFFECTS float clock
(880.57) AND their per-song init phase. That is a UADE-scheduler port, a separate and
much larger effort. **Decision deferred to the user** (see Next Steps).

## Shipped state (unchanged this session)
- `SunTronicPlayer.ts`: committed double-position model. gliders 0/316 byte-exact,
  ballblaser 1/316 (residual t12 v0 — a single self-correcting vibrato-phase cell).
  Total **1/632.** NO JS change (fallback = keep).
- Both regressions green: `sunTronicGlidersTimeline.test.ts` (0/316),
  `sunTronicBallblaserTimeline.test.ts` (exact residual `t12 v0`). In test:ci.
- `sunTronicNoteTimeline.golden.test.ts` stays `describe.skip` (un-skip only at 0/0).
- type-check clean.

## Cleanup done (spike is temporary — obligations discharged)
- `public/uade/UADE.{js,wasm}` RESTORED to pre-spike dirty state, verified by checksum
  (js cc3a153a7a60c0ca075a981c72dff3b1ab7763c8, wasm 520744b431d57c6e8eaf9afe71ee61f52539d4cc).
- entry.c: spike block + CIA-A `fire_log_push(0)` + `capture_write` no-op stub removed
  (entry.c back to prior-session state, incl. the pre-existing/not-mine broken
  `capture_write` reference from dirty memory.c — untouched, not my feature to finish).
- third-party/uade-3.05 `src/audio.c`, `src/cia.c`: `git checkout` (were clean pre-spike).
- build.sh: 3 spike exports removed. No spike markers remain (grep-verified).
- Throwaway spike-WASM-dependent probes deleted. Kept `tools/suntronic-re/sweep-clock.ts`
  — WASM-free, reproduces the negative result (no closed-form fits both songs).

## Next Steps (ordered)
1. **DECISION for user:** is a cycle-accurate UADE-scheduler port (note CIA/Paula clock
   + vblank EFFECTS float clock + per-song init phase) worth it to close the last
   1/632? It is the only path to 0/0; the residual is a single self-correcting cell.
   Recommendation: accept 1/632 as byte-exact-enough for ship and move to Phase 4
   native playback + the other ~20 formats; revisit the scheduler port only if a later
   format needs the same two-clock fidelity.
2. If NOT porting the scheduler: proceed to Phase 4 (native playback wiring) and the
   arp/drin BSS port; the golden test stays skipped.
3. Do NOT rebuild/commit instrumented WASM or the submodule spike (all reverted).

## Artifacts
- Plan: `thoughts/shared/plans/2026-07-15-suntronic-gate2-cia-spike.md` (fallback branch hit).
- Prior handoff: `thoughts/shared/handoffs/2026-07-15_suntronic-gate2-readorder-1of632.md`.
- Negative-result probe: `tools/suntronic-re/sweep-clock.ts`.
