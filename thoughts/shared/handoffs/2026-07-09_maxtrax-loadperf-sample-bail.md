---
date: 2026-07-09
topic: maxtrax-loadperf-sample-bail
tags: [maxtrax, wasm, transpiler, loadperf, silent-playback]
status: draft
---

# MaxTrax WASM — LoadPerf never links samples (NoteOn bails patch_Sample==0)

## Task

Make MaxTrax WASM player (transpiled max.asm → C → Emscripten) play audio.
antmusic.mxtx silent. Pipeline runs end-to-end (InitMusic → LoadPerf →
SelectScore → PlaySong → vblank@50Hz → MusicServer → NoteOn) but BeginIO=0
(Paula never written, no voice starts). darkseed (00).mxtx separately crashed
"table index out of bounds" in LoadPerf earlier — retest after this fix.

## Root cause (localized this session)

NoteOn is entered every note but bails at the `patch_Sample` check.
Confirmed via `[NoteOn-entry]` probe (build v4):

```
[NoteOn-entry] chan=5464 chan_Patch=3866 patch_Sample=0 vol=88
```

- `chan_Patch` = valid patch ptr (3866, 3690, 3800...). GOOD.
- `patch_Sample` = 0 for EVERY patch. This is the UnloadPerf-cleared state
  (`clr.l patch_Sample(a2)` at asm 2670 / maxtrax.c:8891). Never reassigned.
- NoteOn asm 658 `tst.l patch_Sample(a5); no sample, exit` → bails to .l98/.l99
  before any BEGINIO. That is why BeginIO=0.

So the real bug is upstream: **LoadPerf never links sample pointers into the
patch table.** patch_Sample is written ONLY at asm 2985
(maxtrax.c:9926, `move.l d6,patch_Sample(a5)`) inside the sample-load loop.

## The anomaly to chase next (KEY)

Build v4 test of antmusic showed LoadPerf did **23 ReadFunc calls (ptr=2) +
1 CloseFunc (ptr=1) + "LoadPerf done"**, but the sample-section probes
(`[LP] numsamples` in l76, `[LP] AllocSample` in l9, `[LP] SCORE-ONLY` in l80)
NEVER fired. Meaning LoadPerf exited WITHOUT ever reaching the sample section
(l2 → l76 → l5 → l6 → l9). Not even the score-only skip (l80).

Only 3 CloseFunc sites exist in LoadPerf:
- l5 (maxtrax.c:10042) — AFTER samples (requires l76 first) → impossible here
- l80 (maxtrax.c:10113) — score-only skip → probe would have fired, didn't
- l98 (maxtrax.c:10144) — ERROR path

Therefore the Close is almost certainly **l98 (error)** — a CheckRead failed
(bytes read != requested → BNE .l98) somewhere in the score loop, OR AllocMem
failed (l4 asm 9484). LoadPerf returns d0=0 (fail) but the harness ignores the
return value and continues, so playback proceeds with an unlinked patch table.

Read-count math: magic(1) + tempo(1) + numscores(1) + 2×N_scores. 23 reads →
~10 scores read OK, then died at read #24 region OR l2 fall-through diverted.
Must confirm with v5 probes.

## v5 probes added (built + deployed, NOT yet tested — test interrupted)

Build banner now `fallthrough-v5`. Added to maxtrax.c:
- `[LP] numscores d5=.. d4(mode)=..` at l73 (after num-scores read, ~9350)
- `[LP] l2 scoreloop DONE, d4=.. PERF_SCORE=..` at l2 fall-through (~9563)
- `[LP] ERROR l98 (read/alloc failed) d3=.. d0=..` at l98 entry (10127)
- (v4, still present) `[LP] numsamples d5=..` at l76 (9616 area)
- (v4) `[LP] AllocSample d6=.. a3=.. a5=..` at l9 (9911 area)
- (v4) `[LP] SCORE-ONLY skip (l80) d4=..` at l80 entry

deployed: `cp maxtrax-wasm/build/Maxtrax.{js,wasm} public/maxtrax/` (run from
REPO ROOT — build dir cwd persists across Bash calls, relative cp fails).

## NEXT STEP (resume here)

1. Reopen browser `open http://localhost:5174`, `hard_reload`, wait ~8s,
   `unlock_audio`, `clear_console_errors`, `load_file antmusic.mxtx`, `play`,
   wait ~5s, `get_console_errors`.
2. Read the v5 `[LP]` lines:
   - If `[LP] ERROR l98` fires → which read failed (d3=requested, d0=actual).
     Map back to the score-loop CheckRead (l70 magic / l71 tempo / l73 numscores
     / l74 score header / l75 score data) or AllocMem (l4).
   - If `[LP] l2 scoreloop DONE` fires but `[LP] numsamples` does NOT → the
     PERF_SCORE branch is mis-transpiled (check the CMP.W/BEQ at 9564-9572).
   - `d4(mode)` MUST be 0 (PERF_ALL). If d4 != 0, mode arg got clobbered —
     harness passes d0=0 before LoadPerf() (maxtrax_harness.c:466); LoadPerf
     public entry does `move.w d0,d4`. Check maxtrax.c LoadPerf (9065) sets d4.
3. Likely a transpiler bug (another dropped fallthrough, or a CheckRead/DBRA
   miscompile, or ReadFunc returning wrong byte count). Fix root cause in the C
   (hand-patch) then trace the transpiler defect for later.

## Suspect: ReadFunc byte-count contract

CheckRead compares `d3` (requested bytes) == `d0` (returned). If the emulated
`mxtx_ReadFunc` (maxtrax_harness.c) returns something other than the byte count
in d0 (e.g. returns 0 on success, or count in a different reg), EVERY CheckRead
after the first mismatch → l98. Verify mxtx_ReadFunc sets d0 = bytes read.
The score loop reading fine for 23 calls then dying argues against a blanket
contract bug, but a size-specific or EOF-boundary case is plausible. Check what
mxtx_ReadFunc returns when asked to read past the 81740-byte file, and whether
the last score's data read overruns.

## Constraints (binding)

- DO NOT regenerate maxtrax.c — hand-patched (MOVEQ fix line 4179, 15
  fallthrough tail calls, all probes).
- Never `git add -A`/`.`; commit specific files by name; no generated files
  unless asked; no `--no-verify`.
- `npm run type-check` after any TS change.
- MCP + real Chrome only, never Playwright. No speculative WASM/audio changes.
- Work in main, commit+push to main, no PRs.
- MCP sleep >~8 blocked: use `until false; do break; done; sleep 8`.
- Native (non-WASM) test invalid (32-bit vs 64-bit host malloc).

## Cleanup owed AFTER audio works

- Remove ALL temp fprintf from maxtrax.c ([chain], [NoteOn-entry], all [LP])
  and harness banner.
- Remove MaxTraxEngine.ts console.error traces (lines 101, 103).
- Fix wasmActive=false position store (call useWasmPositionStore.setPosition()).
- Update stale maxtraxParser.test.ts.
- Commit specific files by name + push main.

## Critical references

- maxtrax.c LoadPerf: entry 9065; score loop l3=9356 / l74=9378 / l4=9466 /
  l75=9538 / l2=9560; PERF_SCORE check 9564; sample loop l76=9593 / l6=9620 /
  l78=9643 / l9=9878 / patch_Sample write 9926; l5=10021 (Close after samples);
  l80=10094 (score-only); l98=10126 (error Close); l99=10076.
- NoteOn: main body ~4339; entry probe ~4372; patch_Sample tst 4366; asm bail
  ref max.asm:658.
- max.asm LoadPerf 2740-3020; patch_Sample set 2985; UnloadPerf clear 2670.
- maxtrax_harness.c: LoadPerf call 464-468 (a0=name, d0=0=mode); mxtx_ReadFunc
  impl (grep ReadFunc); ds_init banner 440.
- PERF_ALL=0 PERF_SCORE=1 PERF_SAMPLES=2 (driver.i:289).
- MaxTraxEngine.ts getLoaderConfig workletCacheBust:true (no stale wasm).

## Prior handoff

thoughts/shared/handoffs/2026-07-08_maxtrax-transpile-port.md (Phase 1 transpile
complete). This session = Phase 2 debug, localized silence to LoadPerf sample
linking.
