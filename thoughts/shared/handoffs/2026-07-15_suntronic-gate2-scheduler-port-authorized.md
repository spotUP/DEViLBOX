---
date: 2026-07-15
topic: suntronic-gate2-scheduler-port-authorized
tags: [suntronic, gate2, uade, cia, paula, vblank, native-player, byte-exact, scheduler-port]
status: draft
---

# SunTronic Gate-2 — UADE scheduler port AUTHORIZED (research phase, fresh start)

## Where we are (one line)
Shipped `SunTronicPlayer.ts` = **1/632** (gliders 0/316 byte-exact, ballblaser 1/316,
residual `t12 v0`). User **authorized the full UADE cycle-accurate scheduler port** to
chase the last cell: *"i authorize the larger UADE-scheduler port to chase the last
cell."* This is a research→plan→implement effort. This session did the analyze-first
groundwork only — NO port code, NO spike code written yet. State is clean.

## The task
Make the note timeline byte-exact vs the UADE-WASM oracle on BOTH songs (0/632), then
un-skip `sunTronicNoteTimeline.golden.test.ts`, wire into test:ci (WASM-free), update
ballblaser test `{t12 v0}`→empty, ship JS-only. Later: arp/drin BSS port, Phase 4
native playback, ~20 other formats.

## What is already DECISIVELY known (prior spike, 2026-07-15e — do NOT re-measure)
Two genuinely independent clocks (measured via reverted UADE-WASM fire-log spike):
- **EFFECTS/vibrato clock** = clean PAL vblank float, P_v ≈ **880.57** samples/fire
  (44100/50.08), deltas alternate 880/881. **Shared** across both songs. Drives
  $20/$24 vibrato+period.
- **Note-handler clock** = independent, fit T_a ≈ **1024.8** shared, but non-integer
  ratio to P_v (note fires NOT a subset of vblanks) + large per-row residual
  (rms ≈ 156, max ≈ 371 samples). Row deltas: 880,1276,884,883,985,1024,1113,1292,…
- **CIA-A Timer-A fires = ZERO** — `uade_wasm_on_cia_a_tick` never fires for these
  modules. Note handler is NOT CIA-A-driven. **Driver still UNIDENTIFIED.**
- **Per-song relative phase**: first vblank offset gliders φ_v=355, ballblaser φ_v=881.
  Sets which note-row gets the vibrato "double" (gliders rows 0,7,13,19; ballblaser
  5,12,18). Set by eagleplayer INIT cycle count = **unread module state, NOT
  score-derivable.**
- No shared-constant closed-form accumulator reaches 0/0 (best 7–11 > shipped 1/632).
  Bresenham two-fixed-period sweep repro kept: `tools/suntronic-re/sweep-clock.ts`.

## THE central hypothesis to test next (NOT yet measured)
**Note clock = Paula audio interrupt (per-channel DMA-completion IRQ), period = the
currently-playing sample's DMA length.** If true, the note-clock "jitter" is NOT noise —
it is deterministic from instrument sample lengths, which live in the SCORE. That would
make the note clock **score-derivable** (simulate Paula DMA completion per instrument
sample length) and collapse the whole problem: the port becomes a Paula-DMA note clock +
the P_v vblank EFFECTS clock + one per-module φ_v.

Evidence pointer: `third-party/uade-3.05/src/audio.c:407` `INTREQ(0x8000|(0x80<<nr))`
raises the per-channel audio IRQ on DMA completion (also :453, :489, :722). This is the
classic note-clock driver for sample-based Amiga replayers.

## THE decisive experiment (design — run this first in the fresh session)
ONE comprehensive UADE-WASM fire-log spike answers driver-ID AND kills chunk
quantization in a single measurement:

1. Spike logs a ring of `(sampleOffset:u32, src:u8)` at EVERY interrupt source, tagged:
   - `1` = vblank (`CIA_vsync_handler`, cia.c:265)
   - `2` = CIA-B Timer A overflow (bovfla, cia.c:164-173) — NO hook yet, add one
   - `3` = CIA-B Timer B overflow (bovflb, cia.c:164-173) — NO hook yet
   - `4` = CIA-A Timer B overflow (aovflb, cia.c:130ish) — NO hook yet
   - `5..8` = audio channel 0..3 IRQ raise (audio.c:407 / :453 / :489 / :722)
   - sample counter lives in `write_left_right` (audio.c ~224/231) — same pattern as
     prior spike.
2. Probe under `tools/suntronic-re/` renders gliders.src + ballblaser.src, dumps the log.
3. **Match** each src's fire-offset sequence against the measured note-row times
   (gliders rows ≈ 1236,2116,3392,4276,5159,6144…). The src that aligns = the note
   driver, and its exact offsets ARE the unquantized note-row times.
4. **Test the hypothesis**: correlate note-row interval with the DMA length of the
   sample playing on the driving channel (sample length from the score instruments). If
   interval == sampleLen/period relationship → score-derivable → port is tractable.
5. **Decisive 0/0 check**: with EXACT note-row times + exact φ_v + P_v=880.57, compute
   EFFECTS-per-row = `floor((rowEnd−φ_v)/P_v)−floor((rowStart−φ_v)/P_v)`, inject as
   `subtickSchedule` (SunTronicPlayer.tick line 472) → does it hit 0/0 BOTH songs? If
   yes → port = simulate note clock + carry φ_v + P_v. If no → deeper interleave model.

## φ_v: derivable or carrier?
φ_v is the ONE per-module physical constant not in the score. Two legitimate options:
(a) derive it if the eagleplayer INIT cycle count turns out computable, or (b) store it
as a per-module import-time carrier — read ONCE from the oracle at import, survives
editing — exactly like the blockRawBytes carriers used for every other UADE format.
Option (b) is NOT the forbidden "bake the oracle schedule" (that was the full per-bucket
fire table); it is one scalar per module. Confirm which is needed AFTER step 5.

## HARD constraints (carry verbatim)
- NO hardcoded band-aid — express fix as a clock accumulator. Baking the oracle
  greedy/per-bucket SCHEDULE is FORBIDDEN. One physical constant per module read from
  the artifact = legitimate carrier, distinct from that.
- Do NOT guess tempo/constants — read from disasm/artifact/probe.
- Golden test stays `describe.skip` until 0/0 BOTH songs. WASM-free committed
  goldens/tests only. Every fix ships a fails-on-revert test:ci regression.
- Probes under `tools/suntronic-re/` use relative `../../src/` imports (`@/` breaks
  under tsx from scratchpad).
- **NEVER commit/touch pre-existing dirty files**: submodules incl `third-party/uade-3.05`,
  `public/uade/UADE.{js,wasm}`, `.serena`, changelog, sonix handoff, asm68k output, song
  fixtures. If the spike needs them, BACK UP + RESTORE + CHECKSUM-VERIFY.
- Never `git add -A`/`.` — add specific files by name. Never skip pre-commit hooks.
  Destructive git ops need explicit approval + save first. Push only when user asks
  (autonomous committing OK).
- `npm run type-check` (`tsc -b --force`) mandatory before task complete.
- **The C-spike is TEMPORARY. Shipped fix is JS-only.** After measuring, revert ALL
  C/build.sh/WASM edits and restore public/uade by checksum. Do NOT commit instrumented
  WASM/submodule/build.sh.
- CAVEMAN MODE full (terse prose; code/commits/PRs normal). Commit messages end:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Spike infrastructure (ready to reuse)
- **Backup**: `/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/0ca21f23-4a28-442e-8df3-b920a16a7c36/scratchpad/uade-backup/`
  holds pristine `UADE.{js,wasm}` + `orig.sha`.
- **Current public/uade (correct pre-spike dirty state, verified)**:
  js `cc3a153a7a60c0ca075a981c72dff3b1ab7763c8`, wasm `520744b431d57c6e8eaf9afe71ee61f52539d4cc`.
  RESTORE to exactly these after the spike.
- Prior spike touched: `uade-wasm/src/entry.c` (fire-log ring + on_sample/on_vsync +
  getter), `third-party/uade-3.05/src/audio.c` (write_left_right counter),
  `src/cia.c` (CIA_vsync_handler hook — this session found CIA-B/CIA-A-TimerB have NO
  hook, add them), `uade-wasm/build.sh` (EXPORTED_FUNCTIONS, line ~182). Rebuild via
  `uade-wasm/build.sh`.
- Emitter note-PC detection (from deleted `probe-golden-offsets`): handler PC
  gliders=0x2660e, ballblaser=0x2560a (or 0x2560a; verify). Chunk render + get_capture.
  NOTE: the new spike's interrupt-src match REPLACES PC-chunk detection for exact times.

## Key files
- `src/engine/suntronic/SunTronicPlayer.ts` — double-position model (tick ~471:
  `stepAll()` + extra step at `tickIndex===Math.round(this.doubleK*di)`, di=6.25,
  ciaTick=882.759). `subtickSchedule` inject hook at tick():472. gliders 0/316,
  ballblaser 1/316. UNCHANGED — do not touch until port design is proven.
- `src/engine/suntronic/__tests__/sunTronicGlidersTimeline.test.ts` — 0/316, green, in test:ci.
- `src/engine/suntronic/__tests__/sunTronicBallblaserTimeline.test.ts` — asserts residual
  `{t12 v0}`, green, in test:ci. Update to empty at 0/0.
- `src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.test.ts` — `describe.skip`
  until 0/0.
- `sunTronicNoteTimeline.golden.json` — 80 rows/module; `acc` = note-level pitch
  accumulator (too coarse for per-fire vibrato; use sample offsets instead).
- `tools/suntronic-re/suntronicLib.ts` — CORPUS_DIR, addCompanions, loadInstrCompanions,
  parseHunks; `parseSunTronicV13Score` from `../../src/lib/import/formats/SunTronicV13`.
- `tools/suntronic-re/sweep-clock.ts` — WASM-free negative-result repro (kept, committed).
- Disasm addrs + UADE capture ABI: memory `project_suntronic_gate1_calc14`.

## Next steps (ordered, fresh session)
1. Re-establish the comprehensive interrupt-src fire-log spike (back up public/uade
   first). Add CIA-B TimerA/B + CIA-A TimerB hooks (cia.c) + audio-ch IRQ hooks
   (audio.c). Rebuild.
2. Run the decisive experiment steps 3–5 above. Identify the note driver; test the
   audio-DMA-length hypothesis.
3. Revert ALL spike edits, restore public/uade by checksum.
4. If hypothesis holds → write the port plan `thoughts/shared/plans/`, then implement a
   JS Paula-DMA note clock + P_v EFFECTS clock + φ_v carrier. If not → reassess whether
   0/0 is reachable WASM-free at all (may need to re-recommend accepting 1/632).
5. At 0/0: un-skip golden test + wire test:ci + fails-on-revert; ballblaser test → empty.

## Artifacts
- Prior fallback handoff: `thoughts/shared/handoffs/2026-07-15_suntronic-gate2-cia-spike-fallback.md`.
- Plan (fallback branch hit): `thoughts/shared/plans/2026-07-15-suntronic-gate2-cia-spike.md`.
- Memory: `project_suntronic_gate2_two_clock`, `project_suntronic_gate1_calc14`.
