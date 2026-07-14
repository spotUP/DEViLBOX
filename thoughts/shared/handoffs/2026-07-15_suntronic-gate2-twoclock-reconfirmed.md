---
date: 2026-07-15
topic: suntronic-gate2-two-clock-reconfirmed-ceiling-12
tags: [suntronic, gate2, native-port, uade, vibrato, two-clock, regression]
status: final
---

# SunTronic Gate-2 — two-clock model RECONFIRMED; constant-rate ceiling = 12/632

## The hard truth (reverses the 2026-07-15 "premise falsified" handoff)

`2026-07-15_suntronic-gate2-premise-falsified.md` is **WRONG** and is hereby
SUPERSEDED. Its "one clock, constant 1024, no second clock" conclusion came from
measuring `$24` only at fire boundaries — it could not see the twice-per-bucket
advances. Decisive refutation this session:

- **`probe-pc-control.ts`: `$24` total advance = 232000 over 26 fires = 29
  advances = 26 + 3 doubles.** 29 ≠ 26 → the player-step runs FASTER than the
  1024-sample golden-sampling clock. Doubles are REAL. Two-clock confirmed.
- The golden IS sampled uniformly every 1024 samples (that part of the falsified
  handoff was right) — but that is the SAMPLING clock, not the player-step clock.

So there genuinely are two clocks:
- **Sampling / golden latch**: uniform 1024 samples (`audioTick`).
- **Player-step (GETNEXTNOTE + EFFECTS + `$24` vibrato)**: the emulated PAL
  vblank, ~49.92 Hz → 44100/49.92 ≈ **883.73 samples/frame** (`ciaTick`). 1024/883.73
  ≈ 1.16 steps per fire → the 5-mostly-6 fires/row cadence AND the 7,6,6,6 vib
  doubles both fall out of the single 29/25 ratio.

## What shipped this session (uncommitted → commit checkpoint)

`SunTronicPlayer.ts`:
- Two-clock `tick()` = `stepAll()` (one player-step) driven by a `clockAcc`
  accumulator: `clockAcc += audioTick; while (clockAcc >= ciaTick) { clockAcc -=
  ciaTick; stepAll() }`. NO hardcoded schedule — pure accumulator.
- **Default `ciaTick` 881.5 → 883.73** (joint golden optimum over BOTH songs,
  `probe-ratio-fine` full grid). Reduces residual 14 → 12.
- Header comment corrected (881.5→883.73, 14→12, 97.8→98.1%, PAL-vblank origin,
  and an explicit note that the "premise falsified" handoff was wrong).

`sunTronicVibratoContinuation.test.ts` (in test:ci, fails-on-revert):
- Snapshot tick 6 updated 254 → **252** (now oracle-exact at 883.73). Single-clock
  revert (one step/fire, `ciaTick=1024`) emits 254 at tick 6 → test still fails on
  revert. Narrative corrected. Both assertions pass.

## The residual: 12/632 is the constant-rate ceiling (PROVEN)

`probe-native-vs-golden.ts` at default 883.73: **gliders 3, ballblaser 9 = 12.**
`probe-ratio-fine.ts` swept P∈[880,887] × every phase → joint best 12 at P=883.730
phase 0. A single constant rate CANNOT reach 0.

Why acc can't catch it: gliders v0 is a held note, pitch constant → `acc`($08) is
0x1700 regardless of a one-step vib misplacement. The 3 gliders residuals are
invisible-in-acc vib-phase placement errors at double boundaries (t12v0, t18v2,
t37v0). ballblaser adds note-change misplacements (t78/t79 v0/v3).

## NEXT — the only path to 0 (GATED, needs user auth + its own plan phase)

The last 12 are UADE's exact per-frame integer-sample jitter: each vblank/CIA fire
lands at an integer sample boundary with rounding that a single constant float P
cannot reproduce. To close them, read the REAL schedule from `third-party/uade-3.05`:
the vblank/E-clock timing (system clock 3546895 Hz PAL → frame cycles → samples at
44100 with UADE's integer accumulation). Feed those exact per-fire sample counts
into the SAME `clockAcc` machine (replace the constant `ciaTick` with the derived
per-fire boundaries). **Hardcoding the oracle greedy schedule is FORBIDDEN** — the
schedule must be DERIVED from UADE's timing constants, not fitted to the golden.

This is the "C-level uade-3.05 CIA/vblank scheduler spike" — user-authorized
separately, its own research+plan phase. Loop paused here awaiting that go-ahead.

## Guardrails (unchanged)

- Golden test stays `describe.skip` until gliders+ballblaser both hit 0. Not in test:ci.
- WASM-free committed goldens only. Every fix ships a fails-on-revert test:ci regression.
- Probes under `tools/suntronic-re/` (relative `../../src/…` imports; `@/` breaks under tsx).
- Do NOT guess constants — read from disasm/artifact. No hardcoded oracle schedule.
- Push only on explicit user auth (this checkpoint is local).

## Artifacts

- `probe-ratio-fine.ts` (joint sweep → 12 floor), `probe-pc-control.ts` (29/26 proof),
  `probe-native-vs-golden.ts`, `probe-align-sweep.ts` under `tools/suntronic-re/`.
- Superseded: `2026-07-15_suntronic-gate2-premise-falsified.md` (marked at top).
