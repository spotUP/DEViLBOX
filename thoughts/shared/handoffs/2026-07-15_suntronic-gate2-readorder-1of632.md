---
date: 2026-07-15
topic: suntronic-gate2-readorder
tags: [suntronic, gate2, native-player, byte-exact]
status: in-progress
---

# SunTronic Gate-2 — wrap read-order fix, 1/632 residual

## Task
Make `src/engine/suntronic/SunTronicPlayer.ts` byte-exact vs the UADE-WASM oracle
(Gate 2) on BOTH pilot songs (gliders.src, ballblaser.src), then un-skip
`sunTronicNoteTimeline.golden.test.ts`.

## Status: gliders 0/316 byte-exact, ballblaser 1/316 (commit `c86b6fff5`)

Down from 12/632 (the old 883.73 while-accumulator). Two independent wins this session:

1. **Double-position clock** (already in place, kept): `tick()` fires one base
   `stepAll()` per 1024-sample bucket + one EXTRA step at bucket `round(doubleK*di)`,
   di = ciaTick/(audioTick−ciaTick) = 6.25 exactly (ciaTick 882.759 = 1024*25/29).
   NO hardcoded table. Nails gliders 0/316. A floor accumulator gives gliders 7/316
   (tested + reverted); the physical while-accumulator gave 3/316.

2. **Wrap read-order fix** (this commit, root cause): the eagleplayer decodes ALL
   `rowsPerPos` (16) note-stream groups of a position — including the final bare-0x00
   hold group (g15) — before the tempo counter advances to the next position.
   `stepAll()` had loaded the next position on the SAME tick it wrapped (reading 15 of
   16 groups), firing the next position's note one row early (ballblaser t78/t79). Fix:
   `getNextNote(v)` FIRST, THEN advance position (SunTronicPlayer.ts ~443-458). Also
   wired `rowsPerPos` from `score.rowsPerPositionDefault & 0xff` ($31 init opcode = 16)
   instead of hardcoding 0x10. ballblaser 5/316 → 1/316.

## Remaining residual: t12 v0 (bounded, disclosed)
dP−5 at one cell. Golden's k=2 double player-step lands at bucket 12; the double-
position schedule `round(2*6.25)=13` lands at bucket 13 → v0's fast vibrato sampled one
fire early for a single bucket, self-corrects at t13. gliders needs the double at 13,
ballblaser at 12, at the SAME ciaTick=882.759 — mutually exclusive for one deterministic
clock. CIA sweep (882.759 optimal for both), floor accumulator, and extraVib all tested
and rejected. NOT reachable without hardcoding the oracle → the two golden captures
differ by one fire in sub-bucket phase.

## Critical references
- `src/engine/suntronic/SunTronicPlayer.ts` — `tick()` ~471 (double-position clock),
  `stepAll()` ~430-460 (wrap read-order), ctor ~197 (rowsPerPos wiring).
- `src/engine/suntronic/__tests__/sunTronicGlidersTimeline.test.ts` — byte-exact 0/316.
- `src/engine/suntronic/__tests__/sunTronicBallblaserTimeline.test.ts` — NEW, asserts
  exact residual set `{t12 v0}`; both now in the `test:ci` glob (package.json line 30).
- `thoughts/shared/research/2026-07-14_suntronic-gate2-note-timing.md` — disasm.

## Next steps
1. **GATED (needs user auth + own plan phase):** reach 0/0 via the uade-3.05 vblank/CIA
   C-spike — read the real per-fire boundaries from `third-party/uade-3.05`'s
   cycle-accurate scheduler, feed them into the same double-position machine (replace
   the constant `round(k*di)` with derived boundaries). Hardcoding the oracle schedule
   is FORBIDDEN. Do NOT start autonomously.
2. Once 0/0: un-skip `sunTronicNoteTimeline.golden.test.ts`, wire into test:ci.
3. Phase 4 native playback; then ~20 other formats.

## Notes
- Scratch probes under `tools/suntronic-re/` (untracked): probe-stream-groups.ts
  (decisive — 16 groups/position), probe-t12-vib.ts, probe-floor-schedule.ts,
  probe-cia-sweep2.ts. Committed: probe-player-golden.ts, probe-measured-schedule.ts.
- Both new/edited tests are WASM-free and fails-on-revert verified.
