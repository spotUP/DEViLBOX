---
date: 2026-07-14
topic: suntronic-gate2-tempo-disproven
tags: [suntronic, gate2, native-port, uade, tempo, note-timing]
status: final
---

# SunTronic V1.3 Gate-2 — row cadence is 5-mostly-6, not flat-6; mechanism one layer undecoded

Supersedes `2026-07-14_suntronic-gate2-vibrato-solved.md`. **The "fractional
6.25 ticks/row (7,6,6,6)" root cause in that handoff is WRONG — discard it.**
**Also correct the earlier framing in this file's own history: the "note one tick
late" is a SYMPTOM of a row-length mismatch, not an ordering bug** (see below).
The vibrato-continuation fix (commit `348d3386a`, pushed) still stands: gliders
v0 is byte-exact t0-t10 and the regression test passes / fails-on-revert.

Probes for the corrected model committed `e6cfce43f` (`probe-count-15-per-row.ts`,
`probe-speed-per-row.ts`, `probe-count-ticks-per-row.ts`, + supporting).

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

## The real bug — native rows are flat-6, UADE rows are 5-mostly-6 (ROOT CAUSE, measured)

The "note one tick late" symptom is NOT an ordering bug — it is progressive drift
from a row-length mismatch. Jitter-free measurement this session (2026-07-14, late):

- `probe-count-15-per-row.ts` — counts `$15` writes (EFFECTS runs once/voice/tick,
  no double-write artifact) between `$2d` increments. **Rows are 5 handler-ticks
  mostly, 6 periodically** (6-tick rows at `$2d`-index 0,6,11,17...). Clean, no
  jitter, and **gliders == ballblaser byte-identical** cadence → song-independent,
  intrinsic to the timer.
- `probe-speed-per-row.ts` — reads `$30/$34` at every row boundary: `$30(speed)=6`
  STATIC, `$34(delay)=0` always, `$2e(pos)=0` (position doesn't advance in the
  window — GNN re-reads the track each row). Sample gaps: `5120 (=5×1024)` mostly,
  `6144 (=6×1024)` on the periodic rows. Handler period uniformly **1024
  samples/tick**.
- Global groove blocks confirmed inert: `$a8a`=0 (block at `0x2660e` skipped),
  `$a9e`=0 (block at `0x26644` skipped) — `probe-groove.ts`.

Native `tick()` does flat 6-tick rows → every row 6144 samples → it runs slow, so
note changes arrive progressively late (ballblaser row-2 note lands one tick behind
at first, worse later). Fixing the row cadence to 5-mostly-6 is the root fix; the
±1-3 vibrato-period rounding is secondary.

## The mechanism — two-clock reconciliation in UADE's interrupt rate (module decode exhausted)

Static disasm of the tempo counter is now exhaustive and reads as **6-tick rows
unconditionally**, contradicting the measured 5:

```
0x2667a addq.b #1,$2c          ; $2c++  (every tick, per voice)
0x2667e move.b $2c,d0
0x26682 cmp.b  $30,d0          ; $30 = 6 (static)
0x26686 bmi    $266ce          ; $2c < 6  -> EFFECTS only (no wrap)  = non-wrap tick
0x26688 clr.b  $2c             ; $2c >= 6 -> clr to 0
0x2668c addq.b #1,$2d          ;            $2d++  (row boundary)
        ... GNN (0x2692a), EFFECTS (0x267f6)
```

`$2c` is written ONLY here (`addq`) and by the `clr→0`. With `clr→0` + wrap-at-6,
a row is 0→1→2→3→4→5→6 = **6 ticks**, always. To get the measured 5-tick row, `$2c`
must either start at 1 after a wrap (i.e. something reloads `$2c=1`) or the compare
must effectively be vs 5. Neither is in: the wrap block (`0x26688`-`0x266f6`), the
GNN normal-note path (`0x26970`-`0x26a12`), the note-tail, or the EFFECTS head
(`0x267f6`+, first 40 insns) — all disassembled this session, none write `$2c`.

**RESOLVED — the mechanism is NOT in the module 68k (decode exhausted, commit
`af020fd86`).** Disassembled every path that touches or could touch `$2c`: the
tempo block, the wrap/GNN-call flow, the GNN normal-note path, the note-tail, the
EFFECTS head, AND all 18 GNN jump-table command handlers (`0x26a16`-`0x26be4`,
table@`0x2694c`, word offsets off a6=`0x264dc`). **None write `$2c`.** The GNN-
handler-pre-loads-`$2c` hypothesis is disproven.

Two more nails (both songs, jitter-free):
- `probe-tick-rate.ts` — `$15` (EFFECTS, once/tick) fires at EXACTLY 1024-sample
  gaps, 39/39 uniform. Tick is genuinely 1024; 882/vblank hypothesis also dead.
- `probe-2c-seq-1024.ts` — `$2c` at 1024-tick granularity: 6-tick row 0 (`$2c`
  0..5) then 5-tick rows (`$2c` 1..5, no leading 0). Static logic can only produce
  the 6-tick form.

So the 5-mostly-6 cadence **originates in UADE's CIA/interrupt scheduling**, not the
module. Mean row = 5.17 ticks = 6×882/1024 — the module is timed for a 50Hz
(882-sample) player-tick but UADE drives EFFECTS at the 1024-sample audio-buffer
rate; the row advance reconciles the two clocks (Bresenham 5-mostly-6). The
two-clock model disproven in this file's earlier history was directionally right —
it just lives in the interrupt rate, not in `$2c`/`$30`.

**Fork for the next session (needs a decision):**
1. **Model + validate the measured cadence** (recommended). Reproduce the two-clock
   reconciliation in `tick()` — a fractional accumulator advancing 1024/882 per
   audio-tick, wrap a row every 6 module-ticks — and VALIDATE byte-exact against the
   UADE-generated golden across both songs / 40+ ticks. This is not a band-aid: the
   golden IS the reference, and the 1024↔882 ratio is measured, not guessed. If it
   goes byte-exact it is correct by construction.
2. **Instrument UADE's CIA/interrupt scheduler** to read the exact timer period the
   SunTronic eagleplayer programs. Confirms (1)'s constant from first principles but
   is a much larger dig into UADE internals for a constant the oracle already lets us
   validate empirically. Disproportionate unless (1) fails to hit byte-exact.

Do NOT hardcode a literal `5,5,5,5,5,6` table — express it as the 1024/882 fractional
accumulator so it generalizes to other SunTronic modules with different `$30`.

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
