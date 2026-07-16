---
date: 2026-07-16
topic: suntronic-resampler-phase-port
tags: [suntronic, gate-e, fidelity, paula, resampler, phase-drift, multi-session]
status: draft
---

# SunTronic Gate E — resampler phase port (whole-song synth-voice fidelity lock)

## Goal

Lift native synth-voice fidelity to the flip threshold (per-song minFid over synth
voices ≥ 0.90 at maxLag 640) by making the Paula resampler integrate the period
trajectory in phase with UADE, instead of applying one flat bucket/vblank-latched
period. Sampled voices (type-B) + dead-voice cases are OUT of scope here — tracked
as the separate Gate-D content residual, addressed only after the synth phase
clock is trustworthy.

## Confirmed inputs (from research 2026-07-16_suntronic-fidelity-drift-mechanism.md)

- Synth voices are PURE PHASE DRIFT, recoverable: analgestic2 v0/v3 reach 0.93 at
  wide maxLag; ballblaser v0/v3 still climbing at 48000 (hardest case = the gate).
- The per-bucket period trajectory is byte-exact (ballblaser golden 1/316) — do
  NOT touch the player's period math or the golden path.
- The committed `stepVblank` is right-rate / wrong-granularity: it latches one
  period per vblank step. Same average rate as the old bucket path → inert.
- `SunTronicPlayer.stepAll()` rewrites `v.period` in `stepEffects` every step; the
  per-vblank period sequence therefore exists and is exposable.

## Key constants (verbatim)

- `PAULA_CLOCK_PAL = 3546895`; `NATIVE_SAMPLE_RATE = 44100`; `BUCKET = 1024`
- `VBLANK = 1024*25/29 = 882.759`; resampler `inc = PAULA_CLOCK_PAL/period/44100`
- per-song vblank phase φ_v: gliders 355, ballblaser 881 samples (init-cycle
  state; NOT yet score-derivable)

---

## Phase 2a — DECISIVE PROBE FIRST (do NOT write production code before this)

Open question the port hinges on: **is the residual drift explained by vblank
sub-phase alignment (φ_v) applied to the true per-vblank period, or does the
sub-bucket period application itself carry error even at the right phase?**

Probe (`tools/suntronic-re/probe-resampler-phase.ts`, throwaway):

1. Drive the player with `tick()` (byte-exact 1024 path) but capture, per bucket,
   the ORDERED list of `(stepAll-index → v.period)` produced within that bucket
   (1 or 2 entries; expose via a debug hook, not the shipped snapshot).
2. Re-render each voice's resampler applying those periods at sub-bucket sample
   offsets, with a swept vblank phase φ ∈ {0 … 1023 step 32}.
3. For ballblaser + analgestic2, report `voiceFidelity(maxLag 640)` per φ.

Discriminator:
- **If a φ per song collapses drift → v0/v3 ≥ 0.90 at maxLag 640:** mechanism =
  φ_v alignment. Proceed to 2b + derive φ_v (2c).
- **If NO φ reaches 0.90:** sub-bucket application is lossy even in-phase — the
  resampler must interpolate period between steps (or step at true CIA cycles).
  Reassess before 2b; the plan's fix shape changes.

Success gate for 2a: a written verdict (which branch) + the best-φ fidelity table.

## Phase 2b — production resampler (shape depends on 2a verdict)

If 2a confirms φ alignment:
- Expose per-bucket period trajectory from the player: `tick()` returns, per voice,
  `subPeriods: { off: number; period: number }[]` (sample offset within the 1024
  bucket + period) alongside the existing latched fields. Golden path unchanged
  (golden reads `period`/`acc` only).
- `SunTronicNativeRender.renderInto`: replace the single `vInc[v]` per step with a
  sub-bucket schedule — recompute `vInc[v]` when `pos` crosses each `off`
  (φ_v-shifted). Revert the `stepVblank` single-clock experiment back to `tick()`
  on the 1024 grid (keep `stepVblank` only if 2a shows it helps; otherwise remove).
- Keep the same change in the sampled-voice `vInc` path (harmless; validated under
  Gate-D later).

## Phase 2c — derive φ_v from the score

φ_v is currently only known empirically (gliders 355, ballblaser 881). Find the
init-cycle state that produces it (candidates: initial tempo counters, first
GETNEXTNOTE offset, DMA-on delay). If not derivable, fall back to a one-time
auto-calibration: at load, correlate the first ~2 s against a cheap self-consistent
reference, or store φ_v per song. Auto-calibration is a stopgap — flag it as such.

## Phase 3 — re-measure + lock

- Run `probe-corpus-fidelity.ts` full corpus. Target: synth-voice minFid ≥ 0.90 on
  the majority; ballblaser (hardest) ≥ 0.90.
- Set the flip threshold from the measured distribution; the default is ALREADY
  flipped to 'native' (useSettingsStore v8) — this locks it with evidence.

## Regression (fails-on-revert, test:ci)

- A per-voice fidelity assertion on ballblaser + analgestic2 (v0/v3 ≥ threshold at
  maxLag 640) driven from the offline renderer, wired into the suntronic test glob.
  Reverting the sub-bucket resampler drops it below threshold → fail.
- Do NOT regress the byte-exact golden timelines (gliders 0/316, ballblaser 1/316).

## Explicitly out of scope (separate gates)

- Sampled-voice (type-B) content fidelity (analgestic2 v2) — Gate-D whole-song lock.
- Dead-voice cases (analgestic2 v1 near-silent) — triage separately.
- The 1/632 double-position timeline residual (0/0 gate) — orthogonal, deferred.

## Automated verification

- `TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-resampler-phase.ts` (2a verdict)
- `npx vitest run src/engine/suntronic/` (golden timelines stay byte-exact)
- `TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-corpus-fidelity.ts` (Phase 3)
- `npm run type-check`

## Manual verification

- Load ballblaser.src + analgestic2.src in real Chrome via MCP; confirm audible,
  no pitch wobble/drift vs UADE by ear over a full loop.
