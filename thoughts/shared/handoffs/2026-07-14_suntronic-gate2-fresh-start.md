---
date: 2026-07-14
topic: suntronic-gate2-fresh-start
tags: [suntronic, gate2, native-port, uade, two-clock, fresh-start]
status: final
---

# SunTronic V1.3 Gate-2 — fresh-start handoff (two-clock native fix)

Pick-up point for a NEW session. Everything below is on `origin/main` as of commit
`3bf52fad2` (pushed 2026-07-14, CI deploy triggered). Nothing is left uncommitted.

## Task

Make the compiled-68k **SunTronic V1.3** player natively editable (the `/loop`
pilot format — prove ONE format byte-exact vs the UADE oracle before ~20 others).
Phase gating: **Gate 1** (timbre generator) = CLOSED; **Gate 2** (note-row timing /
period pipeline) = OPEN, blocked on a two-clock bug; **Phase 4** (native song
playback) = gated until Gate 2 closes.

## Current state (one line)

Native `SunTronicPlayer` exists and is close, but is **NOT byte-exact** — it
conflates SunTronic's two independent interrupt clocks into one `tick()`, so the
vibrato phase drifts (gliders 12/316, ballblaser 18/316 samples). The golden test
is a `describe.skip` scaffold, deliberately NOT in `test:ci`.

## THE bug (root cause, already proven — do not re-litigate)

SunTronic runs **two independent interrupt clocks**:
- **EFFECTS / vibrato / period recompute → 50 Hz vblank (~882 samples/fire)** —
  Paula's `$20` period word is written here.
- **Note / sequence fetch (handler PC 0x2660e for gliders) → module-tempo CIA-B
  timer (~1026 samples, ≈43 Hz for gliders)** — async, NOT an integer division of
  50 Hz.

Proof (reproducible): `tools/suntronic-re/probe-firecount.ts` (note handler fires
every ~1026 samp, gaps 1008/1029) + `probe-vibcompare.ts` (UADE `$24` vibrato
advances +8000 mostly / +16000 sometimes ≈ 1.16 = 50/43). Native advances vibrato
once per note-tick where UADE advances it ~1.16× as often → phase drift, `acc`
byte-identical (pure phase drift, not a whole-tick offset).

The OLD "byte-exact" claim rested on a **flawed 882-per-tick oracle** that aliased
the real cadence (0-fire windows duplicate a tick, 2-fire windows skip one) →
~4% corrupt gliders, ~50% ballblaser. Discard any 882-based conclusion.

## Critical references

- `src/engine/suntronic/SunTronicPlayer.ts` — native player. Header carries the
  "KNOWN GAP: TWO-CLOCK ARCHITECTURE" block + fix plan. EFFECTS/vibrato at ~256-313
  (`stepEffects` computes period from current `vibPhase`, then advances vibPhase at
  ~310). `tick()` currently == one note-fetch — THIS is what must split.
- `src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.test.ts` — `describe.skip`
  scaffold. Alignment note: emitter samples one row per NOTE-handler fire; UADE runs
  one priming note tick at load, so currently `golden[i+1]` ↔ native tick `i`. After
  the fix (per-vblank sampling) switch to `golden[i] == native i`.
- `src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json` — fire-based
  (note-clock) golden; NOT yet a valid byte-exact gate.
- `tools/suntronic-re/emit-note-timeline-golden.ts` — the emitter. pass0 histograms
  the voice-write PC (relocates per module), pass1 finds base0 = min A0, pass2
  fire-based capture. MODULES=['gliders.src','ballblaser.src'], TICKS=80, STRIDE=0x1ba,
  SCAN 0x20000..0x40000. Voice offsets: `$08` acc(u16), `$0c` vol, `$14` flags,
  `$20` period(word), `$24` vibPhase(s16), `$26` vibIndex.
- `thoughts/shared/handoffs/2026-07-14_suntronic-two-clock-discovery.md` — the full
  finding writeup with the ordered fix steps + guardrails.
- `research/2026-07-14_suntronic-gate2-note-timing.md` — full live tick-handler
  disasm decode (handler @0x2660e, EFFECTS @0x267f6 period formula, tempo counters,
  seq/synth-type dispatch).
- Memory: `project_suntronic_gate2_two_clock.md`, `project_suntronic_gate1_calc14.md`.

## Recent changes (this session)

- Rewrote the emitter from 882-per-tick to **fire-based** — this is what exposed
  the two-clock bug (the 882 method was aliasing).
- Documented the two-clock gap in `SunTronicPlayer.ts` header; made the golden test
  a documented `describe.skip` scaffold (NOT in test:ci).
- Removed 4 dead-end probes (cia/clocks/p20clock/nativecheck); kept probe-firecount
  + probe-vibcompare (referenced by headers).
- Committed the RE probe suite (`tools/suntronic-re/`) + deliverables and **pushed**
  (commit `3bf52fad2`). Type-check + test:ci + test:compliance all pass.

## Next steps (ordered) — the real Gate-2 fix

1. **Detect the 50 Hz vblank/EFFECTS fire in UADE** (PC-based; the capture-ABI
   memory-watch `arm_capture(addr,size)` on the `$20` write returned 0 hits — unreliable,
   don't rely on it). Histogram-locate the EFFECTS PC the same way the emitter locates
   the note-write PC. NOTE: 0x2660e/0x267f6 are gliders-specific RAM addrs (ballblaser
   relocates: note handler 0x2560a, base0 0x25f6a). Confirm its period ≈882, integer-
   independent of the note rate.
2. **Split the native loop into two clocks.** Step `stepEffects` (vibrato/period/vol)
   on the 50 Hz vblank grid; decrement the 3-level tempo counter ($2c/$2d/$2e) + run
   GETNEXTNOTE on the CIA (module-tempo) grid; interleave by sample position. `tick()`
   should expose the vblank grid (that's when `$20` updates).
3. **Re-point the emitter to per-vblank sampling**, regenerate the golden, switch the
   test alignment to `golden[i] == native i`, assert byte-exact, **un-skip**, and add
   it to the `test:ci` glob (`package.json` line 30) as a fails-on-revert gate.
4. Only then: arp/vibrato modules (nonzero drin) — the drin note-transpose table is
   runtime BSS filled at eagleplayer init (row 0 all zeros; currently zero-filled in
   the native player). Generating nonzero drin is a separate, later port step.
5. Then Phase 4 (native song playback), gated until Gate 2 closes.

## Guardrails (unchanged)

- Do NOT wire a non-byte-exact golden into `test:ci`. It stays `describe.skip` until
  the two-clock fix + per-vblank emitter land together.
- Wasm-free committed goldens only (CI has no UADE-WASM). Emitter needs UADE-WASM to
  regenerate.
- Every fix ships a fails-on-revert regression in `test:ci`.
- Probes/tsx scripts live under `tools/suntronic-re/` (path-alias `@/` breaks in /tmp;
  use `process.cwd()` + relative `../../src/...` imports).
- Do NOT push without explicit user auth. (This session's push WAS authorized.)
