---
date: 2026-07-14
topic: suntronic-gate2-two-clock-discovery
tags: [suntronic, gate2, native-port, uade, vibrato, oracle-harness]
status: final
---

# SunTronic Gate 2 — harness hardening EXPOSED a two-clock architecture bug

## TL;DR

Hardening the note-timeline oracle harness proved the native `SunTronicPlayer` is
**not** byte-exact against a correct UADE oracle, and the prior "gliders/ballblaser
byte-exact" claim rested on a **flawed 882-sample oracle**. Root cause: SunTronic
runs **two independent interrupt clocks**; the native player collapses them into one
`tick()`, so the vibrato phase drifts. Fixing it is a real Gate-2 native-port change,
deferred to the next session. Nothing wrong was wired into CI.

## The decisive measurements (all reproducible, tools/suntronic-re/)

1. `probe-firecount.ts` — the note handler (PC 0x2660e for gliders) fires every
   **~1026 samples** (gaps 1008/1029), i.e. ~43 Hz, NOT 50 Hz / 882. Rendering a
   fixed 882-sample "tick" therefore aliases: ~11 of 80 windows contain **0** fires
   → the golden **duplicates** the previous tick (the vibrato "stutter"), others
   contain 2 → skip. This corrupted ~4% (gliders) to ~50% (ballblaser) of the old
   882-golden's samples. That is why the old golden looked byte-exact-ish for
   gliders and garbage for ballblaser.

2. `probe-vibcompare.ts` (fire-based) — sampling UADE `$24` vibrato phase once per
   note-fire shows it advances **+8000 mostly, +16000 occasionally** (fires 5,12,18).
   Over the span: ~22 EFFECTS advances per ~19 note-fires ≈ **1.16 = 50/43**.

Conclusion — two clocks:
   * **EFFECTS / vibrato / period recompute → 50 Hz vblank** (~882 samples/fire).
     Paula's `$20` period is written here.
   * **Note / sequence fetch (0x2660e) → module-tempo CIA-B timer** (~1026 samples,
     43 Hz for gliders — NOT an integer division of 50 Hz → genuinely async).

The native player advances the vibrato accumulator (`inst.freqEnvSpeed`) once per
`tick()`, where `tick()` == one note-fetch, so it under-advances vibrato by ~1.16×
vs UADE. Diff vs the (still note-clock) oracle: gliders 12/316, ballblaser 18/316,
**all at vibrato/slide extremes, acc byte-identical** → pure phase drift, not a
whole-tick offset.

## What changed this session (all LOCAL, UNTRACKED unless noted)

- `tools/suntronic-re/emit-note-timeline-golden.ts` — rewritten from the aliased
  882-per-tick method to **fire-based** (fine 128-sample chunks, one golden row per
  note-handler fire, tempo-independent). Better, but still the WRONG clock for a
  byte-exact golden (samples note-clock, needs vblank-clock). Header documents this.
- `src/engine/suntronic/SunTronicPlayer.ts` (untracked) — header now carries the
  **KNOWN GAP: two-clock architecture** block with the fix plan; corrected the stale
  `score.drinOff` comment (drin is runtime BSS, zero-filled — from the prior session).
- `src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.test.ts` (untracked) —
  rewritten as a `describe.skip` **scaffold** with correct note-clock alignment
  (`golden[i+1]` ↔ native tick `i`, UADE runs one priming note tick at load). NOT in
  the test:ci glob. Un-skip after the two-clock fix + per-vblank emitter.
- `src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json` (untracked) —
  regenerated with the fire-based emitter (note-clock; not yet a valid gate).
- `src/lib/import/formats/SunTronicV13.ts` (tracked, MODIFIED) — from the prior
  session: removed the bogus `drinOff`/`REF_DRIN_GAP` (drin is not file-resident).
  Type-check clean.
- Removed this session's dead-end probes (probe-cia/clocks/p20clock/nativecheck).
  Kept probe-firecount.ts + probe-vibcompare.ts (referenced by the code headers).

Type-check (`npm run type-check`, tsc -b --force): PASS. Golden test: 2 skipped, clean.

## Next steps (ordered) — the real Gate-2 fix

1. **Detect the vblank/EFFECTS clock in UADE.** 0x2660e/0x267f6 are gliders-specific
   RAM addresses (ballblaser relocates: note handler 0x2560a, base0 0x25f6a) — the
   emitter already locates the note-write PC dynamically by histogram; do the same for
   the EFFECTS/vblank fire. The capture-ABI **memory-watch** (`arm_capture(addr,size)`)
   returned 0 hits on the `$20` write in this session — investigate whether it watches
   reads only / needs a different access mode, or fall back to a PC-based EFFECTS
   detector. Confirm its period is ~882 (50 Hz), integer-independent of the note rate.
2. **Split the native loop into two clocks.** Step `stepEffects` (vibrato/period/vol)
   on the 50 Hz vblank grid; decrement the 3-level tempo counter + run GETNEXTNOTE on
   the CIA (module-tempo) grid; interleave by sample position. `tick()` should expose
   the vblank grid (that's when `$20` updates).
3. **Re-point the emitter to per-vblank sampling**, regenerate the golden, switch the
   test alignment to `golden[i] == native i`, assert byte-exact, **un-skip**, and add
   it to the test:ci glob (package.json line 30) as a fails-on-revert gate.
4. Only then reconsider arp/vibrato modules (darkness/energy, flag-03) — the drin
   runtime-BSS generation gap is a separate, later port step.

## Guardrails (unchanged)

Do NOT push without explicit user auth (all SunTronic work local/unpushed). Wasm-free
committed goldens only (CI has no UADE-WASM). Every fix ships a fails-on-revert test in
test:ci. Do not wire a non-byte-exact golden into CI.
