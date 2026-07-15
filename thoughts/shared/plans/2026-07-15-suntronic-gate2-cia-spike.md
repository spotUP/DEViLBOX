---
date: 2026-07-15
topic: suntronic-gate2-cia-spike
tags: [suntronic, gate2, uade, cia, native-player, byte-exact]
status: draft
---

# SunTronic Gate-2 — CIA/vblank fire-offset spike to close the last 1/632

## Problem (domain terms)
Native `SunTronicPlayer` is gliders 0/316 byte-exact, ballblaser 1/316. The single
residual (t12 v0) is a sub-bucket clock-phase error: the double-position heuristic
`round(k*6.25)` places the k=2 EFFECTS/vibrato fire in bucket 13; the oracle has it in
bucket 12. The heuristic `ciaTick=882.759` is a FITTED constant, not the physical PAL
vblank period (SOUNDTICKS/50/… = 882.0 samples). A fitted single-clock constant cannot
match both songs because the real fire schedule is UADE's cycle-accurate float
accumulator, not a constant period. The fix must live at the CLOCK level: reproduce
UADE's real per-fire sample boundaries with a deterministic accumulator — NOT a baked
per-song table (forbidden = hardcoding the oracle).

## What the two research passes established
- **Player fire = interrupt.** The eagleplayer runs GETNEXTNOTE+EFFECTS from a CPU
  interrupt. CIA-A Timer A overflow hook already exists: `uade_wasm_on_cia_a_tick()`
  (entry.c:618, called cia.c:155). vblank/vsync via `CIA_vsync_handler` (custom.c:1321).
- **Sample clock is cycle-accurate float.** audio.c:594 `sample_evtime_interval =
  SOUNDTICKS/rate` (3546895/44100 = 80.42755 cyc/sample); update_audio (audio.c:637-700)
  fires samples on a floating `next_sample_evtime` accumulator with round-to-nearest
  (lines 656-661) → deterministic but non-uniform sample spacing. This jitter is exactly
  what the constant 882.759 cannot reproduce.
- **Capture ABI** is PC/memory-write triggered (arm_capture/get_capture, entry.c:1227+);
  NO per-fire sample-offset observation today. `g_uade_tick_count` counts CIA-A ticks but
  carries no sample offset.
- Player already supports an injected `subtickSchedule` (SunTronicPlayer.tick():472) —
  a per-bucket step-count array — usable to VALIDATE a candidate schedule before
  deriving the closed-form accumulator.

## Phase A — Measure (C-spike, scratch build, non-destructive)
Add a temporary instrumentation hook (guarded, clearly marked) that records the
cumulative rendered-sample offset at each player fire, tagged by source:
1. A global `g_uade_sample_count` incremented once per emitted stereo sample (in the
   render drain in entry.c, or the sample handler). This is the same sample clock the
   golden buckets by (1024).
2. In `uade_wasm_on_cia_a_tick()` AND a new vsync hook, push `{source, g_uade_sample_count}`
   into a ring; export `uade_wasm_get_fire_log(out,max)`.
3. Also expose the CIA-A Timer A latch the module programmed (`ciaala`/`ciaata`, cia.h)
   and vblank_hz — so the physical periods are READ, not guessed.

**Build to scratch:** `OUT_DIR=<scratchpad>/uade-spike ./uade-wasm/build.sh`. Do NOT
overwrite the (already-dirty) committed `public/uade/UADE.{js,wasm}`.

**Probe** `tools/suntronic-re/probe-fire-offsets.ts`: load gliders.src + ballblaser.src
against the scratch WASM, render the first ~16k samples, dump both fire-offset sequences
(CIA-A and vsync) + the module's CIA-A latch.

## Phase B — Analyze (decisive)
1. Bucket each fire sequence by floor(offset/1024). The sequence whose per-bucket fire
   count reproduces the golden's vibrato-phase transitions IS the EFFECTS clock.
2. Inject that per-bucket fire count as `subtickSchedule` → confirm gliders 0/316 AND
   ballblaser 0/316. If yes, the measured fire schedule is ground truth.
3. Extract the physical period + phase from the measured offsets. Confirm a single
   deterministic float accumulator (mirroring audio.c's `next_sample_evtime` math, or a
   `cycles→sample` map from SOUNDTICKS/vblank_hz + the read CIA-A latch) reproduces the
   measured buckets for BOTH songs with NO per-song constants beyond what is read from
   the module. This is the make-or-break: closed-form accumulator, not a table.

## Phase C — Implement (JS-only ship)
1. Replace `round(doubleK*di)` in `SunTronicPlayer.tick()` with the derived accumulator.
   Keep the `subtickSchedule` path for tests.
2. Revert the temporary C instrumentation; the shipped diff is JS only. No WASM commit.
3. Regenerate the golden if the fix changes bucket alignment (re-run
   emit-note-timeline-golden against the CLEAN committed WASM, not the spike build).
4. gliders 0/316 AND ballblaser 0/316 → un-skip `sunTronicNoteTimeline.golden.test.ts`,
   wire into test:ci, verify fails-on-revert. Update the two existing timeline tests if
   their exact-residual assertions change (ballblaser `{t12 v0}` → empty).

## Guardrails
- Hardcoding the oracle schedule FORBIDDEN — Phase C ships a closed-form accumulator.
- Never touch the dirty `public/uade/UADE.{js,wasm}` or commit the submodule
  instrumentation. Spike build goes to scratch; instrumentation reverted before ship.
- Every shipped change keeps a WASM-free, fails-on-revert test:ci regression.

## Fallback
If Phase B shows NO closed-form accumulator fits both songs (the fire schedule genuinely
depends on unread module state), STOP and report — do not bake a table. That outcome
means 0/0 needs a deeper model (full CIA-A latch + vblank interleave simulation), a
separate decision.
