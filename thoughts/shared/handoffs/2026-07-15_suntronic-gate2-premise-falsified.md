---
date: 2026-07-15
topic: suntronic-gate2-cia-scheduler-premise-falsified
tags: [suntronic, gate2, native-port, uade, vibrato, regression]
status: final
---

# SunTronic Gate-2 — CIA-scheduler premise FALSIFIED; committed player REGRESSED

> **SUPERSEDED 2026-07-15 by `2026-07-15_suntronic-gate2-twoclock-reconfirmed.md`.**
> This handoff is WRONG. Its "one clock, constant 1024, no second clock" claim came
> from measuring `$24` only at fire boundaries — it missed the twice-per-bucket
> advances. `probe-pc-control.ts` proves 29 `$24`-advances over 26 fires → doubles
> are real → the two-clock model is CORRECT. Do NOT follow the "restore single-clock"
> path below. Kept for the audit trail only.

## The hard truth

The committed `SunTronicPlayer` regressed into a **phantom two-clock model** and a
whole session (`586ef82b9`→`9f7388871`) was spent "proving" a 97.8% wall that does
not exist. Direct whole-song measurement this session kills it:

- **One clock, constant 1024 samples/tick.** `probe-fullsong-fires.ts`: gliders
  661/661 inter-fire gaps = exactly 1024, ballblaser 330/330 = 1024, ZERO variance.
  `probe-fire-eclock.ts`: note-fetch PC and `$24` vibrato update are lockstep at the
  same sample indices. CIA-A Timer-A never fires (`tick_count=0`). NOT 881.5, NOT 882.
- So there is NO sub-fire jitter, NO CIA scheduler to port, NO second clock. The
  approved plan `plans/2026-07-15-suntronic-cia-scheduler-port.md` is SUPERSEDED
  (marked so). Research corrected: `research/2026-07-15_uade-cia-scheduler.md` §9.

## Git lineage of the regression

- `348d3386a fix: vibrato double-advance on continuation note-rows` — the GOOD
  single-clock fix (matches `handoffs/2026-07-14_suntronic-gate2-vibrato-solved.md`).
- `d3d42ef78 feat: two-clock CIA vibrato model` — REPLACED it with the phantom
  `ciaTick=881.5` `moduleTicks` accumulator (an attempt to *approximate* the
  fractional row tempo via a fake second clock).
- `586ef82b9`, `97ba09897`, `46f0ebf56`, `9f7388871` — all chasing the phantom wall.

Current `tick()` calls `stepEffects(v, moduleTicks)` (two-clock) and IGNORES
`getNextNote`'s bool return (a vestige of the good fix).

## Where the residual actually lives (measured, not theorized)

`probe-native-vs-golden.ts` (committed 881.5 player) = 130/316 mismatches gliders.
Instrumented `stepEffects` (temp `_dbg`, reverted) on v0 held note:
- `freqEnvSpeed=0x1f40` (8000/tick), `vibDepth=[20,10]`, `freqEnvLen=1 loop=0` →
  `vibIndex` frozen at 0, depth always 20. Native emits a symmetric triangle from
  `|vibPhase|-0x4000`; golden's steps are NON-uniform (a −4 where native has −2).
- A constant vibrato phase-offset fit over 79 ticks floors at **62/79** → it is NOT
  a phase/timing offset. The vibrato WAVEFORM SHAPE and/or the continuation-double
  cadence is what differs.

This is exactly the two open bugs the 2026-07-14 vibrato-solved handoff named.

## RESURRECTION PATH (next phase — the fix)

Do NOT re-derive; `handoffs/2026-07-14_suntronic-gate2-vibrato-solved.md` is the map.
Order:

1. **Restore the single-clock `tick()`** (revert the `d3d42ef78` two-clock body):
   one `tick()` per fire; delete the `ciaTick`/`rowPhase`/`subtickSchedule`/
   `rowSampleAcc` apparatus and the two-clock header comment (`SunTronicPlayer.ts:14-50,
   424-458`). Row counter advances once per tick.
2. **Restore Bug-1 vibrato-double** (`348d3386a`): `const cont = runGNN &&
   !this.getNextNote(v) && !!v.instr; this.stepEffects(v, cont)`; `stepEffects(v,
   extraVib)` calls `advanceVib` ONCE before the period compute when `extraVib`, plus
   the normal trailing advance. (Proven at gliders t6: compute at `-9536` → 252 == UADE.)
3. **Bug 2 — fractional row tempo 6.25 ticks/row** (rows run 7,6,6,6 not flat 6).
   Doubles at gliders `[5,12,18,24,30,37,43,49,55,62]`, gaps `[7,6,6,6,7,…]`. READ
   the fractional constant from the disasm — do NOT guess. Sources: replayer source
   `third-party/uade-3.05/amigasrc/players/suntronic/suntronic_mod.asm`; tempo
   counters `$2c/$2d/$2e` at ~0x2667a-0x266a2; suspects opcodes `0x8e` (CIA tempo
   word) / `0x8d` (tempo slide) currently ignored in `controlOpcode`.
4. **Bug 3 — voice-activation**: v2 sounds golden t4 native t6, v3 similar; some
   voices' `noteOn` fires a row late. Independent of tempo.
5. Reach 0/0 on both songs → un-`skip` `sunTronicNoteTimeline.golden.test.ts`, wire
   into `test:ci` (WASM-free), fails-on-revert. Then arp/drin BSS, then Phase 4 playback.

## Guardrails (unchanged)

- Push only on explicit user auth. Golden stays `describe.skip` until 0/0.
- WASM-free committed goldens only. Every fix ships a fails-on-revert test:ci regression.
- Probes under `tools/suntronic-re/` (relative `../../src/…` imports; `@/` breaks under tsx).
- Do NOT guess tempo constants — read from disasm/artifact. No hardcoded oracle schedule.
- Pre-commit runs full test:ci (~2min), flakes under CPU load (ECONNREFUSED :3000 /
  1 harness file) — retry, never `--no-verify`.

## Artifacts this session (committed)

- `research/2026-07-15_uade-cia-scheduler.md` §9 (corrected), plan marked SUPERSEDED.
- New probes `tools/suntronic-re/{probe-fullsong-fires,probe-native-vs-golden}.ts`.
- Commit: "docs(suntronic): Gate-2 CIA-scheduler premise FALSIFIED — residual is per-tick arithmetic".
