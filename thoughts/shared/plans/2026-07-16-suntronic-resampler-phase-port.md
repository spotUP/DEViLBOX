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

## Phase 2a VERDICT (2026-07-16) — φ-alignment REJECTED. Do NOT build 2b as written.

`probe-resampler-phase.ts` ran the decisive experiment: drive the player on the
raw 882.759 vblank grid (`stepVblankOnce`), re-synthesize each voice applying the
true per-vblank period from its true sub-bucket offset, sweep φ_v ∈ {0…992 step 32},
`voiceFidelity(maxLag 640)` vs UADE oracle. Result:

```
ballblaser  SHIPPED v0=0.50 v3=0.44 | best-φ v0=0.52(φ448) v3=0.46(φ352)  → FAIL
analgestic2 SHIPPED v0=0.62 v1=0.20 v3=0.60 | best-φ v0=0.65 v1=0.22 v3=0.67 → FAIL
```

- The whole φ sweep moves fidelity by only ±0.05; the vblank-grid render ≈ the
  shipped flat-per-bucket render. **No φ reaches 0.90.** The residual drift is NOT
  a vblank sub-phase (φ_v) offset applied to the true per-vblank period.
- Cross-referenced with the known `maxLag 640→6000` monotonic lift (ballblaser
  0.50→0.70): the residual IS phase, but an **accumulating rate drift**, not a
  fixed sub-bucket offset. A fixed φ can't collapse a chirp — hence the flat sweep.
- Therefore the "expose per-bucket subPeriods + φ_v-shift the resampler" fix
  (old 2b/2c) is INERT and must NOT be built. Removed from scope.

### Reassessed mechanism (the real remaining gap)

Period is byte-exact vs golden and `inc = PAULA_CLOCK_PAL/period/44100` is the exact
Paula rate, so a per-buffer rate error can only come from the **buffer wrap / DMA
re-point** model: native keeps `r.phase` continuous (mod bufLen) across a vblank
regen, but real Paula finishes the current DMA buffer and latches the new LC/LEN
only at the next loop boundary (the "Paula DMA wrap-latch"). That per-loop latch
delay accumulates the sub-sample phase the metric sees as slow drift. Closing it =
the deferred **cycle-accurate Paula-DMA scheduler** (Gate-2 0/0 port) — the largest
remaining SunTronic effort, and orthogonal to playback/editability (songs already
play audibly + edit). NOT started without an explicit go-ahead on that cost.

Two more cheap hypotheses tested + rejected the same day (probe-resampler-phase.ts
`wrapLatch`, probe-metric-dc.ts):

- **Paula DMA wrap-latch** (finish current buffer, swap regen at loop boundary):
  INERT — ballblaser/analgestic2 fidelity identical to immediate swap (±0.01).
- **DC / metric artifact** (windowBestLag doesn't subtract the mean; native synth
  buffers carry DC): REJECTED — a mean-subtracted (Pearson) best-lag scores the
  SAME or slightly lower, so DC is not what caps correlation.

**Localization (the useful positive result).** probe-metric-dc DC column:

```
gliders   v1/v2/v3 type2 STATIC arp=[0]   : raw 0.81-0.85  DC nat≈0.00 ora≈0.00  GOOD
ballblaser v0/v3   type2 SWEPT arp=[32,33…]: raw 0.50/0.44  DC nat 0.42 ora 0.14  BAD
analgestic2 v0/v3  type6 resonator         : raw 0.62/0.60  DC nat 0.32 ora 0.45  BAD
```

Where the arp is STATIC and native DC == oracle DC (≈0), fidelity is already ~0.85.
The deficit is entirely on SWEPT-arp type-2 (splice) and type-6 (resonator) voices,
which also carry a native/oracle DC mismatch. The per-buffer CALCn kernel is
byte-exact (sunTronicSynthVoice.test.ts + earlier verify-t2/t6 16/16), so the gap is
NOT the timbre math — it is **which swept buffer is playing at which sample** (the
MEGAEFFECTS regen cadence + Paula-DMA buffer-swap timing under a per-frame-sweeping
arp). That is the deferred cycle-accurate Paula-DMA/MEGAEFFECTS scheduler (Gate-2
0/0), the largest remaining SunTronic effort, orthogonal to playback+editability.

Net: three of the four plausible cheap fixes (φ-align, wrap-latch, DC/metric) are
measured-dead; the survivor is the big scheduler port. NOT started without an
explicit cost go-ahead — songs already play audibly and edit; this only lifts the
oracle-fidelity metric on swept-timbre voices.

`stepVblankOnce()` on the player is kept as the documented raw-vblank audio-clock
entry (probe-only today); it is the hook a future DMA-accurate resampler would use.
Evidence probes: `tools/suntronic-re/probe-resampler-phase.ts`, `probe-metric-dc.ts`.

## Phase 2b — production resampler (shape depends on 2a verdict) — SUPERSEDED, see verdict above

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
