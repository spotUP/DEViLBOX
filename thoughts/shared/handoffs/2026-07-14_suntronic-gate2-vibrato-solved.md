---
date: 2026-07-14
topic: suntronic-gate2-vibrato-solved
tags: [suntronic, gate2, native-port, uade, vibrato, fractional-tempo]
status: final
---

# SunTronic V1.3 Gate-2 — vibrato-double SOLVED, fractional row-tempo isolated

Supersedes `2026-07-14_suntronic-gate2-fresh-start.md`. **The "two-clock" (50 Hz
vblank vs 43 Hz CIA) root cause in that handoff is DISPROVEN — discard it.**
All work this session is LOCAL / uncommitted (no push authorization given).

## What the old handoff got wrong

- **Single clock, not two.** `probe-clockcount.ts` (FINE=1, capture-latch misses
  nothing) shows EFFECTS/vibrato and note-fetch fire on ONE ~42 Hz / ~1024-sample
  CIA clock, uniformly. There is no 882-sample vblank clock. The old 882 oracle
  was aliased; the two-clock hypothesis is dead.

## Two real bugs, isolated with a miss-proof oracle

`tools/suntronic-re/probe-lockstep-poll.ts` renders UADE one sample at a time,
snapshots all 4 voices on every voice0 `$15` write (= one per tick), and dumps
`vibPhase`/`period` side-by-side with the native player (warmup=1 aligns
`golden[i] == native tick i+1`). Result for gliders: **t0-t10 byte-exact**, then
drift.

### Bug 1 — vibrato double-advance on continuation ticks — SOLVED

On a GNN tick that does NOT retrigger the instrument (an empty/legato
"continuation" note-row), UADE runs ONE EXTRA vibrato advance up front: the
period is computed from the once-advanced `$24`, and the normal trailing advance
leaves `$24` two steps on.

Numerically proven (`scratchpad/formula.ts`): gliders tick6, pre-value
`vibPhase=-17536`, `freqEnvSpeed=8000`, `vibDepth=[20,10]`, `freqEnvLen=1 loop=0`:
- compute at `-9536`, depth index 0 → **period 252** == UADE. (compute at final
  `-1536` → 250 ✗; at `-9536` idx 2 → 254 ✗.)
- then post-advance → `-1536`, matching the golden `$24`.

**Fix shipped in `SunTronicPlayer.ts` (LOCAL):**
- `getNextNote` now returns `boolean` (did a `noteOn` retrigger fire).
- new `advanceVib(v, inst)` helper (the `$24` += `freqEnvSpeed` + depth-index wrap).
- `stepEffects(v, extraVib=false)`: when `extraVib`, call `advanceVib` ONCE before
  the period compute; the normal post-advance always runs.
- `tick()`: `const cont = runGNN ? !this.getNextNote(v) && !!v.instr : false;`
  then `stepEffects(v, cont)`.

Do NOT use the two-advances-before-skip-post variant (mode C) — it computes the
period from the fully double-advanced phase (250, wrong) and mis-fires on the
initial trigger tick.

### Bug 2 — fractional row tempo (6.25 ticks/row) — OPEN, next task

`tools/suntronic-re/probe-double-positions.ts` lists the ticks where UADE's `$24`
delta is the double (+2×speed = a continuation note-row):
- gliders: `[5,12,18,24,30,37,43,49,55,62]`, gaps `[7,6,6,6,7,6,6,6,7]`.

The doubles ARE per-row, but **UADE row lengths are a fractional 7,6,6,6 pattern
(25 ticks / 4 rows = 6.25 ticks/row)**, not the flat `speed=6` the native player
uses. Native rows are uniform 6 (`scratchpad/rows.ts`: `tempoTick` wraps at 6,
cursor +1/row). They align at ticks 12/18/24/30 then diverge — UADE inserts one
extra tick every 4th row. THIS fractional CIA-tempo accumulator is the entire
remaining drift (gliders warmup=1 47/192 mismatches, almost all downstream of it;
ballblaser 75/192, messier because it has real retrigger rows).

## Next steps (ordered)

1. **Find the fractional-tempo constant in the disasm** — do NOT guess it. The
   tick-handler tempo counters are `$2c`/`$2d`/`$2e` (per-voice, stride 0x1ba);
   the 3-level counter logic is at ~0x2667a-0x266a2. Regenerate the disasm dump
   (`p8a-dump-calc3-bin.ts` — currently dumps 0x26c00; point it at 0x26606) and
   decode where a 6.25-ticks/row (or 16.16 fractional speed / CIA-derived) value
   enters. The 0x8e "CIA tempo word" + 0x8d "tempo slide" opcodes (currently
   ignored in `controlOpcode`) are the prime suspects.
2. Add the fractional accumulator to the native `tick()` row counter so rows run
   7,6,6,6. Re-run `probe-double-positions.ts` → native doubles must match UADE
   tick-for-tick; then `probe-lockstep-poll.ts` gliders → 0 mismatches on v0.
3. Separate: **voice-activation bug** — native has v2/v3 `flags=0xff` (inactive)
   where UADE has `0x01` active (gliders poll: t5 v2, t10 v3). A voice never
   turns on in the native player. Independent of tempo.
4. Once gliders + ballblaser are 0 mismatches on `probe-lockstep-poll`: re-point
   `emit-note-timeline-golden.ts` to per-tick sampling, regenerate the golden,
   set `golden[i] == native i`, assert byte-exact, un-`skip`, wire into `test:ci`
   glob (`package.json` ~line 30) as a fails-on-revert gate.
5. Then arp/drin BSS, then Phase 4 playback.

## Critical references

- `src/engine/suntronic/SunTronicPlayer.ts` — vibrato fix LOCAL (see Bug 1).
  Header still describes the (wrong) two-clock model — UPDATE it to single-clock +
  fractional-tempo when Bug 2 lands.
- `tools/suntronic-re/probe-lockstep-poll.ts` — THE oracle (miss-proof per-tick
  dual dump + mismatch count). `probe-double-positions.ts` — row-tempo pattern.
  `probe-clockcount.ts` — single-clock proof. `probe-lockstep-clean.ts` — $15-gated
  per-tick capture from frame 0.
- Voice struct stride 0x1ba: `$08` acc(u16), `$0c` vol, `$14` flags(0x01 active/
  0xff-0xfe inert), `$15` outVolume, `$20` period(word), `$24` vibPhase(s16),
  `$26` vibIndex, `$2c/$2d/$2e` tempo counters, `$30` speed, `$31` rowsPerPos.
- Golden test `sunTronicNoteTimeline.golden.test.ts` still `describe.skip`, NOT in
  test:ci. Scratch: `scratchpad/formula.ts` (period numeric proof), `rows.ts`,
  `nat.ts`. `scratch-calc3.bin` = transient disasm dump (disposable).

## Guardrails (unchanged)

- Do NOT push without explicit user auth. This session: NOT authorized → all LOCAL.
- Do NOT wire a non-byte-exact golden into `test:ci` — stays `describe.skip` until
  gliders+ballblaser hit 0 mismatches.
- Wasm-free committed goldens only (CI has no UADE-WASM).
- Every fix ships a fails-on-revert regression in `test:ci`.
- Probes live under `tools/suntronic-re/` (relative `../../src/...` imports, `@/`
  breaks). Do NOT guess tempo constants — read them from the disasm/artifact.
