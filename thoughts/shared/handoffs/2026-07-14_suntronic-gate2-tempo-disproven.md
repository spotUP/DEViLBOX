---
date: 2026-07-14
topic: suntronic-gate2-tempo-disproven
tags: [suntronic, gate2, native-port, uade, tempo, note-timing]
status: final
---

# SunTronic V1.3 Gate-2 — fractional-tempo theory DISPROVEN, note-one-tick-late is the real bug

Supersedes `2026-07-14_suntronic-gate2-vibrato-solved.md`. **The "fractional
6.25 ticks/row (7,6,6,6)" root cause in that handoff is WRONG — discard it.**
The vibrato-continuation fix (commit `348d3386a`, pushed) still stands: gliders
v0 is byte-exact t0-t10 and the regression test passes / fails-on-revert.

## What the prior handoff got wrong

**There is no fractional tempo.** Three independent measurements this session:

- `probe-tempo-counters.ts` (reads voice0 `$2c/$2d/$2e/$30/$31` from UADE memory
  each tick): `$30(speed)=6`, `$31(rowsPerPos)=16` — **static, flat 6 ticks/row**.
  `$2c` runs 1,2,3,4,5 then wraps; `$2d` increments once per 6 ticks.
- `probe-clockcount.ts` (FINE=1 isolated latch): `$15`(EFFECTS) AND `$24`(vibrato)
  both fire at **uniform 1024-sample / 42 Hz gaps**. Single clock, confirmed again.
  `$24` fires 20× vs `$15` 21× over the span — the extra `$15` is the note-on tick
  where `$24` is *cleared* (`clr.w $24`) instead of advanced. So the vibrato is
  written ONCE per tick, not twice.
- `probe-noteon-timing.ts` (native side): native rows are clean flat-6
  (tempoNote advances at raw t0/t6/t12), new note `per=710` applied at t12.

The old "7,6,6,6" pattern was an **artifact of the `$24`-poll double-detector**:
`vibΔ=-57536` values are just the s16 sign-wrap of a normal `+8000` advance
(crossing +32767), which the `abs>12000` threshold misread as a double.

## The real bug — note trigger one tick late (CONFIRMED on a clean clock)

Both oracles — `probe-lockstep-poll.ts` (`$24`-gated) and `probe-lockstep-clean.ts`
(`$15`-gated, one clean write per CIA tick) — agree on ballblaser warmup=1:

```
t10 v0: G{p710} N{p1088}     <- UADE new note at tick 10
t11 v0: G{p719} N{p710}      <- native gets the same note one tick later
```

`ballblaser.src` changes note at row-2; UADE applies `p710` at CIA tick 10,
native at tick 11 (== native raw t12, warmup=1). gliders masks this because it is
one sustained note (GNN keeps hitting end-of-group; cursor barely moves), so its
only diffs are small ±1-3 period rounding at later rows + the v3 activation bug.

## The unresolved paradox (decisive next experiment)

`$30=6` (memory) says rows are 6 CIA ticks → UADE row-2 boundary should be at CIA
tick 12, matching native. But the clean `$15`-gated oracle puts UADE's `p710`
first appearance at gold-index 10 (= CIA tick 10 from frame 0), and the gliders
continuation-boundaries sit ~7 clean-ticks apart. **6 (memory) vs ~10/7 (oracle
tick-index) is the contradiction to resolve.** Likely a GNN/EFFECTS *ordering*
issue within a tick or a warmup/first-row-length offset — NOT a speed value.

**Do the one decisive measurement first (analyse-first):** arm the capture on the
GNN-entry PC (loaded `0x2692a`) and on the EFFECTS PC (`0x267f6`) and count how
many EFFECTS passes occur between consecutive GNN fires, indexed to CIA tick from
frame 0. That directly reads ticks-per-row and the exact CIA tick of each note-on
with zero polling ambiguity — resolves the 6-vs-10 paradox and tells you whether
native's GNN fires a tick too late or applies the note a tick too late. Only then
touch `tick()`/`getNextNote` ordering. Do NOT guess a tempo constant — there
isn't one; `$30=6` is confirmed.

## Confirmed secondary bugs (independent of the above)

- **Voice activation** — gliders v3 stays `flags=0xff` (inert) where UADE has
  `0x01` active with a real period (`t10 v3: G{p170} N{p0 fff}`). v2 similar
  earlier. A voice never turns on in the native player. Independent of note timing.
- Small ±1-3 period rounding on gliders v0/v1/v2 at row boundaries (t11/15/16/18/
  20/21/22) — investigate after note timing; may be the same ordering issue.

## Critical references

- `src/engine/suntronic/SunTronicPlayer.ts` — `tick()` (367), `getNextNote` (181,
  returns retrigger bool), `noteOn` (214, clears `$24/$26`, sets flags), `stepEffects`
  (295, reads `v.pitch` set by the PITCH opcode in getNextNote). Header STILL
  describes the wrong two-clock/882 model — rewrite when note-timing lands.
- New probes THIS session (committed): `probe-tempo-counters.ts` (per-tick
  `$2c/$2d/$30` dump — proves flat-6), `probe-noteon-timing.ts` (native note-on
  tick + cursor), `disasm-raw.py` (raw-memory-dump capstone disasm; use with
  `p8a-dump-calc3-bin.ts <mod> <loHex> <hiHex>` then
  `python3.11 tools/suntronic-re/disasm-raw.py scratch-calc3.bin <baseHex>` —
  capstone lives in python3.11 only, NOT python3).
- Oracles: `probe-lockstep-clean.ts` (`$15`-gated, THE clean per-CIA-tick oracle —
  use this, not the `$24`-poll), `probe-clockcount.ts` (single-clock proof),
  `probe-lockstep-poll.ts` (`$24`-poll — has the s16-wrap aliasing, deprecated for
  tick-indexing).
- Tick-handler disasm (gliders, loaded): entry `0x26606`; `bsr $2672c` = Paula
  hardware-write stage (writes `$dff0a0`, NOT tempo); per-voice tempo counters
  `0x2667a`-`0x266a2` (`$2c<$30` → row, `$2d<$31` → position). GNN `0x2692a`,
  EFFECTS `0x267f6`.
- Voice struct stride `0x1ba`: `$08` acc, `$0c` vol, `$14` flags, `$15` outVol,
  `$20` period, `$24` vibPhase, `$26` vibIndex, `$2c/$2d/$2e` tempo, `$30` speed,
  `$31` rowsPerPos, `$37` synthFlag.

## Guardrails (unchanged)

- Push authorized this session ("push and proceed"); `348d3386a` pushed, CI green-
  pending. Future pushes: keep the pre-push hook (type-check + test:ci) — it is
  slow (>2min); if `git push` times out, re-run it (pre-push may already be past).
- Do NOT wire a non-byte-exact golden into `test:ci` — `sunTronicNoteTimeline.golden`
  stays `describe.skip` until gliders+ballblaser hit 0 mismatches on
  `probe-lockstep-clean`.
- Wasm-free committed goldens/tests only (CI has no UADE-WASM). The shipped
  `sunTronicVibratoContinuation.test.ts` loads the tracked `gliders.src` and runs
  the native player only — no WASM.
- Every fix ships a fails-on-revert regression in `test:ci`.
- Probes live under `tools/suntronic-re/` (relative `../../src/...` imports; `@/`
  breaks under tsx). Do NOT guess tempo constants — `$30=6` is measured.
