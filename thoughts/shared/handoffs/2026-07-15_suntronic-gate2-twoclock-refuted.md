---
date: 2026-07-15
topic: suntronic-gate2-twoclock-refuted
tags: [suntronic, gate2, uade, reverse-engineering, decisive-experiment]
status: final
---

# SunTronic Gate-2 — two-clock scheduler-port hypothesis REFUTED by decisive experiment

## Task

Execute the decisive experiment authorized in
`2026-07-15_suntronic-gate2-scheduler-port-authorized.md`: measure the UADE
interrupt sources and test whether SunTronic's note timeline is driven by TWO
independent clocks (row/tempo on a clean 1024-sample bucket clock; EFFECTS/
vibrato on the PAL vblank ~880.58). If the two-clock model reaches byte-exact
(0/0) on BOTH gliders.src + ballblaser.src, port it as the shipped player.
Otherwise fall back to the shipped 1/632 double-position clock.

## Result — REFUTED

The two-clock model is **decisively worse**, not better:

| model | gliders | ballblaser |
|-------|---------|-----------|
| shipped double-position (single 882.759 fire clock) | **0/316** | 5/316 (memory: 1/316 with wrap fix) |
| two-clock (tempo 1/bucket + EFFECTS E_i vblanks/bucket) | **602/1264** | 613/1264 |

E_i = number of PAL-vblank fires (fire-log src=1) binned into each 1024-bucket.
Sum(E_i) = 366 over 316 buckets — **identical** to the shipped model's total
stepAll count (1/bucket + ~50 doubles). Same total advance, but the
vblank-in-bucket binning puts the vibrato "double" in the wrong bucket: doubles
land at bucket 2,8,14,20,… (where 2 vblanks fell) whereas the byte-exact shipped
clock doubles at round(k*6.25) = 6,13,19,25,…. The ~4-6 bucket offset is the
φ_v phase interacting with the compute-then-advance ordering and the
bucket-END latch — separating the clocks discards exactly the phase information
the single-clock double-position model encodes correctly.

## Measurements (kept, in scratchpad fire dumps)

Both songs, 1-sample-resolution render, instrumented fire-log build:

- **Row boundaries** ($2d row counter) land on an exact 1024 grid: gaps
  5120/6144 = speed×1024 (speed 5/6), IDENTICAL sequence on both songs in the
  measured window. This is what seeded the (wrong) "clean 1024 tempo clock"
  half of the two-clock hypothesis.
- **vblank** (src=1): P_v ≈ 880.58 (gaps alternate 880/881), φ_v = 355 gliders /
  881 ballblaser. E_i distribution 74×1 + 14×2 per 88 buckets.
- **CIA-A** timer fires = 0 (confirms note clock is NOT CIA-A driven).
- The audio-DMA hypothesis (note interval == playing-sample DMA length) also did
  not hold — earlier CIA-spike work (memory `project_suntronic_gate2_two_clock`)
  already showed genuine two independent clocks with non-integer ratio and
  per-song relative phase set by UNREAD eagleplayer init state.

## Follow-up (2026-07-16): strict per-1024-bucket oracle + residuals are ARITHMETIC

After refuting the two-clock model, tested the shipped double-position clock
against a STRICTER oracle than the committed golden. The committed
`sunTronicNoteTimeline.golden.json` is per-NOTE-FIRE (80 entries, sampled at the
tick-handler PC, warmup 1). Built a per-1024-BUCKET oracle instead (316 entries,
voice $20/$08/$14 latched every 1024 samples) — the resolution the golden claims.

**Correct alignment for the per-bucket oracle is warmup 0** (native bucket i ↔
golden bucket i, no offset; warmup 1 is only right for the coarse note-fire
golden and gives 459/624 there). At warmup 0 the shipped default clock is:

- gliders: **1/1264** — residual t231 v2 (period 253 vs native 252, self-corrects t232)
- ballblaser: **1/1264** — residual t12 v0 (period 719 vs native 714, self-corrects t13)

So at bucket resolution the shipped clock is essentially byte-exact (2 fields
wrong out of 2528). Both residuals are **single-bucket period-only glitches at a
note-onset** (acc + flags match; period off by 1 / 5 for exactly one bucket).

**These residuals are SCHEDULE-INVARIANT — proven, not asserted.** Swept:
- double-position phase φ_b ∈ [-0.9, 0.9] (round(k·di + φ_b)) → best still 1 each
- full fire-time grid: P ∈ [881.5, 883.5] step 0.1 × φ_s ∈ [0, 1024) step 8,
  fires at φ_s + j·P, subtick = fires-per-bucket → best still 1 each (same cells)

No period/phase/placement of the single clock eliminates them. They live in the
EFFECTS vibrato arithmetic (0x267f6) at the first tick after a note onset, where
UADE advances $24 one step differently than the native compute-then-advance. The
`extraVib` continuation-row path documented in stepEffects is NEVER exercised by
the shipped clock (stepAll always passes `false`); tested passing
`extraVib = runGNN && !didReset` → gliders 505/1264, ballblaser 362/1264, far
WORSE, so blanket continuation-extraVib is NOT the rule. The exact condition needs
the disassembled EFFECTS note-onset ordering, not a guess.

## Conclusion / decision

- **Keep the shipped single-fire double-position clock** (SunTronicPlayer.tick,
  ciaTick 882.759, extra step at round(k*6.25)). gliders 0/316 byte-exact.
- ballblaser's residual is at **note-CHANGE events** (t11/t12/t78/t79 v0+v3):
  the two-clock run shows the SAME early note-change (acc jumps 2900→3000 while
  golden holds the old note) — proving the residual is **GNN / tie / tempo-opcode
  arithmetic**, NOT a clock-separation problem. Prime suspect remains the ignored
  tempo opcodes 0x8e (CIA tempo word) / 0x8d (tempo slide) in controlOpcode(),
  which would shift ballblaser's row length near t78. That is the only remaining
  path to 0/0 and is INDEPENDENT of the (now-refuted) scheduler port.
- The full UADE cycle-accurate scheduler port is **not warranted**: the single
  emulated fire clock already reproduces the schedule byte-exact; the port would
  reproduce the same 366 advances the double-position clock already produces.

## Changes / cleanup this session

- **No shipped code changed.** Added then removed a diagnostic `bucketSchedule`
  path (+ stepTempoOnly/stepEffectsAll) in SunTronicPlayer.ts to run the
  experiment — REMOVED after the negative result (unlike `subtickSchedule`,
  which proved the arithmetic correct given the schedule and is retained, this
  proved a model WRONG and has no ongoing diagnostic value). SunTronicPlayer.ts
  is byte-identical to HEAD.
- Instrumented fire-log spike fully reverted: entry.c, build.sh, cia.c, audio.c
  restored from backup; public/uade restored to checksums
  UADE.js cc3a153a7a60c0ca075a981c72dff3b1ab7763c8,
  UADE.wasm 520744b431d57c6e8eaf9afe71ee61f52539d4cc.
- Regression tests green: sunTronicGlidersTimeline (0/316),
  sunTronicBallblaserTimeline. `npm run type-check` clean.
- Fire-log dumps retained for reference:
  `scratchpad/fire-gliders.src.json`, `scratchpad/fire-ballblaser.src.json`.

## DECISIVE TRACE (2026-07-16) — the "$24 ordering" next-step was WRONG; residuals are double sub-phase

Ran the targeted clean-build memory-read probe the prior next-step called for:
per-1024-bucket snapshot of voice `$20`/`$08`/`$24` from UADE vs native
`debugVoice`, around both residual buckets (warmup 0). Result **overturns** the
EFFECTS-ordering hypothesis:

| bucket | UADE | native | reading |
|--------|------|--------|---------|
| ballblaser b12 v0 | p719, **$24=16000** | p714, **$24=16000** | `$24` IDENTICAL — no vib-advance bug. period-ramp lags → native's double-step lands one bucket **LATE** (both reconverge p724 at b13) |
| gliders b231 v2 | p253, $24=−3072 | p252, **$24=4928** | native `$24` is exactly **one step ahead** (Δ=8000=one vib advance) → native's double lands one bucket **EARLY** (reconverges b232) |

So there is **no EFFECTS `$24`-advance ordering bug**: ballblaser's `$24` matches
UADE bit-for-bit at the failing bucket. Both residuals are purely the
**double-position sub-bucket phase** — `round(k·6.25)` misplaces exactly one
double per song by ±1, and **in OPPOSITE directions** (ballblaser double one
bucket late, gliders double one bucket early) on the SAME 882.759 fire clock.
This is the direct confirmation of the mutual-exclusivity the invariance sweep
bounded: no phase/period/carrier of a single deterministic clock fixes one
without breaking the other. The ±1 jitter is the per-song vblank/init phase
(φ_v), recoverable ONLY from true cycle-accurate fire times — deriving
double-placement from φ_v IS baking the schedule (forbidden), and a plain φ_v
scalar carrier can't encode opposite-direction per-k jitter anyway.

## Conclusion — CLOSED at fallback

0/0 is **not reachable** by any single-clock model (closed form or legit
carrier). Confirmed three independent ways: schedule-invariance sweep,
two-clock refutation (602/1264), and now the per-bucket `$24` trace showing
opposite-direction double misplacement. The only remaining path is a full
cycle-accurate CIA+Paula+vblank event-interleave port — explicitly out of scope
and lower value than Phase 4.

**DECISION: accept 2/2528 (bucket oracle) / 1/632 (shipped note-fire golden).
Move SunTronic to Phase 4.** Golden two-song test stays `describe.skip`.
No shipped code changed this session; player byte-identical to HEAD; public/uade
at sha1 cc3a153…/520744b… (verified); both regression tests green.

## Reproduction note

All probes this session were scratch (uncommitted, removed). To reproduce the
strict per-bucket oracle: adapt `emit-note-timeline-golden.ts`'s base0-location
(write-PC histogram at SCAN_LO/HI, voice stride 0x1ba) but render in 1024-sample
buckets and snap $20/$08/$14 per bucket; compare native `renderTimeline()` at
warmup 0. Requires the clean shipped UADE build (stock read_memory/arm_capture —
no fire-log).
